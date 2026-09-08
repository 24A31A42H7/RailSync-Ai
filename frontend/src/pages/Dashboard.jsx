import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { Panel, StatCard, Badge } from "../components/ui";

export default function Dashboard() {
  const [dash, setDash] = useState(null);
  const [groups, setGroups] = useState([]);
  const [emergencies, setEmergencies] = useState([]);

  useEffect(() => {
    client.get("/api/dashboard").then((r) => setDash(r.data));
    client.get("/api/maintenance/groups").then((r) => setGroups(r.data.slice(0, 8)));
    client.get("/api/emergency").then((r) => setEmergencies(r.data.filter((e) => e.status === "OPEN")));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">My Dashboard{dash?.manager ? ` — ${dash.manager}` : ""}</h1>
        <p className="text-console-muted text-sm">Your own maintenance requests and work — every count below is scoped to your account.</p>
      </div>

      {dash && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Maintenance Tasks" value={dash.active_maintenance_tasks} />
          <StatCard label="Pending Approvals" value={dash.pending_approvals} tone="amber" />
          <StatCard label="Approved Tasks" value={dash.approved_tasks} tone="blue" />
          <StatCard label="In Progress" value={dash.in_progress} tone="amber" />
          <StatCard label="Completed" value={dash.completed} tone="green" />
          <StatCard label="Critical Tasks" value={dash.critical_tasks} tone="red" />
          <StatCard label="Active Blocks" value={dash.active_blocks} tone="blue" />
          <StatCard label="Train Conflicts" value={dash.train_conflicts} tone="red" />
        </div>
      )}

      {emergencies.length > 0 && (
        <Panel title="🚨 Open Emergency Events">
          <div className="space-y-2">
            {emergencies.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b border-console-border pb-2 last:border-0">
                <div>
                  <Badge level={e.severity}>{e.severity}</Badge>
                  <span className="ml-2 font-medium">{e.event_type}</span>
                  <span className="ml-2 text-console-muted">{e.description}</span>
                </div>
                <Link to="/emergency" className="text-signal-blue text-xs hover:underline">Manage →</Link>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Recent Maintenance Requests" action={
        <Link to="/requests" className="text-xs text-signal-blue hover:underline">View all →</Link>
      }>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-console-muted text-xs uppercase border-b border-console-border">
              <th className="pb-2">Section / Track</th><th className="pb-2">Tasks</th>
              <th className="pb-2">Priority</th><th className="pb-2">Date</th><th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={`${g.task_group_id}-${g.track_id}`} className="border-b border-console-border/50 last:border-0">
                <td className="py-2">
                  <Link to={`/requests/${g.task_group_id}/${g.track_id}`} className="hover:text-signal-blue">
                    {g.track_code}
                  </Link>
                  <div className="text-console-muted text-xs">{g.section}</div>
                </td>
                <td className="py-2 text-console-muted">{g.task_types.join(", ")}</td>
                <td className="py-2"><Badge level={g.worst_priority_class} /></td>
                <td className="py-2 font-mono">{g.preferred_date}</td>
                <td className="py-2 text-console-muted">{g.statuses.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
