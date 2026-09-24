import React, {
    useEffect,
    useRef,
    useState,
} from "react";

import L from "leaflet";
import "leaflet/dist/leaflet.css";


/*
 * ============================================================
 * RAILRADAR CONFIG
 * ============================================================
 *
 * Add this to .env:
 *
 * VITE_RAILRADAR_API_KEY=YOUR_API_KEY
 *
 * IMPORTANT:
 * Do not hard-code the API key inside this component.
 */
const API_BASE_URL = "https://api.railradar.in";

const API_KEY = import.meta.env.VITE_RAILRADAR_API_KEY;


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function cleanTrainNumber(value) {
    const cleaned = String(value ?? "")
        .trim()
        .split(/[-/\s]/)[0]
        .replace(/\D/g, "");

    return cleaned;
}


function safeString(value, fallback = "-") {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return fallback;
    }

    if (typeof value === "object") {

        return (
            value.name ||
            value.stationName ||
            value.code ||
            value.stationCode ||
            fallback
        );
    }

    return String(value);
}


function formatTime(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "--";
    }

    if (typeof value === "object") {

        value =
            value.time ||
            value.value ||
            value.timestamp ||
            "";
    }

    const stringValue = String(value);

    /*
     * Already a normal HH:mm / HH:mm:ss value.
     */
    if (
        /^\d{1,2}:\d{2}(:\d{2})?$/.test(
            stringValue
        )
    ) {
        return stringValue;
    }

    const date = new Date(stringValue);

    if (!Number.isNaN(date.getTime())) {

        return date.toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit",
            }
        );
    }

    return stringValue;
}


function getStationCode(station) {

    return safeString(
        station?.stationCode ??
        station?.station_code ??
        station?.code ??
        station?.codeName,
        ""
    ).toUpperCase();
}


function getStationName(station) {

    return safeString(
        station?.stationName ??
        station?.station_name ??
        station?.name ??
        station?.station,
        "-"
    );
}


function getArrival(station) {

    return (
        station?.scheduledArrival ??
        station?.scheduled_arrival ??
        station?.arrival ??
        station?.arrivalTime ??
        station?.arrival_time ??
        station?.eta ??
        null
    );
}


function getDeparture(station) {

    return (
        station?.scheduledDeparture ??
        station?.scheduled_departure ??
        station?.departure ??
        station?.departureTime ??
        station?.departure_time ??
        station?.etd ??
        null
    );
}


/*
 * ============================================================
 * GET LIVE TRAIN FROM RAILRADAR
 * ============================================================
 */
async function getLiveTrain(trainNumber) {

    if (!API_KEY) {
        throw new Error(
            "VITE_RAILRADAR_API_KEY is not configured."
        );
    }

    const cleanNumber =
        cleanTrainNumber(trainNumber);

    if (!cleanNumber) {
        throw new Error(
            `Invalid train number: ${trainNumber}`
        );
    }

    const url =
        `${API_BASE_URL}/v1/trains/` +
        `${cleanNumber}/live`;

    console.log(
        "🚆 RailRadar request:",
        url
    );

    const response = await fetch(
        url,
        {
            method: "GET",

            headers: {
                Authorization:
                    `Bearer ${API_KEY}`,

                Accept:
                    "application/json",
            },
        }
    );

    const responseText =
        await response.text();

    if (!response.ok) {

        console.error(
            "❌ RailRadar error:",
            response.status,
            responseText
        );

        throw new Error(
            `RailRadar API returned HTTP ${response.status}`
        );
    }

    let result;

    try {

        result =
            JSON.parse(responseText);

    } catch {

        console.error(
            "❌ RailRadar returned invalid JSON:",
            responseText
        );

        throw new Error(
            "RailRadar returned invalid JSON."
        );
    }


    console.log(
        "🔥 FULL RAILRADAR RESPONSE:",
        result
    );

    console.log(
        "train data from railway api ",
        result?.data
    );


    /*
     * This follows the working HTML/API pattern:
     *
     * result.data || result
     */
    const train =
        result?.data ?? result;


    if (!train) {

        throw new Error(
            "RailRadar returned empty train data."
        );
    }

    console.log(
        "train data",
        train
    );

    return train;
}


/*
 * ============================================================
 * NORMALIZE ONLY FIELD NAMES
 * ============================================================
 */
function prepareTrainData(
    raw,
    fallbackTrainNumber
) {

    if (!raw) {
        return null;
    }


    /*
     * Some API responses may contain:
     *
     * {
     *   train: {...},
     *   currentLocation: {...}
     * }
     *
     * Others may contain train information
     * directly.
     */
    const train =
        raw.train || {};


    const current =
        raw.currentLocation ||
        raw.current_location ||
        {};


    const next =
        raw.nextHalt ||
        raw.next_halt ||
        {};


    /*
     * Use the API route exactly as received.
     *
     * No fake stations.
     * No slice().
     * No filter().
     */
    const route =
        Array.isArray(raw.route)
            ? raw.route
            : [];


    const trainNumber =
        train.number ??
        raw.trainNumber ??
        raw.train_number ??
        fallbackTrainNumber;


    const trainName =
        train.name ??
        raw.trainName ??
        raw.train_name ??
        "Train";


    const trainType =
        train.type ??
        raw.trainType ??
        raw.train_type ??
        raw.type ??
        "-";


    const source =
        train.source ??
        raw.source ??
        raw.origin ??
        "-";


    /*
     * IMPORTANT:
     *
     * Use optional chaining here.
     *
     * The previous:
     *
     * raw.train.source.code
     *
     * could crash when raw.train/source did not exist.
     */
    const sourceCode =
        train.source?.code ??
        raw.source?.code ??
        raw.sourceCode ??
        raw.source_code ??
        raw.originCode ??
        raw.origin_code ??
        "-";


    const destination =
        train.destination ??
        raw.destination ??
        "-";


    const destinationCode =
        train.destination?.code ??
        train.destinationCode ??
        raw.destination?.code ??
        raw.destinationCode ??
        raw.destination_code ??
        "-";


    const speed =
        current.speedKmh ??
        current.speed_kmh ??
        raw.speedKmh ??
        raw.speed_kmh ??
        raw.speed ??
        0;


    const delay =
        raw.delayMinutes ??
        raw.delay_minutes ??
        raw.delay ??
        0;


    const distance =
        current.distanceFromOriginKm ??
        current.distance_from_origin_km ??
        raw.distanceFromOriginKm ??
        raw.distance_from_origin_km ??
        null;


    const latitude =
        current.latitude ??
        current.lat ??
        raw.latitude ??
        null;


    const longitude =
        current.longitude ??
        current.lng ??
        raw.longitude ??
        null;


    return {

        raw,

        trainNumber:
            safeString(
                trainNumber,
                fallbackTrainNumber
            ),

        trainName:
            safeString(
                trainName,
                "Train"
            ),

        trainType:
            safeString(
                trainType,
                "-"
            ),

        source:
            safeString(
                source,
                "-"
            ),

        sourceCode:
            safeString(
                sourceCode,
                "-"
            ),

        destination:
            safeString(
                destination,
                "-"
            ),

        destinationCode:
            safeString(
                destinationCode,
                "-"
            ),

        delayMinutes:
            delay,

        speedKmh:
            speed,

        distanceFromOriginKm:
            distance,

        isLive:
            raw.isLive ??
            raw.is_live ??
            true,

        currentLocation: {

            stationName:
                safeString(
                    current.stationName ??
                    current.station_name ??
                    current.name ??
                    raw.current_location_label,
                    "Location unavailable"
                ),

            stationCode:
                safeString(
                    current.stationCode ??
                    current.station_code ??
                    current.code,
                    "-"
                ).toUpperCase(),

            status:
                safeString(
                    current.status ??
                    raw.status,
                    "-"
                ),

            speedKmh:
                speed,

            latitude,

            longitude,

            platform:
                current.platform ??
                raw.platform ??
                null,
        },

        nextHalt: {

            stationName:
                safeString(
                    next.stationName ??
                    next.station_name ??
                    next.name,
                    "-"
                ),

            distance:
                next.distance ??
                null,
        },

        route,
    };
}


/*
 * ============================================================
 * COMPONENT
 * ============================================================
 */

function RailTracker({
    trainNumber,
    searchFrom,
    searchTo,
}) {

    const [
        trainData,
        setTrainData,
    ] = useState(null);


    const [
        loading,
        setLoading,
    ] = useState(true);


    const [
        error,
        setError,
    ] = useState("");


    const [
        lastUpdated,
        setLastUpdated,
    ] = useState("-");


    const [
        expandedSegments,
        setExpandedSegments,
    ] = useState({});


    const mapRef =
        useRef(null);


    const mapInstanceRef =
        useRef(null);


    const markerRef =
        useRef(null);


    /*
     * ==========================================================
     * FETCH TRAIN
     * ==========================================================
     */

    useEffect(() => {

        if (!trainNumber) {

            setTrainData(null);
            setError("");
            setLoading(false);

            return;
        }


        let cancelled = false;


        async function loadTrain() {

            try {

                setLoading(true);
                setError("");


                const raw =
                    await getLiveTrain(
                        trainNumber
                    );


                console.log(
                    "🚆 RailRadar train data:",
                    raw
                );


                const prepared =
                    prepareTrainData(
                        raw,
                        trainNumber
                    );


                if (!prepared) {

                    throw new Error(
                        "No train data received from RailRadar."
                    );
                }


                if (!cancelled) {

                    setTrainData(
                        prepared
                    );

                    setLastUpdated(
                        new Date().toLocaleTimeString()
                    );
                }

            } catch (err) {

                console.error(
                    "❌ Failed to load RailRadar train:",
                    err
                );


                if (!cancelled) {

                    setError(
                        err?.message ||
                        "Unable to load live train data."
                    );

                    setTrainData(null);
                }

            } finally {

                if (!cancelled) {
                    setLoading(false);
                }
            }
        }


        /*
         * Initial request.
         */
        loadTrain();


        /*
         * Refresh every 120 seconds.
         */
        const interval =
            setInterval(
                loadTrain,
                120000
            );


        return () => {

            cancelled = true;

            clearInterval(
                interval
            );
        };

    }, [trainNumber]);


    /*
     * ==========================================================
     * LEAFLET MAP
     * ==========================================================
     */

    useEffect(() => {

        if (!trainData) {
            return;
        }


        const current =
            trainData.currentLocation ||
            {};


        const lat =
            current.latitude;


        const lng =
            current.longitude;


        /*
         * No coordinates from API.
         * Don't invent coordinates.
         */
        if (
            lat === null ||
            lat === undefined ||
            lng === null ||
            lng === undefined
        ) {
            return;
        }


        /*
         * Create map only once.
         */
        if (
            !mapInstanceRef.current &&
            mapRef.current
        ) {

            const map =
                L.map(
                    mapRef.current
                ).setView(
                    [lat, lng],
                    11
                );


            L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    attribution:
                        "&copy; OpenStreetMap contributors",
                }
            ).addTo(map);


            mapInstanceRef.current =
                map;
        }


        const map =
            mapInstanceRef.current;


        if (!map) {
            return;
        }


        map.setView(
            [lat, lng],
            11
        );


        /*
         * Remove old marker before creating
         * the new one.
         */
        if (markerRef.current) {

            markerRef.current.remove();

            markerRef.current = null;
        }


        const marker =
            L.circleMarker(
                [lat, lng],
                {
                    radius: 10,
                    weight: 3,
                    fillOpacity: 0.9,
                }
            ).addTo(map);


        marker.bindPopup(
            `
        <strong>🚆 ${trainData.trainName}</strong>
        <br/>
        Train No: ${trainData.trainNumber}
        <br/>
        Position: ${current.stationCode || "-"}
        <br/>
        Speed: ${current.speedKmh ?? 0} km/h
      `
        );


        marker.openPopup();


        markerRef.current =
            marker;


        setTimeout(() => {

            map.invalidateSize();

        }, 200);


    }, [trainData]);


    /*
     * ==========================================================
     * CLEANUP MAP
     * ==========================================================
     */

    useEffect(() => {

        return () => {

            if (
                mapInstanceRef.current
            ) {

                mapInstanceRef.current.remove();

                mapInstanceRef.current =
                    null;

                markerRef.current =
                    null;
            }

        };

    }, []);


    /*
     * ==========================================================
     * TOGGLE BETWEEN-STATION SEGMENT
     * ==========================================================
     */

    function toggleSegment(index) {

        setExpandedSegments(
            (previous) => ({
                ...previous,

                [index]:
                    !previous[index],
            })
        );
    }


    /*
     * ==========================================================
     * LOADING
     * ==========================================================
     */

    if (loading) {

        return (
            <div className="p-8 text-center text-teal-600 font-semibold text-sm">

                🔄 Loading live telemetry for train{" "}
                {trainNumber}...

            </div>
        );
    }


    /*
     * ==========================================================
     * ERROR
     * ==========================================================
     */

    if (error && !trainData) {

        return (
            <div className="space-y-3">

                <div className="p-4 text-center text-red-600 bg-red-50 border border-red-200 rounded-lg text-sm">

                    ⚠️ {error}

                </div>

                <div className="p-3 bg-slate-950 text-green-400 rounded-lg font-mono text-xs">

                    <div>
                        Train: {trainNumber}
                    </div>

                    <div>
                        API:
                        {" "}
                        https://api.railradar.in/v1/trains/
                        {cleanTrainNumber(trainNumber)}
                        /live
                    </div>

                </div>

            </div>
        );
    }


    if (!trainData) {
        return null;
    }


    /*
     * ==========================================================
     * DATA
     * ==========================================================
     */

    const current =
        trainData.currentLocation ||
        {};


    const next =
        trainData.nextHalt ||
        {};


    /*
     * FULL ROUTE
     *
     * IMPORTANT:
     * NO slice()
     * NO filter()
     *
     * We keep every station returned by API.
     */
    const route =
        Array.isArray(trainData.route)
            ? trainData.route
            : [];


    const currentCode =
        String(
            current.stationCode || ""
        ).toUpperCase();


    /*
     * Find current station.
     */
    const currentIndex =
        route.findIndex(
            (station) =>
                getStationCode(
                    station
                ) === currentCode
        );


    /*
     * ==========================================================
     * RENDER
     * ==========================================================
     */

    return (
        <div className="max-w-[800px] mx-auto font-sans text-slate-800 space-y-4">

            {/* ======================================================
          HEADER
          ====================================================== */}

            <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">

                <div className="flex justify-between items-start mb-4">

                    <div>

                        <h1 className="text-xl font-bold text-slate-900">

                            {trainData.trainName}

                        </h1>

                        <div className="text-xs text-slate-500">

                            Train No:

                            <strong className="text-slate-800 ml-1">
                                {trainData.trainNumber}
                            </strong>

                        </div>

                    </div>


                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">

                        ● LIVE

                    </span>

                </div>


                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">

                    <div>

                        <div className="text-sm font-bold">
                            {trainData.sourceCode}
                        </div>

                        <div className="text-[10px] text-slate-500 font-bold text-3xl">
                            {trainData.source}
                        </div>

                    </div>


                    <div className="text-slate-400 font-bold text-2xl">
                        →
                    </div>


                    <div className="text-right">

                        <div className="text-sm font-bold">
                            {trainData.destinationCode}
                        </div>

                        <div className="text-[10px] text-slate-500 font-bold text-3xl">
                            {trainData.destination}
                        </div>

                    </div>

                </div>


                <div className="mt-3 text-[11px] text-slate-400">
                    Last updated: {lastUpdated}
                </div>

            </section>


            {/* ======================================================
          LIVE STATS
          ====================================================== */}

            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">

                <div className="bg-white rounded-lg border border-slate-200 p-3">

                    <div className="text-[10px] text-slate-500 uppercase">
                        Speed
                    </div>

                    <div className="text-lg font-bold">
                        {trainData.speedKmh ?? 0}

                        <span className="text-xs ml-1">
                            km/h
                        </span>

                    </div>

                </div>


                <div className="bg-white rounded-lg border border-slate-200 p-3">

                    <div className="text-[10px] text-slate-500 uppercase">
                        Delay
                    </div>

                    <div className="text-lg font-bold">
                        {trainData.delayMinutes ?? 0}

                        <span className="text-xs ml-1">
                            min
                        </span>

                    </div>

                </div>


                <div className="bg-white rounded-lg border border-slate-200 p-3">

                    <div className="text-[10px] text-slate-500 uppercase">
                        Distance
                    </div>

                    <div className="text-lg font-bold">

                        {trainData.distanceFromOriginKm ??
                            "-"}

                        <span className="text-xs ml-1">
                            km
                        </span>

                    </div>

                </div>


                <div className="bg-white rounded-lg border border-slate-200 p-3">

                    <div className="text-[10px] text-slate-500 uppercase">
                        Stations
                    </div>

                    <div className="text-lg font-bold">
                        {route.length}
                    </div>

                </div>

            </section>


            {/* ======================================================
          CURRENT LOCATION
          ====================================================== */}

            <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">

                <div className="text-xs font-bold text-teal-700 uppercase tracking-wide mb-2">

                    📍 Current Train Location

                </div>


                <div className="text-lg font-bold text-slate-900">

                    {current.stationName}

                    {current.stationCode &&
                        current.stationCode !== "-" && (
                            <span className="ml-2 text-slate-500">
                                ({current.stationCode})
                            </span>
                        )}

                </div>


                <div className="text-xs text-slate-600 mt-1">

                    Status:

                    <strong className="ml-1">
                        {current.status}
                    </strong>

                    {" | "}

                    Speed:

                    <strong className="ml-1">
                        {current.speedKmh ?? 0}
                        {" km/h"}
                    </strong>

                </div>


                <div className="text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">

                    Next Halt:

                    <strong className="ml-1">
                        {next.stationName}
                    </strong>

                    {next.distance != null && (
                        <span className="ml-1">
                            ({next.distance} km)
                        </span>
                    )}

                </div>

            </section>


            {/* ======================================================
          ROUTE
          ====================================================== */}

            <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">

                <div className="flex justify-between items-center mb-1">

                    <div className="text-base font-bold text-slate-900">

                        🚉 Complete Journey Timeline

                    </div>

                    <div className="text-xs text-slate-500">
                        {route.length} stations
                    </div>

                </div>


                <div className="text-xs text-slate-500 mb-5">

                    Origin → current location → final destination

                </div>


                {route.length === 0 ? (

                    <div className="p-6 text-center border border-dashed border-slate-300 rounded-lg text-slate-500 text-sm">

                        No route information was returned by
                        RailRadar for this train.

                    </div>

                ) : (

                    <div className="relative">

                        {route.map(
                            (station, index) => {

                                const code =
                                    getStationCode(
                                        station
                                    );


                                const name =
                                    getStationName(
                                        station
                                    );


                                const arrival =
                                    getArrival(
                                        station
                                    );


                                const departure =
                                    getDeparture(
                                        station
                                    );


                                const isCurrent =
                                    code === currentCode;


                                const isPassed =
                                    currentIndex >= 0 &&
                                    index < currentIndex;


                                const isUpcoming =
                                    currentIndex >= 0 &&
                                    index > currentIndex;


                                const isHalt =
                                    station.isHalt === true;


                                const nextHaltIndex =
                                    route.findIndex(
                                        (item, itemIndex) =>
                                            itemIndex > index &&
                                            item.isHalt === true
                                    );


                                const intermediate =
                                    isHalt &&
                                        nextHaltIndex > index
                                        ? route.slice(
                                            index + 1,
                                            nextHaltIndex
                                        )
                                        : [];


                                const expanded =
                                    !!expandedSegments[index];


                                return (
                                    <React.Fragment
                                        key={`${code}-${index}`}
                                    >

                                        {/* =================================================
                        STATION
                        ================================================= */}

                                        <div
                                            className={`grid grid-cols-[90px_42px_1fr] min-h-[90px] relative ${isCurrent
                                                ? "bg-sky-50 rounded-lg"
                                                : ""
                                                }`}
                                        >

                                            {/* TIME */}

                                            <div className="text-right pr-3 pt-2 text-xs">

                                                <div
                                                    className={
                                                        isCurrent
                                                            ? "font-bold text-sky-700"
                                                            : "text-slate-700"
                                                    }
                                                >

                                                    {formatTime(
                                                        arrival
                                                    )}

                                                </div>


                                                {departure &&
                                                    formatTime(
                                                        departure
                                                    ) !==
                                                    formatTime(
                                                        arrival
                                                    ) && (

                                                        <div className="text-slate-400 mt-2">

                                                            {formatTime(
                                                                departure
                                                            )}

                                                        </div>

                                                    )}

                                            </div>


                                            {/* LINE + DOT */}

                                            <div className="flex justify-center relative">

                                                {index <
                                                    route.length - 1 && (

                                                        <div
                                                            className={`absolute top-0 bottom-0 w-1 ${isPassed
                                                                ? "bg-emerald-300"
                                                                : "bg-sky-200"
                                                                }`}
                                                        />

                                                    )}


                                                {isCurrent ? (

                                                    <div className="w-9 h-9 rounded-full bg-sky-500 border-4 border-white shadow-md flex items-center justify-center text-white text-xs z-10 mt-1">

                                                        🚆

                                                    </div>

                                                ) : isPassed ? (

                                                    <div className="w-4 h-4 rounded-full mt-2 bg-emerald-500 border-4 border-emerald-100 z-10" />

                                                ) : (

                                                    <div className="w-4 h-4 rounded-full mt-2 bg-sky-600 border-4 border-sky-100 z-10" />

                                                )}

                                            </div>


                                            {/* STATION INFO */}

                                            <div className="pl-2 pb-5 pt-1">

                                                <div className="flex items-center gap-2">

                                                    <div
                                                        className={`text-base font-bold ${isCurrent
                                                            ? "text-sky-700"
                                                            : "text-slate-800"
                                                            }`}
                                                    >

                                                        {name}

                                                    </div>


                                                    {isCurrent && (

                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500 text-white">

                                                            CURRENT

                                                        </span>

                                                    )}

                                                </div>


                                                <div className="text-xs text-slate-500 font-mono">

                                                    {code || "-"}

                                                </div>


                                                <div className="mt-1 flex flex-wrap gap-1">

                                                    {station.distance != null && (

                                                        <span className="text-xs text-slate-600">

                                                            {station.distance} km

                                                        </span>

                                                    )}


                                                    {station.platform && (

                                                        <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-semibold">

                                                            Platform{" "}
                                                            {station.platform}

                                                        </span>

                                                    )}


                                                    {isPassed && (

                                                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-semibold">

                                                            PASSED

                                                        </span>

                                                    )}


                                                    {isUpcoming && (

                                                        <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded text-[10px] font-semibold">

                                                            UPCOMING

                                                        </span>

                                                    )}

                                                </div>


                                                {isCurrent && (

                                                    <div className="text-sky-600 text-xs font-bold mt-1">

                                                        🚆 TRAIN IS HERE

                                                    </div>

                                                )}

                                            </div>

                                        </div>


                                        {/* =================================================
                        BETWEEN STATIONS
                        ================================================= */}

                                        {intermediate.length > 0 && (

                                            <div className="grid grid-cols-[90px_42px_1fr] relative">

                                                <div />

                                                <div className="flex justify-center relative">

                                                    <div className="absolute top-0 bottom-0 w-1 bg-sky-200" />

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            toggleSegment(
                                                                index
                                                            )
                                                        }
                                                        className="w-7 h-7 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-sm flex items-center justify-center border-2 border-white shadow z-20"
                                                    >

                                                        {expanded
                                                            ? "−"
                                                            : "+"}

                                                    </button>

                                                </div>


                                                <div className="pl-2 py-2">

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            toggleSegment(
                                                                index
                                                            )
                                                        }
                                                        className="text-left bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 rounded-xl px-3 py-2 text-xs font-semibold"
                                                    >

                                                        {expanded
                                                            ? "Hide"
                                                            : "Show"}{" "}

                                                        {intermediate.length}{" "}

                                                        intermediate{" "}

                                                        {intermediate.length ===
                                                            1
                                                            ? "station"
                                                            : "stations"}

                                                        <div className="text-[10px] font-normal text-slate-500 mt-0.5">

                                                            Click to{" "}
                                                            {expanded
                                                                ? "collapse"
                                                                : "view"}{" "}
                                                            stations

                                                        </div>

                                                    </button>

                                                </div>

                                            </div>
                                        )}


                                        {/* =================================================
                        INTERMEDIATE STATIONS
                        ================================================= */}

                                        {intermediate.length > 0 &&
                                            expanded && (

                                                <div className="grid grid-cols-[90px_42px_1fr]">

                                                    <div />

                                                    <div className="flex justify-center">

                                                        <div className="w-1 bg-sky-300 border-l border-dashed border-sky-400" />

                                                    </div>


                                                    <div className="pl-2 space-y-1 py-2">

                                                        {intermediate.map(
                                                            (
                                                                intermediateStation,
                                                                intermediateIndex
                                                            ) => {

                                                                const intermediateCode =
                                                                    getStationCode(
                                                                        intermediateStation
                                                                    );


                                                                const intermediateName =
                                                                    getStationName(
                                                                        intermediateStation
                                                                    );


                                                                return (
                                                                    <div
                                                                        key={`${intermediateCode}-${intermediateIndex}`}
                                                                        className="flex items-center justify-between text-xs py-2 px-3 bg-slate-50 rounded border border-slate-100"
                                                                    >

                                                                        <div className="flex items-center gap-2">

                                                                            <div className="w-2.5 h-2.5 rounded-full bg-sky-600 flex-shrink-0" />

                                                                            <div>

                                                                                <div className="font-semibold text-slate-800">

                                                                                    {intermediateName}

                                                                                </div>

                                                                                <div className="text-[11px] text-slate-500 font-mono">

                                                                                    {intermediateCode}

                                                                                </div>

                                                                            </div>

                                                                        </div>


                                                                        <div className="text-slate-500 font-mono text-[11px]">

                                                                            {intermediateStation.distance != null
                                                                                ? `${intermediateStation.distance} km`
                                                                                : "-"}

                                                                        </div>

                                                                    </div>
                                                                );
                                                            }
                                                        )}

                                                    </div>

                                                </div>
                                            )}

                                    </React.Fragment>
                                );
                            }
                        )}

                    </div>
                )}

            </section>


        

            {/* ======================================================
          SEARCH CONTEXT
          ====================================================== */}

            {(searchFrom || searchTo) && (

                <div className="text-[10px] text-slate-400 text-center">

                    Search:
                    {" "}
                    {searchFrom || "-"}
                    {" → "}
                    {searchTo || "-"}

                </div>

            )}

        </div>
    );
}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 *
 * Default export:
 * Used by the actual application.
 *
 * Named exports:
 * Used by RailTracker.test.jsx to directly test helper
 * functions and improve SonarCloud branch coverage.
 */

export default RailTracker;

export {
    cleanTrainNumber,
    safeString,
    formatTime,
    getStationCode,
    getStationName,
    getArrival,
    getDeparture,
    prepareTrainData,
};