"""
SchedulingEngine — the ONE reusable CP-SAT-backed engine (spec section
13). MODE 1 (automated optimization), MODE 2 (what-if simulation) and
MODE 3 (emergency re-scheduling) all call into this same engine; only
the inputs/constraints differ per mode. Google OR-Tools CP-SAT is the
actual decision-maker — it is never bypassed or replaced by an LLM
heuristic.

Date-range scheduling: a task group carries an [earliest_date, latest_date]
window (both equal for a single fixed day). `pick_best_window` builds
candidate (date, time-window) pairs across every day in that range and
lets CP-SAT choose the single best one — so "in-between dates to complete
the task" naturally collapses to today's single-day behaviour whenever
only one date was given, and expands to true multi-day search otherwise.
"""
import time as _time
from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Dict, Any, Optional

from ortools.sat.python import cp_model

from app.optimization.free_window_engine import compute_free_windows, compute_timeline
from app.optimization.priority_engine import compute_priority
from app.optimization.conflict_checker import detect_conflicts
from app.optimization.objective import get_weights

MAX_DATE_RANGE_DAYS = 14  # cap how many days we'll ever fan out over, for tractability


def _minutes(t: str) -> int:
    h, m = map(int, t.split(":"))
    return h * 60 + m


def _hhmm(m: int) -> str:
    m = max(0, m)
    return f"{(m // 60) % 24:02d}:{m % 60:02d}"


def date_range_list(earliest: date, latest: date) -> List[date]:
    latest = min(latest, earliest + timedelta(days=MAX_DATE_RANGE_DAYS - 1))
    n_days = (latest - earliest).days + 1
    return [earliest + timedelta(days=i) for i in range(max(1, n_days))]


@dataclass
class TaskContext:
    task_id: str          # the task_group_id — the CP-SAT unit of scheduling is a track's task group
    section_name: str
    duration_minutes: int  # combined group duration (see optimization/group_duration.py)
    safety_risk: str
    criticality: str
    urgency: str
    asset_criticality: str
    earliest_date: date
    latest_date: date
    deadline: Optional[date]
    required_resources: int = 1
    available_resources: int = 2
    department_id: Optional[str] = None
    track_id: Optional[str] = None
    track_code: Optional[str] = None
    from_code: Optional[str] = None
    to_code: Optional[str] = None
    sub_tasks: Optional[List[Dict[str, Any]]] = None   # [{id, task_type, duration_minutes, department}]
    group_mode: Optional[str] = None                    # PARALLEL | SEQUENTIAL | MIXED


def _score_window(window: Dict[str, Any], ctx: TaskContext, weights: Dict[str, float],
                   priority: Dict[str, Any], conflicts: List[Dict[str, Any]],
                   combined_bonus: float) -> Dict[str, Any]:
    """Compute the objective components for placing `ctx`'s task at the
    start of `window`. Returns score + a human-readable reasons list —
    this doubles as the explainability payload (spec section 15)."""
    utilization = ctx.duration_minutes / window["duration_minutes"] if window["duration_minutes"] else 0
    is_critical = priority["priority_class"] in ("CRITICAL", "HIGH")
    window_date = date.fromisoformat(window["date"])
    days_from_earliest = (window_date - ctx.earliest_date).days

    asset_availability_benefit = weights["asset_availability"] * 1.0
    critical_task_benefit = weights["critical_task"] * (priority["score"] / 100.0) * (1.3 if is_critical else 0.6)
    block_utilization_benefit = weights["block_utilization"] * utilization
    coordination_benefit = weights["coordination_benefit"] * combined_bonus

    conflict_penalty = weights["conflict_penalty"] * len(conflicts)
    train_delay_penalty = weights["train_delay_penalty"] * (0.0 if not conflicts else 0.5)
    downtime_penalty = weights["downtime_penalty"] * (ctx.duration_minutes / 60.0) * 0.5
    deadline_violation_penalty = (weights["deadline_violation_penalty"]
                                   if (ctx.deadline and window_date > ctx.deadline) else 0.0)
    lateness_penalty = weights.get("earliness_bonus", 0.0) * days_from_earliest

    score = (asset_availability_benefit + critical_task_benefit + block_utilization_benefit
             + coordination_benefit - conflict_penalty - train_delay_penalty
             - downtime_penalty - deadline_violation_penalty - lateness_penalty)

    reasons = []
    if is_critical:
        reasons.append(f"{priority['priority_class']} priority task ({priority['score']}/100) — scheduling favoured")
    if priority.get("overdue"):
        reasons.append("Task is past its deadline — treated as urgent")
    if ctx.sub_tasks and len(ctx.sub_tasks) > 1:
        names = ", ".join(f"{s['task_type']} ({s['duration_minutes']}m)" for s in ctx.sub_tasks)
        if ctx.group_mode == "PARALLEL":
            reasons.append(f"{len(ctx.sub_tasks)} compatible tasks grouped and run in parallel — {names}; "
                            f"block only needs the longest task's duration ({ctx.duration_minutes} min), not the sum")
        elif ctx.group_mode == "SEQUENTIAL":
            reasons.append(f"{len(ctx.sub_tasks)} dependent/exclusive-resource tasks scheduled sequentially — "
                            f"{names}; combined block = {ctx.duration_minutes} min")
        else:
            reasons.append(f"{len(ctx.sub_tasks)} tasks grouped with a mix of parallel and sequential steps — "
                            f"{names}; combined block = {ctx.duration_minutes} min")
    if ctx.latest_date > ctx.earliest_date:
        reasons.append(f"{window['date']} chosen as the optimal date within the "
                        f"{ctx.earliest_date.isoformat()} to {ctx.latest_date.isoformat()} window")
    reasons.append(f"{ctx.duration_minutes}-minute continuous window available "
                    f"({window['start_time']}\u2013{window['end_time']}, {window['duration_minutes']} min free)")
    if not conflicts:
        reasons.append("No scheduled train conflict in this window")
        reasons.append("No existing maintenance overlap")
    if combined_bonus > 0:
        reasons.append("Overlaps a compatible task from another department — combinable into one block")
    reasons.append(f"Block utilization {round(utilization * 100)}% of the available window")

    return {"score": score, "reasons": reasons, "utilization": utilization}


def pick_best_window(ctx: TaskContext,
                      date_bundles: Dict[str, Dict[str, Any]],
                      combined_candidates: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """CP-SAT picks, among all sufficiently-long free windows across every
    date in `date_bundles` (keys are ISO date strings -> {"movements",
    "goods", "existing_blocks"}), the (date, window) pair that maximizes
    the configured objective. Returns the recommendation, the rejected
    alternatives (with reasons), a representative timeline and solver
    diagnostics."""
    start_wall = _time.perf_counter()
    weights = get_weights()

    priority = compute_priority(
        safety_risk=ctx.safety_risk, criticality=ctx.criticality, urgency=ctx.urgency,
        preferred_date=ctx.earliest_date, deadline=ctx.deadline,
        asset_criticality=ctx.asset_criticality,
    )

    all_windows: List[Dict[str, Any]] = []
    candidates: List[Dict[str, Any]] = []
    for date_iso in sorted(date_bundles.keys()):
        bundle = date_bundles[date_iso]
        windows = compute_free_windows(bundle["movements"], bundle["goods"], bundle["existing_blocks"],
                                        ctx.duration_minutes)
        for w in windows:
            w = {**w, "date": date_iso}
            all_windows.append(w)
            if w["sufficient"]:
                candidates.append(w)

    earliest_iso = ctx.earliest_date.isoformat()
    fallback_bundle = date_bundles.get(earliest_iso) or next(iter(date_bundles.values()))
    timeline = compute_timeline(fallback_bundle["movements"], fallback_bundle["goods"],
                                 fallback_bundle["existing_blocks"])

    if not candidates:
        span = (f" between {ctx.earliest_date.isoformat()} and {ctx.latest_date.isoformat()}"
                if ctx.latest_date > ctx.earliest_date else f" on {ctx.earliest_date.isoformat()}")
        return {
            "task_id": ctx.task_id, "section_id": ctx.section_name,
            "recommended_date": None, "recommended_start": None, "recommended_end": None,
            "priority_class": priority["priority_class"], "priority_score": priority["score"],
            "reasons": [f"No free window{span} is long enough for this task."],
            "rejected_alternatives": [{"date": w["date"], "start_time": w["start_time"], "end_time": w["end_time"],
                                        "reason": f"Only {w['duration_minutes']} min free, "
                                                   f"{ctx.duration_minutes} min required"}
                                       for w in all_windows],
            "alternative_windows": all_windows,
            "conflicts": [], "schedule_score": 0.0, "solver_status": "INFEASIBLE",
            "solve_time_seconds": round(_time.perf_counter() - start_wall, 3),
            "timeline": timeline, "combined_with": None,
        }

    model = cp_model.CpModel()
    assign_vars = [model.NewBoolVar(f"assign_{i}") for i in range(len(candidates))]
    model.Add(sum(assign_vars) == 1)

    scored = []
    for w in candidates:
        bundle = date_bundles[w["date"]]
        proposed_start = w["start_time"]
        proposed_end = _hhmm(_minutes(w["start_time"]) + ctx.duration_minutes)
        conflicts = detect_conflicts(
            proposed_start=proposed_start, proposed_end=proposed_end,
            train_movements=bundle["movements"], existing_blocks=bundle["existing_blocks"],
            deadline=ctx.deadline, preferred_date=date.fromisoformat(w["date"]),
            required_resources=ctx.required_resources, available_resources=ctx.available_resources,
        )
        combined_bonus = 0.0
        combined_with = None
        if combined_candidates:
            for cb in combined_candidates:
                if cb.get("date") and cb["date"] != w["date"]:
                    continue
                cb_s, cb_e = _minutes(cb["start_time"]), _minutes(cb["end_time"])
                if cb_s < _minutes(proposed_end) and _minutes(proposed_start) < cb_e:
                    combined_bonus = 1.0
                    combined_with = cb.get("department_id")
                    break
        result = _score_window(w, ctx, weights, priority, conflicts, combined_bonus)
        scored.append({**w, "proposed_start": proposed_start, "proposed_end": proposed_end,
                       "conflicts": conflicts, "combined_with": combined_with, **result})

    scale = 100
    model.Maximize(sum(int(round(s["score"] * scale)) * assign_vars[i] for i, s in enumerate(scored)))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)
    status_name = solver.StatusName(status)

    chosen_idx = None
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for i, v in enumerate(assign_vars):
            if solver.Value(v) == 1:
                chosen_idx = i
                break

    rejected = []
    for i, s in enumerate(scored):
        if i == chosen_idx:
            continue
        reason = "Higher operational impact / lower objective score"
        if s["conflicts"]:
            reason = s["conflicts"][0]["description"]
        elif s["utilization"] < 0.5:
            reason = "Window much longer than required — poorer block utilization elsewhere is preferred"
        rejected.append({"date": s["date"], "start_time": s["start_time"], "end_time": s["end_time"], "reason": reason})

    chosen = scored[chosen_idx] if chosen_idx is not None else None
    solve_time = round(_time.perf_counter() - start_wall, 3)

    chosen_timeline = timeline
    if chosen and chosen["date"] in date_bundles:
        b = date_bundles[chosen["date"]]
        chosen_timeline = compute_timeline(b["movements"], b["goods"], b["existing_blocks"])

    return {
        "task_id": ctx.task_id, "section_id": ctx.section_name,
        "recommended_date": chosen["date"] if chosen else None,
        "recommended_start": chosen["proposed_start"] if chosen else None,
        "recommended_end": chosen["proposed_end"] if chosen else None,
        "priority_class": priority["priority_class"], "priority_score": priority["score"],
        "reasons": chosen["reasons"] if chosen else ["No feasible assignment found."],
        "rejected_alternatives": rejected,
        "alternative_windows": all_windows,
        "conflicts": chosen["conflicts"] if chosen else [],
        "schedule_score": round(chosen["score"], 2) if chosen else 0.0,
        "solver_status": status_name,
        "solve_time_seconds": solve_time,
        "timeline": chosen_timeline,
        "combined_with": [chosen["combined_with"]] if chosen and chosen.get("combined_with") else None,
    }


def compute_impact_metrics(recommendation: Dict[str, Any], ctx: TaskContext) -> Dict[str, Any]:
    """Impact numbers shown in What-If comparisons and analytics."""
    conflicts = recommendation.get("conflicts", [])
    train_conflicts = sum(1 for c in conflicts if c["type"] == "TRAIN_CONFLICT")
    expected_delay = train_conflicts * 6  # minutes, simple deterministic estimate for the prototype
    window = next((w for w in recommendation.get("alternative_windows", [])
                   if w.get("date") == recommendation.get("recommended_date")
                   and w["start_time"] == recommendation.get("recommended_start")), None)
    utilization = (ctx.duration_minutes / window["duration_minutes"] * 100) if window else 0.0
    return {
        "train_conflicts": train_conflicts,
        "expected_delay_minutes": expected_delay,
        "block_utilization_pct": round(utilization, 1),
        "schedule_score": recommendation.get("schedule_score", 0.0),
        "total_conflicts": len(conflicts),
    }


class SchedulingEngine:
    """Facade exposing the three modes described in spec section 13."""

    def generate_optimal_schedule(self, ctx: TaskContext, date_bundles: Dict[str, Dict[str, Any]],
                                   combined_candidates=None) -> Dict[str, Any]:
        rec = pick_best_window(ctx, date_bundles, combined_candidates)
        rec["mode"] = "AUTOMATED"
        return rec

    def simulate_schedule(self, ctx: TaskContext, date_bundles: Dict[str, Dict[str, Any]],
                           proposed_date: date, proposed_start: str, proposed_duration_minutes: int) -> Dict[str, Any]:
        """MODE 2 — evaluate a controller-proposed change against the current
        AI-recommended plan without touching the live schedule."""
        current = self.generate_optimal_schedule(ctx, date_bundles, None)

        proposed_iso = proposed_date.isoformat()
        bundle = date_bundles.get(proposed_iso) or next(iter(date_bundles.values()))
        proposed_ctx = TaskContext(**{**ctx.__dict__, "duration_minutes": proposed_duration_minutes})
        proposed_end = _hhmm(_minutes(proposed_start) + proposed_duration_minutes)
        conflicts = detect_conflicts(
            proposed_start=proposed_start, proposed_end=proposed_end,
            train_movements=bundle["movements"], existing_blocks=bundle["existing_blocks"],
            deadline=ctx.deadline, preferred_date=proposed_date,
            required_resources=ctx.required_resources, available_resources=ctx.available_resources,
        )
        priority = compute_priority(safety_risk=ctx.safety_risk, criticality=ctx.criticality,
                                     urgency=ctx.urgency, preferred_date=proposed_date,
                                     deadline=ctx.deadline, asset_criticality=ctx.asset_criticality)
        weights = get_weights()
        windows = compute_free_windows(bundle["movements"], bundle["goods"], bundle["existing_blocks"],
                                        proposed_duration_minutes)
        containing = next((w for w in windows if w["start_time"] <= proposed_start < w["end_time"]),
                           {"start_time": proposed_start, "end_time": proposed_end,
                            "duration_minutes": proposed_duration_minutes})
        containing = {**containing, "date": proposed_iso}
        scored = _score_window(containing, proposed_ctx, weights, priority, conflicts, 0.0)
        proposed_metrics = compute_impact_metrics(
            {"conflicts": conflicts, "alternative_windows": [
                {"date": proposed_iso, "start_time": proposed_start, "end_time": proposed_end,
                 "duration_minutes": containing["duration_minutes"]}],
             "recommended_date": proposed_iso, "recommended_start": proposed_start,
             "schedule_score": round(scored["score"], 2)},
            proposed_ctx)

        current_metrics = compute_impact_metrics(current, ctx)

        verdict = "Proposed schedule is comparable to the current plan."
        if proposed_metrics["schedule_score"] < current_metrics["schedule_score"] - 1:
            verdict = "⚠ Proposed schedule has higher operational impact than the current plan."
        elif proposed_metrics["schedule_score"] > current_metrics["schedule_score"] + 1:
            verdict = "✓ Proposed schedule improves on the current plan."

        return {
            "current": {"date": current.get("recommended_date"), "start": current.get("recommended_start"),
                        "end": current.get("recommended_end"), **current_metrics},
            "proposed": {"date": proposed_iso, "start": proposed_start, "end": proposed_end, "conflicts": conflicts,
                        **proposed_metrics},
            "verdict": verdict,
        }

    def emergency_reschedule(self, ctx: TaskContext, date_bundles: Dict[str, Dict[str, Any]],
                              emergency_blocked_ranges: List[Dict[str, str]]) -> Dict[str, Any]:
        """MODE 3 — treat the emergency-affected time range(s) as additional
        occupied blocks on every date in `date_bundles` (typically just
        "today"), then re-run the same CP-SAT engine. Must complete well
        under ~15s."""
        blocked_as_blocks = [{"start_time": r["start_time"], "end_time": r["end_time"],
                               "label": "EMERGENCY — section unavailable"} for r in emergency_blocked_ranges]
        patched = {d: {**b, "existing_blocks": b["existing_blocks"] + blocked_as_blocks}
                  for d, b in date_bundles.items()}
        rec = pick_best_window(ctx, patched)
        rec["mode"] = "EMERGENCY"
        return rec


scheduling_engine = SchedulingEngine()
