import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import client from "../api/client";
import { Panel, StatCard } from "../components/ui";

export default function Analytics() {
  const [analytics, setAnalytics] = useState(null);
  const [report, setReport] = useState(null);
  const [period, setPeriod] = useState("daily");

  useEffect(() => {
    client.get("/api/analytics").then((r) => setAnalytics(r.data));
  }, []);

  useEffect(() => {
    client.get(`/api/reports?period=${period}`).then((r) => setReport(r.data));
  }, [period]);

  if (!analytics) return <div className="text-console-muted">Loading…</div>;

  const beforeAfterData = [
    { name: "Conflicts", first: analytics.before_after.conflicts_first_generated ?? 0, latest: analytics.before_after.conflicts_most_recent ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Analytics &amp; Reports</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Block Utilization" value={`${analytics.block_utilization_pct}%`} tone="blue" />
        <StatCard label="Open Conflicts" value={analytics.conflicts_open} tone="amber" />
        <StatCard label="Overdue Tasks" value={analytics.overdue_tasks} tone="red" />
        <StatCard label="Schedule Versions Generated" value={analytics.before_after.schedule_versions_generated} />
      </div>

      <Panel title="Conflicts — First Generated Schedule vs Most Recent">
        <div className="text-xs text-console-muted mb-2">
          {analytics.before_after.note}
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={beforeAfterData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#26324A" />
              <XAxis dataKey="name" stroke="#7C8CA8" />
              <YAxis stroke="#7C8CA8" allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#121A29", border: "1px solid #26324A" }} />
              <Bar dataKey="first" fill="#F2A93B" name="First generated" />
              <Bar dataKey="latest" fill="#33D17A" name="Most recent" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Reports" action={
        <div className="flex gap-2">
          {["daily", "weekly", "monthly"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs rounded-sm border ${period === p ? "border-signal-blue text-signal-blue" : "border-console-border text-console-muted"}`}>
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      }>
        {report && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <KV k="Completed Maintenance" v={report.completed_maintenance} />
            <KV k="Pending Maintenance" v={report.pending_maintenance} />
            <KV k="Critical Tasks" v={report.critical_tasks} />
            <KV k="Overdue Tasks" v={report.overdue_tasks} />
            <KV k="Blocks Used" v={`${report.blocks_used} / ${report.total_blocks}`} />
            <KV k="Emergency Events" v={report.emergency_events} />
          </div>
        )}
      </Panel>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div className="border border-console-border rounded-sm p-3">
      <div className="text-xs text-console-muted">{k}</div>
      <div className="text-lg font-mono">{v}</div>
    </div>
  );
}
