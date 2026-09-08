import { useEffect, useState } from "react";
import client from "../api/client";
import { Panel, TimelineBar, Badge } from "../components/ui";
import StationSearchInput from "../components/StationSearchInput";

export default function BlockAvailability() {
  const [fromStation, setFromStation] = useState(null);
  const [toStation, setToStation] = useState(null);
  const [section, setSection] = useState(null);
  const [sectionError, setSectionError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);

  useEffect(() => {
    setSection(null);
    setTracks([]);
    setTrackId("");
    setSectionError("");
    if (!fromStation || !toStation) return;
    if (fromStation.code === toStation.code) {
      setSectionError("From and To stations cannot be the same.");
      return;
    }
    setResolving(true);
    client.post("/api/sections/resolve", { from_station: fromStation, to_station: toStation })
      .then((r) => { setSection(r.data.section); setTracks(r.data.tracks); })
      .catch((err) => setSectionError(err?.response?.data?.detail || "Could not resolve a railway section"))
      .finally(() => setResolving(false));
  }, [fromStation, toStation]);

  useEffect(() => {
    if (section) {
      const trackParam = trackId ? `&track_id=${trackId}` : "";
      client.get(`/api/blocks/availability?section_id=${section.id}&on_date=${date}${trackParam}`)
        .then((r) => setData(r.data));
    }
  }, [section, trackId, date]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Block Availability</h1>

      <Panel title="Search Railway Corridor">
        <div className="grid grid-cols-2 gap-4">
          <StationSearchInput label="From Station" value={fromStation} onSelect={setFromStation} />
          <StationSearchInput label="To Station" value={toStation} onSelect={setToStation} />
        </div>
        {resolving && <div className="text-console-muted text-sm mt-3">Resolving railway section…</div>}
        {sectionError && <div className="text-signal-red text-sm mt-3">{sectionError}</div>}
        {section && (
          <div className="flex items-center gap-4 mt-4">
            <select value={trackId} onChange={(e) => setTrackId(e.target.value)}
              className="bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm">
              <option value="">All tracks</option>
              {tracks.map((t) => <option key={t.id} value={t.id}>{t.track_code}</option>)}
            </select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm" />
          </div>
        )}
      </Panel>

      {data && (
        <>
          {data.live_train_conflicts?.length > 0 && (
            <Panel title="⚠ Live Train Conflicts">
              <div className="space-y-2 text-sm">
                {data.live_train_conflicts.map((c, i) => (
                  <div key={i}>
                    <Badge level="CRITICAL">{c.type}</Badge>
                    <span className="ml-2 text-console-muted">{c.description}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title={`${data.section} — ${data.date}`} action={
            <Badge level={data.data_source === "REAL_API" ? "GREEN" : "MEDIUM"}>
              {data.data_source === "REAL_API" ? "LIVE API" : "SIMULATED DATA"}
            </Badge>
          }>
            <TimelineBar segments={data.timeline} />
          </Panel>

          <Panel title="Segment Detail">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-console-muted text-xs uppercase border-b border-console-border">
                  <th className="pb-2">Time</th><th className="pb-2">Status</th><th className="pb-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.timeline.map((seg, i) => (
                  <tr key={i} className="border-b border-console-border/50 last:border-0">
                    <td className="py-1 font-mono">{seg.start_time}–{seg.end_time}</td>
                    <td className="py-1">
                      {seg.kind === "TRAIN" && "🚆"} {seg.kind === "MAINTENANCE" && "🔵"}
                      {seg.kind === "FREE" && "🟢"} {seg.kind === "BUFFER" && "⚪"} {seg.kind}
                    </td>
                    <td className="py-1 text-console-muted">{seg.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
