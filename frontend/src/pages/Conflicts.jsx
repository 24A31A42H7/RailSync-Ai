import { useEffect, useState } from "react";
import client from "../api/client";
import { Panel, Badge } from "../components/ui";

export default function Conflicts() {
  const [conflicts, setConflicts] = useState([]);

  useEffect(() => {
    client.get("/api/conflicts").then((r) => setConflicts(r.data));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Detected Conflicts</h1>
      <Panel>
        {conflicts.length === 0 && <div className="text-console-muted text-sm">No conflicts detected in recent schedule generations.</div>}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-console-muted text-xs uppercase border-b border-console-border">
              <th className="pb-2">Type</th><th className="pb-2">Severity</th><th className="pb-2">Description</th><th className="pb-2">Detected</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((c) => (
              <tr key={c.id} className="border-b border-console-border/50 last:border-0">
                <td className="py-2">{c.type}</td>
                <td className="py-2"><Badge level={c.severity === "HIGH" ? "CRITICAL" : "HIGH"}>{c.severity}</Badge></td>
                <td className="py-2 text-console-muted">{c.description}</td>
                <td className="py-2 font-mono text-xs">{new Date(c.detected_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
