import { useEffect, useState } from "react";
import client from "../api/client";
import { Panel, Button, Badge } from "../components/ui";
import SearchableSelect from "../components/SearchableSelect";

export default function WhatIfSimulation() {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [proposedDate, setProposedDate] = useState(new Date().toISOString().slice(0, 10));
  const [proposedTime, setProposedTime] = useState("12:00");
  const [proposedDuration, setProposedDuration] = useState(120);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  /*
  useEffect(() => {
    client.get("/api/maintenance/groups").then((r) =>
      
      setGroups(r.data.filter((g) => g.statuses.some((s) => ["PENDING_OPTIMIZATION", "RECOMMENDED","APPROVED"].includes(s)))));
      
  }, []);
  */
useEffect(() => {
    client.get("/api/maintenance/groups").then((r) => {
      setGroups(
        r.data.filter((g) =>
          g.statuses.some((s) => 
            ["PENDING_OPTIMIZATION", "RECOMMENDED", "APPROVED"].includes(s)
          )
        )
      );
    });
  }, []);
  
  async function runSimulation() {
    if (!selected) return;
    setLoading(true);
    try {
      const { data } = await client.post("/api/simulation/what-if", {
        task_group_id: selected.task_group_id,
        track_id: selected.track_id,
        proposed_date: proposedDate,
        proposed_start_time: `${proposedTime}:00`,
        proposed_duration_minutes: Number(proposedDuration),
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">What-If Simulation</h1>
      <p className="text-console-muted text-sm">
        Test an alternative schedule without changing the actual operational plan.
      </p>

      <Panel title="Search & Select a Maintenance Request">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Maintenance Request</label>
            <SearchableSelect
              options={groups}
              value={selected}
              onSelect={setSelected}
              placeholder="Search by track, section or task type…"
              getLabel={(g) => `${g.track_code} — ${g.section} (${g.task_types.join(", ")})`}
              getSearchText={(g) => `${g.track_code} ${g.section} ${g.task_types.join(" ")} ${g.preferred_date}`}
              renderOption={(g) => (
                <div>
                  <span className="font-medium">{g.track_code}</span>
                  <span className="ml-2 text-console-muted">{g.section}</span>
                  <div className="text-xs text-console-muted">{g.task_types.join(", ")} · {g.preferred_date}
                    {g.latest_date && g.latest_date !== g.preferred_date ? ` – ${g.latest_date}` : ""}</div>
                </div>
              )}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Proposed Date</label>
            <input type="date" value={proposedDate} onChange={(e) => setProposedDate(e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Proposed Start Time</label>
            <input type="time" value={proposedTime} onChange={(e) => setProposedTime(e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">Proposed Duration (min)</label>
            <input type="number" value={proposedDuration} onChange={(e) => setProposedDuration(e.target.value)}
              className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={runSimulation} disabled={!selected || loading}>
            {loading ? "Recalculating…" : "Run Simulation"}
          </Button>
        </div>
      </Panel>

      {result && (
        <Panel title="Current Plan vs Proposed Plan">
          <div className="grid grid-cols-2 gap-4">
            <PlanCard title="CURRENT (AI-recommended)" data={result.current} />
            <PlanCard title="WHAT-IF (proposed)" data={result.proposed} />
          </div>
          <div className={`mt-4 text-sm font-medium ${result.verdict.startsWith("⚠") ? "text-signal-red" : "text-signal-green"}`}>
            {result.verdict}
          </div>
        </Panel>
      )}
    </div>
  );
}

function PlanCard({ title, data }) {
  return (
    <div className="border border-console-border rounded-sm p-3">
      <div className="text-xs uppercase tracking-wider text-console-muted mb-2">{title}</div>
      <div className="font-mono text-lg text-console-text mb-2">
        {data.date && <span className="text-console-muted text-sm mr-2">{data.date}</span>}
        {data.start} – {data.end}
      </div>
      <div className="text-sm space-y-1">
        <Row label="Train conflicts" value={data.train_conflicts} />
        <Row label="Expected delay" value={`${data.expected_delay_minutes} min`} />
        <Row label="Block utilization" value={`${data.block_utilization_pct}%`} />
        <Row label="Schedule score" value={data.schedule_score} />
      </div>
      {data.conflicts?.length > 0 && (
        <div className="mt-2 space-y-1">
          {data.conflicts.map((c, i) => <Badge key={i} level="HIGH">{c.type}</Badge>)}
        </div>
      )}
    </div>
  );
}
function Row({ label, value }) {
  return <div className="flex justify-between"><span className="text-console-muted">{label}</span><span className="font-mono">{value}</span></div>;
}
