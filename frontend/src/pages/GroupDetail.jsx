import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import client from "../api/client";
import { Panel, Badge, Button, TimelineBar } from "../components/ui";
import LiveTrainsPanel from "../components/LiveTrainsPanel";

export default function GroupDetail() {
  const { groupId, trackId } = useParams();
  const [tasks, setTasks] = useState([]);
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");
  const [busyTaskId, setBusyTaskId] = useState(null);

  function reload() {
    client.get("/api/maintenance").then((r) => {
      setTasks(r.data.filter((t) => t.task_group_id === groupId && t.track_id === trackId));
    });
  }
  useEffect(reload, [groupId, trackId]);

  useEffect(() => {
    client.get(`/api/optimization/${groupId}`).then((r) => setRec(r.data)).catch(() => {});
  }, [groupId]);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.post(`/api/optimization/run?task_group_id=${groupId}&track_id=${trackId}`);
      setRec(data);
      reload();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to run optimization");
    } finally {
      setLoading(false);
    }
  }

  async function approve() {
    if (!rec?.schedule_version_id) return;
    setApproving(true);
    try {
      await client.post(`/api/optimization/${rec.schedule_version_id}/approve`);
      reload();
    } finally {
      setApproving(false);
    }
  }

  async function startTask(taskId) {
    setBusyTaskId(taskId);
    try { await client.post(`/api/maintenance/${taskId}/start`); reload(); }
    finally { setBusyTaskId(null); }
  }

  async function completeTask(taskId) {
    const notes = window.prompt("Completion notes (optional):", "");
    setBusyTaskId(taskId);
    try {
      await client.post(`/api/maintenance/${taskId}/complete`, { completion_notes: notes || null });
      reload();
    } finally { setBusyTaskId(null); }
  }

  async function rejectTask(taskId) {
    const reason = window.prompt("Reason for rejecting this task:", "");
    setBusyTaskId(taskId);
    try { await client.post(`/api/maintenance/${taskId}/reject`, { reason }); reload(); }
    finally { setBusyTaskId(null); }
  }

  if (!tasks.length) return <div className="text-console-muted">Loading…</div>;
  const rep = tasks[0];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{rep.track_code} — {rep.section}</h1>
          <p className="text-console-muted text-sm">{tasks.length} task{tasks.length > 1 ? "s" : ""} on this track</p>
        </div>
      </div>

      <Panel title="Tasks in this Request">
        <div className="space-y-3">
          {tasks.map((t) => (
            <div key={t.id} className="border border-console-border rounded-sm p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{t.task_type}</span>
                  <span className="ml-2 text-console-muted text-sm">{t.department} · {t.duration_minutes} min</span>
                  <Badge level={t.priority_class} />
                </div>
                <StatusBadge status={t.status} />
              </div>
              {t.description && <div className="text-console-muted text-sm mt-1">{t.description}</div>}
              <div className="flex gap-2 mt-2">
                {t.status === "RECOMMENDED" && (
                  <span className="text-xs text-console-muted">Approve the schedule below to activate this task</span>
                )}
                {t.status === "APPROVED" && (
                  <Button variant="ghost" onClick={() => startTask(t.id)} disabled={busyTaskId === t.id}>
                    Start Maintenance
                  </Button>
                )}
                {t.status === "IN_PROGRESS" && (
                  <Button variant="success" onClick={() => completeTask(t.id)} disabled={busyTaskId === t.id}>
                    Mark as Completed
                  </Button>
                )}
                {t.status === "APPROVED" && (
                  <Button variant="success" onClick={() => completeTask(t.id)} disabled={busyTaskId === t.id}>
                    Mark as Completed
                  </Button>
                )}
                {["PENDING_OPTIMIZATION", "RECOMMENDED"].includes(t.status) && (
                  <Button variant="danger" onClick={() => rejectTask(t.id)} disabled={busyTaskId === t.id}>
                    Reject
                  </Button>
                )}
                {t.status === "COMPLETED" && (
                  <span className="text-xs text-signal-green">
                    ✓ Completed {new Date(t.completed_at).toLocaleString()}
                    {t.completion_notes && ` — ${t.completion_notes}`}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <LiveTrainsPanel sectionId={rep.section_id} trackId={rep.track_id} trackCode={rep.track_code} />

      {!rec && (
        <Button onClick={generate} disabled={loading}>
          {loading ? "Running CP-SAT optimization…" : "RUN OPTIMIZATION"}
        </Button>
      )}
      {error && <div className="text-signal-red text-sm">{error}</div>}

      {rec && (
        <>
          <div className="flex items-center justify-between">
            <Badge level={rec.data_source === "REAL_API" ? "GREEN" : "MEDIUM"}>
              {rec.data_source === "REAL_API" ? "LIVE API" : "SIMULATED DATA"}
            </Badge>
            <Button variant="ghost" onClick={generate} disabled={loading}>
              {loading ? "Re-running…" : "Re-run Optimization"}
            </Button>
          </div>

          <Panel title="Track Timeline (Trains · Maintenance · Free · Buffer)">
            <TimelineBar segments={rec.timeline} />
          </Panel>

          <Panel title="AI Recommendation">
            {rec.recommended_start ? (
              <div className="space-y-3">
                {rec.date_range && rec.date_range.earliest !== rec.date_range.latest && (
                  <div className="text-xs text-console-muted">
                    Searched {rec.date_range.earliest} to {rec.date_range.latest}
                  </div>
                )}
                <div className="text-2xl font-mono text-signal-green">
                  {rec.recommended_date && <span className="text-lg text-console-text mr-3">{rec.recommended_date}</span>}
                  {rec.recommended_start} – {rec.recommended_end}
                </div>
                {rec.group_mode && tasks.length > 1 && (
                  <Badge level="MEDIUM">{rec.group_mode} TASK GROUPING</Badge>
                )}
                <ul className="text-sm space-y-1">
                  {rec.reasons.map((r, i) => <li key={i}>✓ {r}</li>)}
                </ul>
                <div className="text-xs text-console-muted font-mono">
                  Schedule score: {rec.schedule_score} · Solver: {rec.solver_status} · Solve time: {rec.solve_time_seconds}s
                </div>
                {tasks.some((t) => t.status === "RECOMMENDED") && (
                  <Button variant="success" onClick={approve} disabled={approving}>
                    {approving ? "Approving…" : "Manager Approve"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-signal-red text-sm">{rec.reasons?.[0] || "No feasible maintenance window was found under the current constraints."}</div>
            )}
          </Panel>

          {rec.rejected_alternatives?.length > 0 && (
            <Panel title="Rejected Alternatives">
              <div className="space-y-2 text-sm">
                {rec.rejected_alternatives.map((a, i) => (
                  <div key={i} className="flex justify-between border-b border-console-border/50 pb-2 last:border-0">
                    <span className="font-mono">{a.date ? `${a.date} ` : ""}{a.start_time}–{a.end_time}</span>
                    <span className="text-console-muted">{a.reason}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {rec.conflicts?.length > 0 && (
            <Panel title="Conflicts at Recommended Time">
              {rec.conflicts.map((c, i) => (
                <div key={i} className="text-sm mb-1">
                  <Badge level={c.severity === "HIGH" ? "CRITICAL" : "HIGH"}>{c.type}</Badge>
                  <span className="ml-2 text-console-muted">{c.description}</span>
                </div>
              ))}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    DRAFT: "LOW", PENDING_OPTIMIZATION: "MEDIUM", RECOMMENDED: "HIGH",
    APPROVED: "GREEN", IN_PROGRESS: "MEDIUM", COMPLETED: "GREEN",
    REJECTED: "CRITICAL", CANCELLED: "LOW",
  };
  return <Badge level={map[status] || "MEDIUM"}>{status.replace("_", " ")}</Badge>;
}
