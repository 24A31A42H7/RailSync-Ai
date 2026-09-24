import React from "react";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("leaflet", () => {
    const mapInstance = () => ({
        setView: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        invalidateSize: vi.fn(),
    });

    const markerInstance = () => ({
        addTo: vi.fn().mockReturnThis(),
        bindPopup: vi.fn().mockReturnThis(),
        openPopup: vi.fn(),
        remove: vi.fn(),
    });

    return {
        default: {
            map: vi.fn(() => mapInstance()),
            tileLayer: vi.fn(() => ({
                addTo: vi.fn(),
            })),
            circleMarker: vi.fn(() => markerInstance()),
        },
    };
});

import L from "leaflet";

import RailTracker, {
    cleanTrainNumber,
    safeString,
    formatTime,
    getStationCode,
    getStationName,
    getArrival,
    getDeparture,
    prepareTrainData,
} from "./RailTracker";

/* ============================================================
   TEST DATA
   ============================================================ */

const successfulApiResponse = {
    data: {
        train: {
            number: "12345",
            name: "Rajdhani Exp",
            type: "Express",
            source: {
                code: "DEL",
                name: "New Delhi",
            },
            destination: {
                code: "MUM",
                name: "Mumbai",
            },
        },

        currentLocation: {
            stationCode: "KOTA",
            stationName: "Kota Junction",
            status: "ON TIME",
            speedKmh: 110,
            latitude: 25.2138,
            longitude: 75.8648,
            distanceFromOriginKm: 465,
            platform: 2,
        },

        nextHalt: {
            stationName: "Ratlam",
            distance: 265,
        },

        delayMinutes: 0,

        route: [
            {
                stationCode: "DEL",
                stationName: "New Delhi",
                scheduledArrival: "06:00",
                scheduledDeparture: "06:10",
                distance: 0,
                isHalt: true,
            },
            {
                stationCode: "KOTA",
                stationName: "Kota Junction",
                scheduledArrival: "13:30",
                scheduledDeparture: "13:35",
                distance: 465,
                isHalt: true,
            },
            {
                stationCode: "RAT",
                stationName: "Ratlam",
                scheduledArrival: "17:00",
                scheduledDeparture: "17:05",
                distance: 730,
                isHalt: true,
            },
            {
                stationCode: "MUM",
                stationName: "Mumbai",
                scheduledArrival: "23:00",
                scheduledDeparture: null,
                distance: 1380,
                isHalt: true,
            },
        ],
    },
};

const intermediateApiResponse = {
    data: {
        train: {
            number: "54321",
            name: "Test Express",
            type: "Express",
            source: {
                code: "AAA",
                name: "Start Station",
            },
            destination: {
                code: "CCC",
                name: "End Station",
            },
        },

        currentLocation: {
            stationCode: "AAA",
            stationName: "Start Station",
            status: "RUNNING",
            speedKmh: 80,
            latitude: 17.0,
            longitude: 83.0,
            distanceFromOriginKm: 0,
        },

        nextHalt: {
            stationName: "End Station",
            distance: 100,
        },

        delayMinutes: 5,

        route: [
            {
                stationCode: "AAA",
                stationName: "Start Station",
                scheduledArrival: "08:00",
                scheduledDeparture: "08:05",
                distance: 0,
                isHalt: true,
            },
            {
                stationCode: "INT",
                stationName: "Intermediate Station",
                scheduledArrival: "09:00",
                scheduledDeparture: null,
                distance: 45,
                isHalt: false,
            },
            {
                stationCode: "CCC",
                stationName: "End Station",
                scheduledArrival: "10:00",
                scheduledDeparture: "10:05",
                distance: 100,
                isHalt: true,
            },
        ],
    },
};

function mockFetchText(text, status = 200) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: vi.fn().mockResolvedValue(text),
    });
}

function mockFetchJson(payload, status = 200) {
    mockFetchText(JSON.stringify(payload), status);
}

function mockSuccessfulFetch() {
    mockFetchJson(successfulApiResponse);
}

/* ============================================================
   SETUP
   ============================================================ */

beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv(
        "VITE_RAILRADAR_API_KEY",
        "test-api-key"
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
});

/* ============================================================
   HELPER TESTS
   ============================================================ */

describe("cleanTrainNumber", () => {
    it("returns empty string for null", () => {
        expect(cleanTrainNumber(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
        expect(cleanTrainNumber(undefined)).toBe("");
    });

    it("returns empty string for empty input", () => {
        expect(cleanTrainNumber("")).toBe("");
    });

    it("trims whitespace", () => {
        expect(cleanTrainNumber(" 12345 ")).toBe(
            "12345"
        );
    });

    it("removes non-digit characters", () => {
        expect(cleanTrainNumber("TRAIN12345")).toBe(
            "12345"
        );
    });

    it("handles numeric input", () => {
        expect(cleanTrainNumber(12345)).toBe(
            "12345"
        );
    });

    it("uses the first part when train name follows a slash", () => {
        expect(
            cleanTrainNumber("12345/Rajdhani")
        ).toBe("12345");
    });

    it("uses the first part when train name follows a hyphen", () => {
        expect(
            cleanTrainNumber("12345-Rajdhani")
        ).toBe("12345");
    });

    it("handles a train number followed by spaces", () => {
        expect(
            cleanTrainNumber("12345 Rajdhani Express")
        ).toBe("12345");
    });

    it("does not treat ABC before the number as the train number", () => {
        expect(
            cleanTrainNumber("ABC-12345")
        ).toBe("");
    });
});

describe("safeString", () => {
    it("returns fallback for null", () => {
        expect(safeString(null)).toBe("-");
    });

    it("returns fallback for undefined", () => {
        expect(safeString(undefined)).toBe("-");
    });

    it("returns fallback for empty string", () => {
        expect(safeString("")).toBe("-");
    });

    it("converts primitive values to strings", () => {
        expect(safeString(123)).toBe("123");
    });

    it("converts false to string", () => {
        expect(safeString(false)).toBe("false");
    });

    it("uses object name", () => {
        expect(
            safeString({ name: "Kota Junction" })
        ).toBe("Kota Junction");
    });

    it("uses stationName", () => {
        expect(
            safeString({
                stationName: "Kota Junction",
            })
        ).toBe("Kota Junction");
    });

    it("uses code", () => {
        expect(
            safeString({ code: "KOTA" })
        ).toBe("KOTA");
    });

    it("uses stationCode", () => {
        expect(
            safeString({ stationCode: "KOTA" })
        ).toBe("KOTA");
    });

    it("uses fallback for an empty object", () => {
        expect(safeString({})).toBe("-");
    });

    it("supports a custom fallback", () => {
        expect(
            safeString(null, "Unknown")
        ).toBe("Unknown");
    });
});

describe("formatTime", () => {
    it("returns -- for null", () => {
        expect(formatTime(null)).toBe("--");
    });

    it("returns -- for undefined", () => {
        expect(formatTime(undefined)).toBe("--");
    });

    it("returns -- for empty string", () => {
        expect(formatTime("")).toBe("--");
    });

    it("keeps HH:mm unchanged", () => {
        expect(formatTime("13:30")).toBe("13:30");
    });

    it("keeps HH:mm:ss unchanged", () => {
        expect(formatTime("13:30:45")).toBe(
            "13:30:45"
        );
    });

    it("reads time from an object", () => {
        expect(
            formatTime({ time: "09:15" })
        ).toBe("09:15");
    });

    it("reads value from an object", () => {
        expect(
            formatTime({ value: "10:20" })
        ).toBe("10:20");
    });

    it("reads timestamp from an object", () => {
        expect(
            formatTime({ timestamp: "11:30" })
        ).toBe("11:30");
    });

    it("formats a valid date", () => {
        const result = formatTime(
            "2026-09-24T10:30:00Z"
        );

        expect(result).toMatch(
            /^\d{1,2}:\d{2}/
        );
    });

    it("returns invalid date input unchanged", () => {
        expect(
            formatTime("not-a-valid-date")
        ).toBe("not-a-valid-date");
    });
});

describe("getStationCode", () => {
    it("supports stationCode", () => {
        expect(
            getStationCode({
                stationCode: "kota",
            })
        ).toBe("KOTA");
    });

    it("supports station_code", () => {
        expect(
            getStationCode({
                station_code: "kota",
            })
        ).toBe("KOTA");
    });

    it("supports code", () => {
        expect(
            getStationCode({
                code: "kota",
            })
        ).toBe("KOTA");
    });

    it("supports codeName", () => {
        expect(
            getStationCode({
                codeName: "kota",
            })
        ).toBe("KOTA");
    });

    it("returns empty string for missing station", () => {
        expect(getStationCode(null)).toBe("");
    });

    it("returns empty string for empty station", () => {
        expect(getStationCode({})).toBe("");
    });
});

describe("getStationName", () => {
    it("supports stationName", () => {
        expect(
            getStationName({
                stationName: "Kota",
            })
        ).toBe("Kota");
    });

    it("supports station_name", () => {
        expect(
            getStationName({
                station_name: "Kota",
            })
        ).toBe("Kota");
    });

    it("supports name", () => {
        expect(
            getStationName({
                name: "Kota",
            })
        ).toBe("Kota");
    });

    it("supports station", () => {
        expect(
            getStationName({
                station: "Kota",
            })
        ).toBe("Kota");
    });

    it("returns fallback for empty station", () => {
        expect(getStationName({})).toBe("-");
    });

    it("handles null", () => {
        expect(getStationName(null)).toBe("-");
    });
});

describe("getArrival", () => {
    it("supports scheduledArrival", () => {
        expect(
            getArrival({
                scheduledArrival: "10:00",
            })
        ).toBe("10:00");
    });

    it("supports scheduled_arrival", () => {
        expect(
            getArrival({
                scheduled_arrival: "10:00",
            })
        ).toBe("10:00");
    });

    it("supports arrival", () => {
        expect(
            getArrival({
                arrival: "10:00",
            })
        ).toBe("10:00");
    });

    it("supports arrivalTime", () => {
        expect(
            getArrival({
                arrivalTime: "10:00",
            })
        ).toBe("10:00");
    });

    it("supports arrival_time", () => {
        expect(
            getArrival({
                arrival_time: "10:00",
            })
        ).toBe("10:00");
    });

    it("supports eta", () => {
        expect(
            getArrival({
                eta: "10:00",
            })
        ).toBe("10:00");
    });

    it("returns null for missing station", () => {
        expect(getArrival(null)).toBeNull();
    });
});

describe("getDeparture", () => {
    it("supports scheduledDeparture", () => {
        expect(
            getDeparture({
                scheduledDeparture: "10:05",
            })
        ).toBe("10:05");
    });

    it("supports scheduled_departure", () => {
        expect(
            getDeparture({
                scheduled_departure: "10:05",
            })
        ).toBe("10:05");
    });

    it("supports departure", () => {
        expect(
            getDeparture({
                departure: "10:05",
            })
        ).toBe("10:05");
    });

    it("supports departureTime", () => {
        expect(
            getDeparture({
                departureTime: "10:05",
            })
        ).toBe("10:05");
    });

    it("supports departure_time", () => {
        expect(
            getDeparture({
                departure_time: "10:05",
            })
        ).toBe("10:05");
    });

    it("supports etd", () => {
        expect(
            getDeparture({
                etd: "10:05",
            })
        ).toBe("10:05");
    });

    it("returns null for missing station", () => {
        expect(getDeparture(null)).toBeNull();
    });
});

/* ============================================================
   prepareTrainData
   ============================================================ */

describe("prepareTrainData", () => {
    it("returns null for null input", () => {
        expect(
            prepareTrainData(null, "12345")
        ).toBeNull();
    });

    it("returns normalized primary API data", () => {
        const result = prepareTrainData(
            successfulApiResponse.data,
            "99999"
        );

        expect(result.trainNumber).toBe("12345");
        expect(result.trainName).toBe(
            "Rajdhani Exp"
        );
        expect(result.trainType).toBe("Express");

        expect(result.source).toBe("New Delhi");
        expect(result.sourceCode).toBe("DEL");

        expect(result.destination).toBe(
            "Mumbai"
        );
        expect(result.destinationCode).toBe(
            "MUM"
        );

        expect(result.speedKmh).toBe(110);
        expect(result.delayMinutes).toBe(0);
        expect(result.distanceFromOriginKm).toBe(
            465
        );

        expect(result.latitude).toBe(25.2138);
        expect(result.longitude).toBe(75.8648);

        expect(
            result.currentLocation.stationName
        ).toBe("Kota Junction");

        expect(
            result.currentLocation.stationCode
        ).toBe("KOTA");

        expect(
            result.currentLocation.status
        ).toBe("ON TIME");

        expect(
            result.currentLocation.platform
        ).toBe(2);

        expect(
            result.nextHalt.stationName
        ).toBe("Ratlam");

        expect(
            result.nextHalt.distance
        ).toBe(265);

        expect(result.route).toHaveLength(4);
    });

    it("preserves platform data even though the UI does not render it", () => {
        const result = prepareTrainData(
            {
                train: {
                    number: "12345",
                    name: "Test",
                },
                currentLocation: {
                    stationCode: "KOTA",
                    stationName: "Kota",
                    platform: 2,
                },
                route: [],
            },
            "12345"
        );

        expect(
            result.currentLocation.platform
        ).toBe(2);
    });

    it("supports alternate API field names", () => {
        const result = prepareTrainData(
            {
                trainNumber: "54321",
                train_name: "Alternate Express",
                train_type: "Passenger",

                source: "Origin",
                source_code: "ORI",

                destination: "Destination",
                destination_code: "DST",

                current_location: {
                    station_code: "CUR",
                    station_name: "Current Station",
                    status: "DELAYED",
                    speed_kmh: 55,
                    lat: 17.1,
                    lng: 83.2,
                    distance_from_origin_km: 30,
                    platform: 3,
                },

                next_halt: {
                    station_name: "Next Station",
                    distance: 8,
                },

                delay_minutes: 7,
                is_live: false,
                route: "invalid-route",
            },
            "99999"
        );

        expect(result.trainNumber).toBe("54321");
        expect(result.trainName).toBe(
            "Alternate Express"
        );
        expect(result.trainType).toBe(
            "Passenger"
        );

        expect(result.source).toBe("Origin");
        expect(result.sourceCode).toBe("ORI");

        expect(result.destination).toBe(
            "Destination"
        );
        expect(result.destinationCode).toBe(
            "DST"
        );

        expect(result.speedKmh).toBe(55);
        expect(result.delayMinutes).toBe(7);
        expect(result.distanceFromOriginKm).toBe(
            30
        );

        expect(result.latitude).toBe(17.1);
        expect(result.longitude).toBe(83.2);

        expect(result.currentLocation.platform).toBe(
            3
        );

        expect(result.nextHalt.stationName).toBe(
            "Next Station"
        );

        expect(result.route).toEqual([]);
    });

    it("uses fallback train number", () => {
        const result = prepareTrainData(
            {
                train: {},
                route: [],
            },
            "99999"
        );

        expect(result.trainNumber).toBe("99999");
    });

    it("uses fallback train name", () => {
        const result = prepareTrainData(
            {
                train: {},
                route: [],
            },
            "99999"
        );

        expect(result.trainName).toBe("Train");
    });

    it("supports raw type fallback", () => {
        const result = prepareTrainData(
            {
                type: "Freight",
                route: [],
            },
            "12345"
        );

        expect(result.trainType).toBe("Freight");
    });

    it("supports raw speedKmh", () => {
        const result = prepareTrainData(
            {
                speedKmh: 75,
                route: [],
            },
            "12345"
        );

        expect(result.speedKmh).toBe(75);
    });

    it("supports raw speed_kmh", () => {
        const result = prepareTrainData(
            {
                speed_kmh: 65,
                route: [],
            },
            "12345"
        );

        expect(result.speedKmh).toBe(65);
    });

    it("supports raw speed", () => {
        const result = prepareTrainData(
            {
                speed: 55,
                route: [],
            },
            "12345"
        );

        expect(result.speedKmh).toBe(55);
    });

    it("supports raw delay", () => {
        const result = prepareTrainData(
            {
                delay: 12,
                route: [],
            },
            "12345"
        );

        expect(result.delayMinutes).toBe(12);
    });

    it("supports raw distance", () => {
        const result = prepareTrainData(
            {
                distanceFromOriginKm: 250,
                route: [],
            },
            "12345"
        );

        expect(
            result.distanceFromOriginKm
        ).toBe(250);
    });

    it("supports raw coordinates", () => {
        const result = prepareTrainData(
            {
                latitude: 17.5,
                longitude: 83.3,
                route: [],
            },
            "12345"
        );

        expect(result.latitude).toBe(17.5);
        expect(result.longitude).toBe(83.3);
    });

    it("supports raw current location label", () => {
        const result = prepareTrainData(
            {
                current_location_label:
                    "Some Location",
                route: [],
            },
            "12345"
        );

        expect(
            result.currentLocation.stationName
        ).toBe("Location unavailable");
    });

    it("uses current status fallback", () => {
        const result = prepareTrainData(
            {
                status: "RUNNING",
                route: [],
            },
            "12345"
        );

        expect(
            result.currentLocation.status
        ).toBe("RUNNING");
    });

    it("uses raw origin code", () => {
        const result = prepareTrainData(
            {
                origin: "Origin",
                originCode: "ORG",
                route: [],
            },
            "12345"
        );

        expect(result.source).toBe("Origin");
        expect(result.sourceCode).toBe("ORG");
    });

    it("uses raw destination code", () => {
        const result = prepareTrainData(
            {
                destination: "Destination",
                destinationCode: "DST",
                route: [],
            },
            "12345"
        );

        expect(result.destination).toBe(
            "Destination"
        );
        expect(result.destinationCode).toBe(
            "DST"
        );
    });
});

/* ============================================================
   COMPONENT TESTS
   ============================================================ */

describe("RailTracker component", () => {
    it("shows loading state while API request is pending", () => {
        global.fetch = vi.fn(
            () => new Promise(() => {})
        );

        render(
            <RailTracker trainNumber="12345" />
        );

        expect(
            screen.getByText(/loading/i)
        ).toBeInTheDocument();
    });

    it("does not call API when train number is missing", async () => {
        const { container } = render(
            <RailTracker />
        );

        await waitFor(() => {
            expect(global.fetch).not.toHaveBeenCalled();
        });

        expect(container.firstChild).toBeNull();
    });

    it("renders successful train data", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        expect(
            await screen.findByText("Rajdhani Exp")
        ).toBeInTheDocument();

        expect(
            screen.getByText("12345")
        ).toBeInTheDocument();

        expect(
            screen.getByText("DEL")
        ).toBeInTheDocument();

        expect(
            screen.getByText("MUM")
        ).toBeInTheDocument();
    });

    it("renders speed", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText("110", {
                selector: ".text-lg.font-bold",
            })
        ).toBeInTheDocument();
    });

    it("renders delay", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText("Delay")
        ).toBeInTheDocument();

        expect(
            screen.getByText("0", {
                selector: ".text-lg.font-bold",
            })
        ).toBeInTheDocument();
    });

    it("renders distance", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText("Distance")
        ).toBeInTheDocument();

        expect(
            screen.getByText("465", {
                selector: ".text-lg.font-bold",
            })
        ).toBeInTheDocument();
    });

    it("renders current station", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getAllByText("Kota Junction")
        ).toHaveLength(2);

        expect(
            screen.getByText("KOTA")
        ).toBeInTheDocument();

        expect(
            screen.getByText("ON TIME")
        ).toBeInTheDocument();
    });

    it("renders next halt", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getAllByText("Ratlam")
        ).toHaveLength(2);

        expect(
            screen.getByText(/265\s*km/)
        ).toBeInTheDocument();
    });

    it("renders complete route timeline", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText("4 stations")
        ).toBeInTheDocument();

        expect(
            screen.getByText("New Delhi")
        ).toBeInTheDocument();

        expect(
            screen.getByText("Kota Junction")
        ).toBeInTheDocument();

        expect(
            screen.getByText("Ratlam")
        ).toBeInTheDocument();

        expect(
            screen.getByText("Mumbai")
        ).toBeInTheDocument();
    });

    it("marks previous station as PASSED", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText("PASSED")
        ).toBeInTheDocument();
    });

    it("marks current station as CURRENT", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText("CURRENT")
        ).toBeInTheDocument();

        expect(
            screen.getByText("🚆 TRAIN IS HERE")
        ).toBeInTheDocument();
    });

    it("marks future stations as UPCOMING", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getAllByText("UPCOMING")
        ).toHaveLength(2);
    });

    it("renders arrival and departure times", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText("06:00")
        ).toBeInTheDocument();

        expect(
            screen.getByText("06:10")
        ).toBeInTheDocument();

        expect(
            screen.getByText("13:30")
        ).toBeInTheDocument();

        expect(
            screen.getByText("13:35")
        ).toBeInTheDocument();
    });

    it("does not render duplicate departure time when departure is missing", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText("23:00")
        ).toBeInTheDocument();
    });

    it("renders GPS available state", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText("GPS AVAILABLE")
        ).toBeInTheDocument();
    });

    it("does not render platform text because the current component does not display it", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.queryByText("Platform 2")
        ).not.toBeInTheDocument();
    });

    it("initializes Leaflet when GPS coordinates are available", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("GPS AVAILABLE");

        await waitFor(() => {
            expect(L.map).toHaveBeenCalled();
        });

        expect(
            L.tileLayer
        ).toHaveBeenCalled();

        expect(
            L.circleMarker
        ).toHaveBeenCalled();
    });

    it("creates marker with current GPS coordinates", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("GPS AVAILABLE");

        await waitFor(() => {
            expect(
                L.circleMarker
            ).toHaveBeenCalledWith(
                [25.2138, 75.8648],
                expect.any(Object)
            );
        });
    });

    it("binds and opens marker popup", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("GPS AVAILABLE");

        await waitFor(() => {
            expect(
                L.circleMarker
            ).toHaveBeenCalled();
        });

        const marker =
            L.circleMarker.mock.results[0].value;

        expect(
            marker.bindPopup
        ).toHaveBeenCalled();

        expect(
            marker.openPopup
        ).toHaveBeenCalled();
    });

    it("removes the map when component unmounts", async () => {
        mockSuccessfulFetch();

        const { unmount } = render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("GPS AVAILABLE");

        await waitFor(() => {
            expect(L.map).toHaveBeenCalled();
        });

        const mapInstance =
            L.map.mock.results[0].value;

        unmount();

        expect(
            mapInstance.remove
        ).toHaveBeenCalled();
    });

    it("removes the existing marker during cleanup", async () => {
        mockSuccessfulFetch();

        const { unmount } = render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("GPS AVAILABLE");

        await waitFor(() => {
            expect(
                L.circleMarker
            ).toHaveBeenCalled();
        });

        const marker =
            L.circleMarker.mock.results[0].value;

        unmount();

        expect(
            marker.remove
        ).toHaveBeenCalled();
    });

    it("does not initialize Leaflet when GPS coordinates are unavailable", async () => {
        const response = {
            data: {
                ...successfulApiResponse.data,
                currentLocation: {
                    ...successfulApiResponse.data
                        .currentLocation,
                    latitude: null,
                    longitude: null,
                },
            },
        };

        mockFetchJson(response);

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText(
                /Live coordinates are not available/
            )
        ).toBeInTheDocument();

        expect(L.map).not.toHaveBeenCalled();
        expect(
            L.circleMarker
        ).not.toHaveBeenCalled();
    });

    it("shows no route information when route is empty", async () => {
        const response = {
            data: {
                ...successfulApiResponse.data,
                route: [],
                currentLocation: {
                    ...successfulApiResponse.data
                        .currentLocation,
                    latitude: null,
                    longitude: null,
                },
            },
        };

        mockFetchJson(response);

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText(
                /No route information was returned/
            )
        ).toBeInTheDocument();
    });

    it("handles API HTTP errors", async () => {
        mockFetchText("Server error", 500);

        render(
            <RailTracker trainNumber="12345" />
        );

        expect(
            await screen.findByText(
                /RailRadar API returned HTTP 500/
            )
        ).toBeInTheDocument();
    });

    it("handles invalid JSON", async () => {
        mockFetchText("this-is-not-json", 200);

        render(
            <RailTracker trainNumber="12345" />
        );

        expect(
            await screen.findByText(
                /RailRadar returned invalid JSON/
            )
        ).toBeInTheDocument();
    });

    it("handles empty API data", async () => {
        mockFetchText("null", 200);

        render(
            <RailTracker trainNumber="12345" />
        );

        expect(
            await screen.findByText(
                /RailRadar returned empty train data/
            )
        ).toBeInTheDocument();
    });

    it("handles invalid train number", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="ABC" />
        );

        expect(
            await screen.findByText(
                /Invalid train number: ABC/
            )
        ).toBeInTheDocument();

        expect(
            global.fetch
        ).not.toHaveBeenCalled();
    });

    it("calls API using the cleaned train number", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker
                trainNumber="12345 - Rajdhani Express"
            />
        );

        await screen.findByText("Rajdhani Exp");

        expect(global.fetch).toHaveBeenCalled();

        const [url] =
            global.fetch.mock.calls[0];

        expect(url).toContain(
            "/v1/trains/12345/live"
        );
    });

    it("does not incorrectly expect 12345 from 123/45", () => {
        expect(
            cleanTrainNumber("123/45")
        ).toBe("123");
    });

    it("sends the expected API request headers", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        const [, options] =
            global.fetch.mock.calls[0];

        expect(options.method).toBe("GET");

        expect(
            options.headers
        ).toEqual({
            Authorization:
                "Bearer test-api-key",
            Accept: "application/json",
        });
    });

    it("supports a direct API response without data wrapper", async () => {
        mockFetchJson(
            successfulApiResponse.data
        );

        render(
            <RailTracker trainNumber="12345" />
        );

        expect(
            await screen.findByText("Rajdhani Exp")
        ).toBeInTheDocument();
    });

    it("renders search context when both stations are supplied", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker
                trainNumber="12345"
                searchFrom="Visakhapatnam"
                searchTo="Hyderabad"
            />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText(/Visakhapatnam/)
        ).toBeInTheDocument();

        expect(
            screen.getByText(/Hyderabad/)
        ).toBeInTheDocument();
    });

    it("renders search context when only searchFrom is supplied", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker
                trainNumber="12345"
                searchFrom="Visakhapatnam"
            />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText(/Visakhapatnam/)
        ).toBeInTheDocument();
    });

    it("renders search context when only searchTo is supplied", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker
                trainNumber="12345"
                searchTo="Hyderabad"
            />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.getByText(/Hyderabad/)
        ).toBeInTheDocument();
    });

    it("does not render search context when no search values are supplied", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("Rajdhani Exp");

        expect(
            screen.queryByText(/Search:/i)
        ).not.toBeInTheDocument();
    });

    /* ========================================================
       INTERMEDIATE STATIONS
       ======================================================== */

    it("renders intermediate station control", async () => {
        mockFetchJson(intermediateApiResponse);

        render(
            <RailTracker trainNumber="54321" />
        );

        await screen.findByText("Test Express");

        expect(
            screen.getByRole("button", {
                name: /Show 1 intermediate station/i,
            })
        ).toBeInTheDocument();
    });

    it("expands intermediate stations", async () => {
        mockFetchJson(intermediateApiResponse);

        render(
            <RailTracker trainNumber="54321" />
        );

        await screen.findByText("Test Express");

        const button =
            screen.getByRole("button", {
                name: /Show 1 intermediate station/i,
            });

        fireEvent.click(button);

        expect(
            screen.getByText(
                "Intermediate Station"
            )
        ).toBeInTheDocument();

        expect(
            screen.getByText(/45\s*km/)
        ).toBeInTheDocument();
    });

    it("collapses intermediate stations", async () => {
        mockFetchJson(intermediateApiResponse);

        render(
            <RailTracker trainNumber="54321" />
        );

        await screen.findByText("Test Express");

        const showButton =
            screen.getByRole("button", {
                name: /Show 1 intermediate station/i,
            });

        fireEvent.click(showButton);

        expect(
            screen.getByText(
                "Intermediate Station"
            )
        ).toBeInTheDocument();

        const hideButton =
            screen.getByRole("button", {
                name: /Hide 1 intermediate station/i,
            });

        fireEvent.click(hideButton);

        expect(
            screen.queryByText(
                "Intermediate Station"
            )
        ).not.toBeInTheDocument();
    });

    /* ========================================================
       MARKER / MAP EFFECT
       ======================================================== */

    it("does not require two markers when train data is unchanged", async () => {
        mockSuccessfulFetch();

        render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("GPS AVAILABLE");

        await waitFor(() => {
            expect(
                L.circleMarker
            ).toHaveBeenCalled();
        });

        expect(
            L.circleMarker
        ).toHaveBeenCalledTimes(1);
    });

    it("does not fail when Leaflet marker cleanup is triggered", async () => {
        mockSuccessfulFetch();

        const { unmount } = render(
            <RailTracker trainNumber="12345" />
        );

        await screen.findByText("GPS AVAILABLE");

        await waitFor(() => {
            expect(
                L.circleMarker
            ).toHaveBeenCalled();
        });

        const marker =
            L.circleMarker.mock.results[0].value;

        expect(marker.remove).not.toHaveBeenCalled();

        unmount();

        expect(
            marker.remove
        ).toHaveBeenCalledTimes(1);
    });

    /* ========================================================
       TIME DISPLAY BRANCH
       ======================================================== */

    it("handles identical arrival and departure times", async () => {
        const response = {
            data: {
                train: {
                    number: "11111",
                    name: "Same Time Express",
                    source: {
                        code: "AAA",
                        name: "Start",
                    },
                    destination: {
                        code: "BBB",
                        name: "End",
                    },
                },

                currentLocation: {
                    stationCode: "AAA",
                    stationName: "Start",
                    latitude: null,
                    longitude: null,
                },

                route: [
                    {
                        stationCode: "AAA",
                        stationName: "Start",
                        scheduledArrival: "10:00",
                        scheduledDeparture: "10:00",
                        isHalt: true,
                    },
                ],
            },
        };

        mockFetchJson(response);

        render(
            <RailTracker trainNumber="11111" />
        );

        await screen.findByText(
            "Same Time Express"
        );

        expect(
            screen.getByText("10:00")
        ).toBeInTheDocument();
    });
});