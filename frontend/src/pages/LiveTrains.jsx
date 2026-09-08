import { useEffect, useState } from "react";
import client from "../api/client";
import { Panel } from "../components/ui";
import StationSearchInput from "../components/StationSearchInput";
import LiveTrainsPanel from "../components/LiveTrainsPanel";

export default function LiveTrains() {
  const [fromStation, setFromStation] = useState(null);
  const [toStation, setToStation] = useState(null);
  const [section, setSection] = useState(null);
  const [sectionError, setSectionError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState("");

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

  const track = tracks.find((t) => t.id === trackId);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Live Train Tracking</h1>
      <p className="text-console-muted text-sm">
        Search a From/To corridor to see current train awareness for it. Positions are approximate
        progress along the corridor, not exact track occupancy — granularity is shown per train.
      </p>

      <Panel title="Search Railway Corridor">
        <div className="grid grid-cols-2 gap-4">
          <StationSearchInput label="From Station" value={fromStation} onSelect={setFromStation} />
          <StationSearchInput label="To Station" value={toStation} onSelect={setToStation} />
        </div>
        {resolving && <div className="text-console-muted text-sm mt-3">Resolving railway section…</div>}
        {sectionError && <div className="text-signal-red text-sm mt-3">{sectionError}</div>}
        {section && tracks.length > 0 && (
          <div className="mt-4">
            <select value={trackId} onChange={(e) => setTrackId(e.target.value)}
              className="bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm">
              <option value="">All tracks</option>
              {tracks.map((t) => <option key={t.id} value={t.id}>{t.track_code}</option>)}
            </select>
          </div>
        )}
      </Panel>

      {section && <LiveTrainsPanel sectionId={section.id} trackId={trackId || null} trackCode={track?.track_code} />}
    </div>
  );
}
