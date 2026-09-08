import { useEffect, useState } from "react";
import client from "../api/client";
import { Panel, Button, Badge } from "../components/ui";
import StationSearchInput from "../components/StationSearchInput";

export default function EmergencyRescheduling() {
  const [fromStation, setFromStation] = useState(null);
  const [toStation, setToStation] = useState(null);
  const [section, setSection] = useState(null);
  const [sectionError, setSectionError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState("");
  const [eventType, setEventType] = useState("SIGNAL_FAILURE");
  const [severity, setSeverity] = useState("CRITICAL");
  const [description, setDescription] = useState("");
  const [emergencies, setEmergencies] = useState([]);
  const [reoptResult, setReoptResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  function loadEmergencies() {
    client.get("/api/emergency").then((r) => setEmergencies(r.data));
  }
  useEffect(loadEmergencies, []);

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

  async function reportEmergency(e) {
    e.preventDefault();
    setReportError("");
    if (!section) {
      setReportError("Search and select the From/To stations for the affected corridor first.");
      return;
    }
    await client.post("/api/emergency", {
      section_id: section.id, track_id: trackId || null,
      event_type: eventType, severity, description,
    });
    setDescription("");
    loadEmergencies();
  }

  async function reoptimize(id) {
    setLoading(true);
    setReoptResult(null);
    const start = performance.now();
    try {
      const { data } = await client.post(`/api/emergency/${id}/reoptimize`);
      data.client_elapsed = ((performance.now() - start) / 1000).toFixed(2);
      setReoptResult(data);
    } finally {
      setLoading(false);
    }
  }

  async function resolve(id) {
    await client.post(`/api/emergency/${id}/resolve`);
    loadEmergencies();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl font-semibold">🚨 Emergency Re-Scheduling</h1>
      <p className="text-console-muted text-sm">
        Report a track failure, signal failure, OHE issue or other critical defect — affected maintenance task
        groups are automatically re-optimized with CP-SAT. These are recommendations only: nothing here reroutes
        or controls actual train traffic, and every result still needs manager approval.
      </p>

      <Panel title="Report Emergency Event">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <StationSearchInput label="From Station" value={fromStation} onSelect={setFromStation} />
          <StationSearchInput label="To Station" value={toStation} onSelect={setToStation} />
        </div>
        {resolving && <div className="text-console-muted text-sm mb-3">Resolving railway section…</div>}
        {sectionError && <div className="text-signal-red text-sm mb-3">{sectionError}</div>}

        <form onSubmit={reportEmergency} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Track (optional)</label>
            <select value={trackId} onChange={(e) => setTrackId(e.target.value)} disabled={!tracks.length}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm disabled:opacity-40">
              <option value="">Whole section</option>
              {tracks.map((t) => <option key={t.id} value={t.id}>{t.track_code}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Event Type</label>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm">
              <option value="SIGNAL_FAILURE">Signal Failure</option>
              <option value="OHE_TRIP">OHE Trip</option>
              <option value="TRACK_FRACTURE">Track Fracture</option>
              <option value="POINT_FAILURE">Point Machine Failure</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm">
              <option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm" />
          </div>
          {reportError && <div className="col-span-2 text-signal-red text-sm">{reportError}</div>}
          <div className="col-span-2">
            <Button type="submit" variant="danger">Report Emergency</Button>
          </div>
        </form>
      </Panel>

      <Panel title="Emergency Events">
        <div className="space-y-3">
          {emergencies.map((e) => (
            <div key={e.id} className="border border-console-border rounded-sm p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Badge level={e.status === "OPEN" ? "OPEN" : "RESOLVED"}>{e.status}</Badge>
                  <span className="ml-2 font-medium">{e.event_type}</span>
                  <span className="ml-2 text-console-muted text-sm">{e.description}</span>
                </div>
                {e.status === "OPEN" && (
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => reoptimize(e.id)} disabled={loading}>
                      {loading ? "Re-optimizing…" : "Re-optimize (CP-SAT)"}
                    </Button>
                    <Button variant="success" onClick={() => resolve(e.id)}>Mark Resolved</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {emergencies.length === 0 && <div className="text-console-muted text-sm">No emergency events reported yet.</div>}
        </div>
      </Panel>

      {reoptResult && (
        <Panel title="Re-optimization Result">
          <div className="text-sm mb-3 font-mono text-console-muted">
            Affected task groups: {reoptResult.affected_task_groups} · Affected blocks: {reoptResult.affected_blocks_count} ·
            Server solve time: {reoptResult.reoptimization_time_seconds}s · Round-trip: {reoptResult.client_elapsed}s
          </div>
          {reoptResult.results.length === 0 && (
            <div className="text-console-muted text-sm">No pending/recommended task groups on this section were affected today.</div>
          )}
          <div className="space-y-3">
            {reoptResult.results.map((r) => (
              <div key={r.task_group_id + r.track_id} className="border border-console-border rounded-sm p-3 text-sm">
                <div className="font-medium">{r.task_types.join(", ")}</div>
                {r.recommended_start ? (
                  <div className="text-signal-green font-mono">New window: {r.recommended_start}–{r.recommended_end}</div>
                ) : (
                  <div className="text-signal-red">No feasible alternative window found today.</div>
                )}
                <ul className="text-console-muted mt-1">
                  {r.reasons?.map((reason, i) => <li key={i}>• {reason}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
