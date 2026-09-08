"""
Conflict Detection Layer (spec section 14).

Pure functions that inspect a proposed block against the section's
occupied slots / other tasks / deadlines and return a list of concrete
conflict dicts. Used both to validate CP-SAT output and to explain
rejected alternative windows.
"""
from datetime import time, date
from typing import List, Dict, Any


def _to_minutes(t) -> int:
    if isinstance(t, str):
        h, m = map(int, t.split(":"))
        return h * 60 + m
    return t.hour * 60 + t.minute


def detect_conflicts(*, proposed_start: str, proposed_end: str,
                      train_movements: List[Dict[str, Any]],
                      existing_blocks: List[Dict[str, Any]],
                      deadline: date | None, preferred_date: date,
                      required_resources: int, available_resources: int) -> List[Dict[str, Any]]:
    conflicts = []
    p_start, p_end = _to_minutes(proposed_start), _to_minutes(proposed_end)

    for mv in train_movements:
        arr = mv.get("arrival_time")
        if not arr:
            continue
        arr_min = _to_minutes(arr)
        if p_start - 10 <= arr_min <= p_end + 10:
            conflicts.append({
                "type": "TRAIN_CONFLICT",
                "severity": "HIGH",
                "description": f"{mv.get('train_type')} {mv.get('train_number')} "
                                f"({mv.get('train_name')}) passes at {arr} — within the proposed block.",
            })

    for b in existing_blocks:
        b_start, b_end = _to_minutes(b["start_time"]), _to_minutes(b["end_time"])
        if p_start < b_end and b_start < p_end:
            conflicts.append({
                "type": "MAINTENANCE_OVERLAP",
                "severity": "MEDIUM",
                "description": f"Overlaps existing block {b.get('label','')} "
                                f"({b['start_time']}-{b['end_time']}).",
            })

    if deadline and preferred_date > deadline:
        conflicts.append({
            "type": "DEADLINE_VIOLATION",
            "severity": "HIGH",
            "description": f"Preferred date {preferred_date} is after the deadline {deadline}.",
        })

    if required_resources > available_resources:
        conflicts.append({
            "type": "RESOURCE_CONFLICT",
            "severity": "MEDIUM",
            "description": f"Requires {required_resources} resources but only "
                            f"{available_resources} are available for this department/window.",
        })

    return conflicts


def detect_live_train_conflicts(*, proposed_start: str, proposed_end: str,
                                 live_trains: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Cross-checks a maintenance block against LIVE (not just timetabled)
    train positions (spec section 15). Live data here is section-level, not
    exact track occupancy — the warning is phrased accordingly and always
    requires manager judgement, never automatic action."""
    conflicts = []
    p_start, p_end = _to_minutes(proposed_start), _to_minutes(proposed_end)
    for lt in live_trains:
        through = lt.get("expected_through_time")
        if not through:
            continue
        through_min = _to_minutes(through)
        if p_start - 10 <= through_min <= p_end + 10:
            conflicts.append({
                "type": "LIVE_TRAIN_CONFLICT",
                "severity": "HIGH",
                "description": f"Train {lt.get('train_number')} ({lt.get('train_name')}) is live-tracked "
                                f"({lt.get('granularity', 'SECTION_LEVEL')}) and may enter this section at "
                                f"~{through} — within the proposed block. Manager should confirm before approving.",
            })
    return conflicts
