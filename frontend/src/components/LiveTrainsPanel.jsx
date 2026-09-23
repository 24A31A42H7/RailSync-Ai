import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../api/client";
import { Panel, Badge } from "./ui";
import RailTracker from "./RailTracker";

export default function LiveTrainsPanel({
  sectionId,
  trackId,
  trackCode,
  searchFrom,
  searchTo,
}) {
  const [payload, setPayload] = useState(null);
  const [connected, setConnected] = useState(false);
  const [selectedTrainNumber, setSelectedTrainNumber] = useState(null);
  const [showRawJson, setShowRawJson] = useState(false);

  const wsRef = useRef(null);
  const inspectorRef = useRef(null);

  /*
   * ============================================================
   * WEBSOCKET - LIVE TRAINS LIST
   * ============================================================
   */
  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!sectionId) {
      setPayload(null);
      setConnected(false);
      return;
    }

    const trackParam = trackId
      ? `&track_id=${encodeURIComponent(trackId)}`
      : "";

    const wsUrl =
      `${WS_URL}/ws/live-trains` +
      `?section_id=${encodeURIComponent(sectionId)}` +
      trackParam;

    console.log("🔌 Connecting WebSocket:", wsUrl);

    const ws = new WebSocket(wsUrl);

    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      setConnected(true);
    };

    ws.onclose = () => {
      console.log("❌ WebSocket disconnected");
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
      setConnected(false);
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        console.log("📡 WebSocket payload:", data);

        setPayload(data);
      } catch (error) {
        console.error("❌ Invalid WebSocket JSON:", error);
      }
    };

    return () => {
      console.log("🔌 Closing WebSocket");

      ws.close();

      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [sectionId, trackId]);

  /*
   * ============================================================
   * SCROLL TO TRACKER
   * ============================================================
   */
  useEffect(() => {
    if (selectedTrainNumber && inspectorRef.current) {
      inspectorRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedTrainNumber]);

  if (!sectionId) {
    return null;
  }

  /*
   * Find selected train from WebSocket list.
   *
   * IMPORTANT:
   * This object is ONLY used to identify the train.
   * RailTracker will independently call RailRadar API
   * using this train number.
   */
  const selectedTrainObj = payload?.trains?.find(
    (t) =>
      String(t.train_number) === String(selectedTrainNumber)
  );

  return (
    <div className="space-y-4">

      {/* ========================================================
          RAW WEBSOCKET DEBUG
          ======================================================== */}
      <div className="bg-slate-900 border border-slate-700 rounded-md p-3 text-xs text-slate-300 font-mono">

        <div className="flex justify-between items-center mb-1">

          <span className="font-bold text-teal-400">
            🔍 RAW WEBSOCKET PAYLOAD INSPECTOR
          </span>

          <button
            onClick={() => setShowRawJson((prev) => !prev)}
            className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded text-slate-200 border border-slate-600"
          >
            {showRawJson
              ? "Hide Raw JSON"
              : "Show Raw JSON"}
          </button>

        </div>

        {showRawJson && (
          <pre className="max-h-40 overflow-auto bg-slate-950 p-2 rounded text-[11px] text-green-400 mt-2">
            {payload
              ? JSON.stringify(payload, null, 2)
              : "No payload received yet..."}
          </pre>
        )}

      </div>


      {/* ========================================================
          LIVE TRAINS
          ======================================================== */}
      <Panel
        title={`Live Trains${trackCode ? ` — ${trackCode}` : ""}`}
        action={
          <span
            className={`text-xs font-mono flex items-center gap-2 ${connected
              ? "text-emerald-500"
              : "text-red-500"
              }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${connected
                ? "bg-emerald-500"
                : "bg-red-500"
                }`}
            />

            {connected
              ? "STREAMING"
              : "CONNECTING…"}
          </span>
        }
      >

        {!payload && (
          <div className="text-slate-400 text-sm">
            Waiting for live data…
          </div>
        )}

        {payload && (
          <>

            {/* DATA SOURCE */}
            <div className="mb-2">

              <Badge
                level={
                  payload.data_source === "REAL_API"
                    ? "GREEN"
                    : "MEDIUM"
                }
              >
                {payload.data_source === "REAL_API"
                  ? "LIVE API"
                  : "SIMULATED DATA"}
              </Badge>

            </div>


            {/* NO TRAINS */}
            {payload.trains?.length === 0 && (
              <div className="text-slate-400 text-sm">
                No trains currently reported on this corridor.
              </div>
            )}


            {/* TRAIN LIST */}
            <div className="space-y-2">

              {payload.trains?.map((t, i) => {

                const isSelected =
                  String(selectedTrainNumber) ===
                  String(t.train_number);

                return (
                  <div
                    key={`${t.train_number}-${i}`}
                    onClick={() =>
                      setSelectedTrainNumber(
                        isSelected
                          ? null
                          : t.train_number
                      )
                    }
                    className={`border rounded-sm p-2 text-sm cursor-pointer transition-colors ${isSelected
                      ? "border-emerald-500 bg-emerald-950/20"
                      : "border-slate-700 hover:bg-slate-800/40"
                      }`}
                  >

                    <div className="flex items-center justify-between">

                      <div>

                        <span className="font-mono font-medium">
                          {t.train_number}
                        </span>

                        <span className="ml-2">
                          {t.train_name || "Unknown Train"}
                        </span>

                      </div>

                      <Badge
                        level={
                          t.status === "DELAYED"
                            ? "HIGH"
                            : "GREEN"
                        }
                      >
                        {t.status || "RUNNING"}
                      </Badge>

                    </div>


                    <div className="text-slate-400 text-xs mt-1 space-x-2">

                      <span className="font-medium text-slate-200">
                        Type: {t.train_type || "N/A"}
                      </span>

                      <span>
                        · Route: {t.origin || "?"}
                        {" → "}
                        {t.destination || "?"}
                      </span>

                      <span>
                        · Dep: {t.departure_time || "N/A"}
                      </span>

                      <span>
                        · Arr: {t.arrival_time || "N/A"}
                      </span>

                      <span>
                        ·{" "}
                        {t.current_location_label ||
                          "position not reported"}
                      </span>

                      <span>
                        · Delay:{" "}
                        {t.delay_minutes ?? 0} min
                      </span>

                    </div>

                  </div>
                );
              })}

            </div>

          </>
        )}

      </Panel>


      {/* ========================================================
          SELECTED TRAIN
          ======================================================== */}
      {selectedTrainNumber && (
        <div
          ref={inspectorRef}
          className="border border-slate-700 rounded-md p-4 bg-slate-900/50 scroll-mt-4"
        >

          <div className="flex items-center justify-between mb-3">

            <span className="text-xs font-mono text-slate-300 uppercase tracking-wider">
              Detailed Telemetry Inspector — Train #
              {selectedTrainNumber}
            </span>

            <button
              onClick={() =>
                setSelectedTrainNumber(null)
              }
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-700"
            >
              Close Inspector ✕
            </button>

          </div>


          {/* ====================================================
              WEBSOCKET SUMMARY
              ==================================================== */}
          <div className="mb-3 text-[10px] font-mono text-cyan-300 bg-slate-950 p-2 rounded">

            <strong>
              WebSocket Train Summary:
            </strong>
            {/**
            <pre className="mt-2 overflow-auto max-h-40">
              {JSON.stringify(
                selectedTrainObj,
                null,
                2
              )}
            </pre>
            **/}

          </div>


          {/* ====================================================
              IMPORTANT:
              DO NOT PASS initialTrainObj
              ==================================================== */}
          <RailTracker
            trainNumber={selectedTrainNumber}
            searchFrom={searchFrom}
            searchTo={searchTo}
          />

        </div>
      )}

    </div>
  );
}