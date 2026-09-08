import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { Panel, Button } from "../components/ui";
import StationSearchInput from "../components/StationSearchInput";
import LiveTrainsPanel from "../components/LiveTrainsPanel";

const LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const todayISO = () => new Date().toISOString().slice(0, 10);

function blankTask() {
  return {
    task_type: "", description: "", department_id: "", duration_minutes: 60,
    preferred_date: todayISO(), latest_date: "", preferred_start_time: "", deadline: "",
    criticality: "MEDIUM", urgency: "MEDIUM", safety_risk: "MEDIUM",
    required_resources: 1, resource_name: "", exclusive_resource: false, notes: "",
    depends_on_index: "",
  };
}

export default function CreateMaintenanceRequest() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [fromStation, setFromStation] = useState(null);
  const [toStation, setToStation] = useState(null);
  const [section, setSection] = useState(null);
  const [sectionError, setSectionError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState([]);
  const [tasksByTrack, setTasksByTrack] = useState({}); // trackId -> [task,...]
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    client.get("/api/departments").then((r) => setDepartments(r.data));
  }, []);

  // Resolve (or create) the railway section + its tracks once both live-searched
  // stations are picked (spec section 3) — no hardcoded station/section list.
  useEffect(() => {
    setSection(null);
    setTracks([]);
    setSelectedTrackIds([]);
    setTasksByTrack({});
    setSectionError("");
    if (!fromStation || !toStation) return;
    if (fromStation.code === toStation.code) {
      setSectionError("From and To stations cannot be the same.");
      return;
    }
    setResolving(true);
    client.post("/api/sections/resolve", { from_station: fromStation, to_station: toStation })
      .then((r) => {
        setSection(r.data.section);
        setTracks(r.data.tracks);
      })
      .catch((err) => setSectionError(err?.response?.data?.detail || "Could not resolve a railway section between these stations"))
      .finally(() => setResolving(false));
  }, [fromStation, toStation]);

  function toggleTrack(trackId) {
    setSelectedTrackIds((prev) => {
      const next = prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId];
      setTasksByTrack((tbt) => {
        const copy = { ...tbt };
        if (next.includes(trackId) && !copy[trackId]) copy[trackId] = [blankTask()];
        if (!next.includes(trackId)) delete copy[trackId];
        return copy;
      });
      return next;
    });
  }

  function updateTask(trackId, idx, field, value) {
    setTasksByTrack((tbt) => {
      const list = [...tbt[trackId]];
      list[idx] = { ...list[idx], [field]: value };
      return { ...tbt, [trackId]: list };
    });
  }
  function addTask(trackId) {
    setTasksByTrack((tbt) => ({ ...tbt, [trackId]: [...tbt[trackId], blankTask()] }));
  }
  function removeTask(trackId, idx) {
    setTasksByTrack((tbt) => ({ ...tbt, [trackId]: tbt[trackId].filter((_, i) => i !== idx) }));
  }

  async function handleSubmit() {
    setError("");
    if (!section || selectedTrackIds.length === 0) {
      setError("Search and select From/To stations and at least one track.");
      return;
    }
    for (const trackId of selectedTrackIds) {
      for (const t of tasksByTrack[trackId]) {
        if (!t.task_type || !t.department_id || !t.duration_minutes) {
          setError("Every task needs a repair type, department and duration.");
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const items = selectedTrackIds.map((trackId) => ({
        track_id: trackId,
        tasks: tasksByTrack[trackId].map((t) => ({
          ...t,
          deadline: t.deadline || null,
          latest_date: t.latest_date || null,
          preferred_start_time: t.preferred_start_time || null,
          resource_name: t.resource_name || null,
          depends_on_index: t.depends_on_index === "" ? null : Number(t.depends_on_index),
        })),
      }));
      const { data } = await client.post("/api/maintenance", { section_id: section.id, items });
      navigate(`/requests/${data.task_group_id}/${selectedTrackIds[0]}`);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create maintenance request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Create Maintenance Task</h1>

      <Panel title="1 — From / To Station">
        <div className="grid grid-cols-2 gap-4">
          <StationSearchInput label="From Station" value={fromStation} onSelect={setFromStation} />
          <StationSearchInput label="To Station" value={toStation} onSelect={setToStation} />
        </div>
        {resolving && <div className="text-console-muted text-sm mt-3">Resolving railway section…</div>}
        {sectionError && <div className="text-signal-red text-sm mt-3">{sectionError}</div>}
        {section && (
          <div className="mt-3 text-sm text-console-muted">
            Railway section resolved: <span className="text-console-text font-medium">{section.name}</span>
          </div>
        )}
      </Panel>

      {tracks.length > 0 && (
        <Panel title="2 — Select Track(s)">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {tracks.map((t) => (
              <label key={t.id} className={`flex items-center gap-2 px-3 py-2 border rounded-sm cursor-pointer text-sm
                ${selectedTrackIds.includes(t.id) ? "border-signal-blue bg-console-panel2" : "border-console-border"}`}>
                <input type="checkbox" checked={selectedTrackIds.includes(t.id)} onChange={() => toggleTrack(t.id)} />
                {t.track_code} <span className="text-console-muted text-xs">({t.track_type})</span>
              </label>
            ))}
          </div>
          <div className="text-[11px] text-console-muted mt-2">
            Track layout is simulated (public train-status APIs don't expose track-level infrastructure data) —
            train and live-position data above the tracks comes from your configured Railway Data API.
          </div>
        </Panel>
      )}

      {section && tracks.length > 0 && (
        <LiveTrainsPanel sectionId={section.id} />
      )}

      {selectedTrackIds.map((trackId) => {
        const track = tracks.find((t) => t.id === trackId);
        const taskList = tasksByTrack[trackId] || [];
        return (
          <Panel key={trackId} title={`Tasks for ${track?.track_code}`} action={
            <Button variant="ghost" onClick={() => addTask(trackId)}>+ Add Task</Button>
          }>
            <div className="space-y-4">
              {taskList.map((task, idx) => (
                <div key={idx} className="border border-console-border rounded-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-medium">Task {idx + 1}</div>
                    {taskList.length > 1 && (
                      <button onClick={() => removeTask(trackId, idx)} className="text-xs text-signal-red hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Field label="Repair Type">
                      <Input value={task.task_type} onChange={(v) => updateTask(trackId, idx, "task_type", v)} placeholder="e.g. Rail grinding" />
                    </Field>
                    <Field label="Department">
                      <Select value={task.department_id} onChange={(v) => updateTask(trackId, idx, "department_id", v)}>
                        <option value="">Select…</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Duration (minutes)">
                      <Input type="number" value={task.duration_minutes} onChange={(v) => updateTask(trackId, idx, "duration_minutes", Number(v))} />
                    </Field>
                    <Field label="Earliest Date">
                      <Input type="date" value={task.preferred_date} onChange={(v) => updateTask(trackId, idx, "preferred_date", v)} />
                    </Field>
                    <Field label="Latest Date (optional — enables a date range)">
                      <Input type="date" value={task.latest_date} min={task.preferred_date}
                        onChange={(v) => updateTask(trackId, idx, "latest_date", v)} />
                    </Field>
                    <Field label="Deadline (optional)">
                      <Input type="date" value={task.deadline} onChange={(v) => updateTask(trackId, idx, "deadline", v)} />
                    </Field>
                    <Field label="Earliest Start / Latest Completion">
                      <div className="flex gap-2">
                        <Input type="time" value={task.earliest_start_time || ""} onChange={(v) => updateTask(trackId, idx, "earliest_start_time", v)} />
                        <Input type="time" value={task.latest_completion_time || ""} onChange={(v) => updateTask(trackId, idx, "latest_completion_time", v)} />
                      </div>
                    </Field>
                    <Field label="Criticality">
                      <Select value={task.criticality} onChange={(v) => updateTask(trackId, idx, "criticality", v)}>
                        {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                      </Select>
                    </Field>
                    <Field label="Urgency">
                      <Select value={task.urgency} onChange={(v) => updateTask(trackId, idx, "urgency", v)}>
                        {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                      </Select>
                    </Field>
                    <Field label="Safety Risk">
                      <Select value={task.safety_risk} onChange={(v) => updateTask(trackId, idx, "safety_risk", v)}>
                        {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                      </Select>
                    </Field>
                    <Field label="Required Resource / Team">
                      <Input value={task.resource_name} onChange={(v) => updateTask(trackId, idx, "resource_name", v)} placeholder="e.g. Team A" />
                    </Field>
                    <Field label="Resource Count">
                      <Input type="number" value={task.required_resources} onChange={(v) => updateTask(trackId, idx, "required_resources", Number(v))} />
                    </Field>
                    {taskList.length > 1 && (
                      <Field label="Depends On (must finish first)">
                        <Select value={task.depends_on_index} onChange={(v) => updateTask(trackId, idx, "depends_on_index", v)}>
                          <option value="">None — can run in parallel</option>
                          {taskList.map((t2, i2) => i2 !== idx && (
                            <option key={i2} value={i2}>Task {i2 + 1}{t2.task_type ? `: ${t2.task_type}` : ""}</option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    <Field label="" full>
                      <label className="flex items-center gap-2 text-xs text-console-muted mt-6">
                        <input type="checkbox" checked={task.exclusive_resource}
                          onChange={(e) => updateTask(trackId, idx, "exclusive_resource", e.target.checked)} />
                        Exclusive resource (can't run at the same time as another task using the same team)
                      </label>
                    </Field>
                  </div>
                </div>
              ))}
              {taskList.length > 1 && (
                <div className="text-xs text-console-muted">
                  {taskList.length} tasks on this track — compatible tasks (no dependency, no shared exclusive
                  resource) will share one block sized to the longest task; dependent/exclusive tasks stack sequentially.
                </div>
              )}
              <div className="text-xs text-console-muted">
                Leave "Latest Date" blank (or equal to "Earliest Date") to schedule on that exact day only.
                Set a later date and CP-SAT will search every day in between for the single best date + time
                combination for this task.
              </div>
            </div>
          </Panel>
        );
      })}

      {error && <div className="text-signal-red text-sm">{error}</div>}
      {selectedTrackIds.length > 0 && (
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Maintenance Request →"}
        </Button>
      )}
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={full ? "col-span-2 md:col-span-3" : ""}>
      {label && <label className="block text-xs uppercase tracking-wider text-console-muted mb-1">{label}</label>}
      {children}
    </div>
  );
}
function Input({ value, onChange, ...props }) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-signal-blue"
      {...props}
    />
  );
}
function Select({ value, onChange, children }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-console-bg border border-console-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-signal-blue"
    >
      {children}
    </select>
  );
}
