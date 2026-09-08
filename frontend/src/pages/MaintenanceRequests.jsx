import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { Panel, Badge } from "../components/ui";

export default function MaintenanceRequests() {
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    client.get("/api/maintenance/groups").then((r) => setGroups(r.data));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Maintenance Requests</h1>
        <Link to="/requests/new" className="px-4 py-2 bg-signal-blue text-white text-sm rounded-sm hover:bg-blue-500">
          + Create Maintenance Task
        </Link>
      </div>

      <Panel>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-console-muted text-xs uppercase border-b border-console-border">
              <th className="pb-2">Section / Track</th><th className="pb-2">Tasks</th>
              <th className="pb-2">Priority</th><th className="pb-2">Date</th>
              <th className="pb-2">Status</th><th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={`${g.task_group_id}-${g.track_id}`} className="border-b border-console-border/50 last:border-0">
                <td className="py-2">{g.section}<div className="text-console-muted text-xs">{g.track_code}</div></td>
                <td className="py-2">
                  {g.task_count} task{g.task_count > 1 ? "s" : ""}
                  <div className="text-console-muted text-xs">{g.task_types.join(", ")}</div>
                </td>
                <td className="py-2"><Badge level={g.worst_priority_class} /></td>
                <td className="py-2 font-mono">
                  {g.preferred_date}{g.latest_date && g.latest_date !== g.preferred_date ? ` – ${g.latest_date}` : ""}
                </td>
                <td className="py-2 text-console-muted">{g.statuses.join(", ")}</td>
                <td className="py-2 text-right">
                  <Link to={`/requests/${g.task_group_id}/${g.track_id}`} className="text-signal-blue text-xs hover:underline">
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <div className="text-console-muted text-sm">No maintenance requests yet.</div>}
      </Panel>
    </div>
  );
}
