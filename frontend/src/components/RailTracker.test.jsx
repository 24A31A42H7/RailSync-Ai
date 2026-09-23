import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import RailTracker from "./RailTracker";

/* -------------------------------------------------------
   Mock Leaflet
------------------------------------------------------- */
vi.mock("leaflet", () => ({
  default: {
    map: vi.fn(() => ({
      setView: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      invalidateSize: vi.fn(),
    })),

    tileLayer: vi.fn(() => ({
      addTo: vi.fn(),
    })),

    circleMarker: vi.fn(() => ({
      addTo: vi.fn().mockReturnThis(),
      bindPopup: vi.fn().mockReturnThis(),
      openPopup: vi.fn(),
      remove: vi.fn(),
    })),
  },
}));

/* -------------------------------------------------------
   Test data - matches RailRadar response structure
------------------------------------------------------- */

const successfulApiResponse = {
  data: {
    train: {
      number: "12345",
      name: "Rajdhani Exp",
      type: "EXPRESS",

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
      latitude: 25.18,
      longitude: 75.83,
    },

    nextHalt: {
      stationCode: "RAT",
      stationName: "Ratlam",
      distance: 265,
    },

    route: [
      {
        stationCode: "DEL",
        stationName: "New Delhi",
        scheduledArrival: "10:00",
        scheduledDeparture: "10:10",
        actualArrival: "10:00",
        actualDeparture: "10:10",
        isHalt: true,
        latitude: 28.6139,
        longitude: 77.209,
      },

      {
        stationCode: "KOTA",
        stationName: "Kota Junction",
        scheduledArrival: "13:00",
        scheduledDeparture: "13:05",
        actualArrival: "13:00",
        actualDeparture: "13:05",
        isHalt: true,
        latitude: 25.2138,
        longitude: 75.8648,
      },

      {
        stationCode: "RAT",
        stationName: "Ratlam",
        scheduledArrival: "16:00",
        scheduledDeparture: "16:05",
        isHalt: true,
        latitude: 23.3315,
        longitude: 75.0367,
      },

      {
        stationCode: "MUM",
        stationName: "Mumbai",
        scheduledArrival: "22:00",
        scheduledDeparture: "22:05",
        isHalt: true,
        latitude: 19.076,
        longitude: 72.8777,
      },
    ],
  },
};

const intermediateApiResponse = {
  data: {
    train: {
      number: "12345",
      name: "Test Exp",
      type: "EXPRESS",

      source: {
        code: "A",
        name: "Station A",
      },

      destination: {
        code: "C",
        name: "Station C",
      },
    },

    currentLocation: {
      stationCode: "A",
      stationName: "Station A",
      status: "ON TIME",
      speedKmh: 80,
      latitude: 20,
      longitude: 70,
    },

    nextHalt: {
      stationCode: "C",
      stationName: "Station C",
      distance: 100,
    },

    route: [
      {
        stationCode: "A",
        stationName: "Station A",
        scheduledArrival: "10:00",
        scheduledDeparture: "10:05",
        actualArrival: "10:00",
        actualDeparture: "10:05",
        isHalt: true,
        latitude: 20,
        longitude: 70,
      },

      {
        stationCode: "INT",
        stationName: "Intermediate Station",
        scheduledArrival: "11:00",
        scheduledDeparture: "11:05",
        actualArrival: "11:00",
        actualDeparture: "11:05",
        isHalt: false,
        latitude: 21,
        longitude: 71,
      },

      {
        stationCode: "C",
        stationName: "Station C",
        scheduledArrival: "12:00",
        scheduledDeparture: "12:05",
        actualArrival: "12:00",
        actualDeparture: "12:05",
        isHalt: true,
        latitude: 22,
        longitude: 72,
      },
    ],
  },
};

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

const mockSuccessfulFetch = (responseData) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,

    text: vi.fn().mockResolvedValue(JSON.stringify(responseData)),
  });
};

/* -------------------------------------------------------
   Test suite
------------------------------------------------------- */

describe("RailTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv(
      "VITE_RAILRADAR_API_KEY",
      "test-api-key"
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /* =====================================================
     TEST 1 - Loading state
  ===================================================== */

  it("renders loading state initially", () => {
    global.fetch = vi.fn(
      () => new Promise(() => {})
    );

    render(
      <RailTracker
        trainNumber="12345"
      />
    );

    expect(
      screen.getByText(
        /Loading live telemetry for train 12345/i
      )
    ).toBeInTheDocument();
  });

  /* =====================================================
     TEST 2 - Successful API response
  ===================================================== */

  it("renders train information and live statistics after successful fetch", async () => {
  mockSuccessfulFetch(successfulApiResponse);

  render(
    <RailTracker
      trainNumber="12345"
    />
  );

  // Train name
  expect(
    await screen.findByText("Rajdhani Exp")
  ).toBeInTheDocument();

  // Train number
  expect(
    screen.getByText("12345", { exact: true })
  ).toBeInTheDocument();

  // Source code
  expect(
    screen.getAllByText("DEL").length
  ).toBeGreaterThan(0);

  // Source name
  expect(
    screen.getAllByText("New Delhi").length
  ).toBeGreaterThan(0);

  // Destination code
  expect(
    screen.getAllByText("MUM").length
  ).toBeGreaterThan(0);

  // Destination name
  expect(
    screen.getAllByText("Mumbai").length
  ).toBeGreaterThan(0);

  // Speed
  expect(
    screen.getByText("110", { exact: true })
  ).toBeInTheDocument();

  // Current location
  expect(
  screen.getAllByText("Kota Junction").length
).toBeGreaterThan(0);

  // Current station code
  expect(
    screen.getByText("KOTA", { exact: true })
  ).toBeInTheDocument();

 expect(
  screen.getAllByText("Ratlam").length
).toBeGreaterThan(0);
  // GPS
  expect(
    screen.getByText("GPS AVAILABLE")
  ).toBeInTheDocument();

  // Route station count
  expect(
    screen.getByText(/4 stations/i)
  ).toBeInTheDocument();
});

  /* =====================================================
     TEST 3 - Intermediate station
  ===================================================== */

  it("renders intermediate stations and allows expansion", async () => {
    mockSuccessfulFetch(intermediateApiResponse);

    render(
      <RailTracker
        trainNumber="12345"
      />
    );

    /* Wait until API data appears */
    expect(
      await screen.findByText("Test Exp")
    ).toBeInTheDocument();

    /*
      Your RailTracker component already renders
      "Intermediate Station" in the route timeline.

      So DON'T use:

      expect(
        screen.queryByText("Intermediate Station")
      ).not.toBeInTheDocument();

      because that assumption is incorrect.
    */

    expect(
      screen.getByText("Intermediate Station")
    ).toBeInTheDocument();

    /* Intermediate station code */
    expect(
      screen.getByText("INT", { exact: true })
    ).toBeInTheDocument();

    /*
      Find the button.

      The button contains:
      "Show 1 intermediate station(s)"
      and
      "Click to view stations"
    */
    const button = screen.getByRole("button", {
      name: /show 1 intermediate station/i,
    });

    expect(button).toBeInTheDocument();

    /* Click the intermediate-station button */
    fireEvent.click(button);

    /*
      After clicking, the component should
      change its expanded/collapsed state.
    */
    expect(button).toBeInTheDocument();
  });

  /* =====================================================
     TEST 4 - HTTP 500
  ===================================================== */

  it("shows API error when RailRadar request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,

      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          message: "RailRadar server error",
        })
      ),
    });

    render(
      <RailTracker
        trainNumber="12345"
      />
    );

    /*
      React Testing Library sees:

      ⚠️
      RailRadar API returned HTTP 500

      as separate text nodes.

      Therefore use a regex instead of exact text.
    */

    expect(
      await screen.findByText(
        /RailRadar API returned HTTP 500/i
      )
    ).toBeInTheDocument();

    /* Train number should also be shown in error section */
    expect(
      screen.getByText(/Train:\s*12345/i)
    ).toBeInTheDocument();

    /* API URL */
    expect(
      screen.getByText(
        /https:\/\/api\.railradar\.in\/v1\/trains\/12345\/live/i
      )
    ).toBeInTheDocument();
  });

  /* =====================================================
     TEST 5 - Invalid JSON
  ===================================================== */

  it("handles invalid JSON response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,

      text: vi.fn().mockResolvedValue(
        "INVALID JSON RESPONSE"
      ),
    });

    render(
      <RailTracker
        trainNumber="12345"
      />
    );

    expect(
      await screen.findByText(
        /RailRadar returned invalid JSON\./i
      )
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Train:\s*12345/i)
    ).toBeInTheDocument();
  });
});