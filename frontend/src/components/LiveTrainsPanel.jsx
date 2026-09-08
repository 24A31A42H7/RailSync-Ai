import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../api/client";
import { Panel, Badge } from "./ui";

/**
 * Embeddable "live track of the selected track" panel — streams via
 * /ws/live-trains. Section-level live data is honestly labelled per
 * train's `granularity` field; track_id is passed only for on-screen
 * context, not because the underlying feed can isolate to one physical track.
 */
export default function LiveTrainsPanel({ sectionId, trackId, trackCode }) {
  const [payload, setPayload] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (wsRef.current) wsRef.current.close();
    if (!sectionId) return;
    const trackParam = trackId ? `&track_id=${trackId}` : "";
    const ws = new WebSocket(`${WS_URL}/ws/live-trains?section_id=${sectionId}${trackParam}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (msg) => {
      try { setPayload(JSON.parse(msg.data)); } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [sectionId, trackId]);

  if (!sectionId) return null;
  console.log(payload);
  return (
    <Panel title={`Live Trains${trackCode ? ` — ${trackCode}` : ""}`} action={
      <span className={`text-xs font-mono flex items-center gap-2 ${connected ? "text-signal-green" : "text-signal-red"}`}>
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-signal-green" : "bg-signal-red"}`} />
        {connected ? "STREAMING" : "CONNECTING…"}
      </span>
    }>
      {!payload && <div className="text-console-muted text-sm">Waiting for live data…</div>}
      {payload && (
        <>
          <div className="mb-2">
            <Badge level={payload.data_source === "REAL_API" ? "GREEN" : "MEDIUM"}>
              {payload.data_source === "REAL_API" ? "LIVE API" : "SIMULATED DATA"}
            </Badge>
          </div>
          {payload.trains.length === 0 && (
            <div className="text-console-muted text-sm">No trains currently reported on this corridor.</div>
          )}
          <div className="space-y-2">
            {payload.trains.map((t, i) => (
              <div key={i} className="border border-console-border rounded-sm p-2 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono font-medium">{t.train_number}</span>
                    <span className="ml-2">{t.train_name}</span>
                  </div>
                  <Badge level={t.status === "DELAYED" ? "HIGH" : "GREEN"}>{t.status}</Badge>
                </div>
                     <div className="text-console-muted text-xs mt-1 space-x-2">
                      <span className="font-medium text-console-text">Type: {t.train_type}</span>
                      <span>· Route: {t.origin} → {t.destination}</span>
                      <span>· Dep: {t.departure_time || "N/A"}</span>
                      <span>· Arr: {t.arrival_time || "N/A"}</span>
                      <span>· {t.current_location_label || "position not reported"}</span>
                      <span>· Delay: {t.delay_minutes}min</span>
                    </div>
                
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
