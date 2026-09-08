"""
Free-Time / Available-Window Engine (spec section 4-5).

Given: a day's train movements, existing maintenance blocks, and a
section's operating window, this module DYNAMICALLY computes:
  - the full occupied/free timeline (for the Schedule Timeline UI), and
  - the list of free windows long enough to be candidates for a given
    maintenance duration.

Nothing here is hardcoded: change the trains or blocks and the windows
recompute.
"""
from dataclasses import dataclass, field
from datetime import time, datetime, timedelta
from typing import List, Dict, Any

OPERATING_START = time(6, 0)
OPERATING_END = time(22, 0)
TRAIN_OCCUPANCY_MINUTES = 10      # a train "occupies" the section around its passage
BUFFER_MINUTES = 10               # safety buffer kept free around a train movement


def _t(minutes: int) -> time:
    minutes = max(0, min(24 * 60 - 1, minutes))
    return time(minutes // 60, minutes % 60)


def _to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _coerce_to_minutes(value) -> int:
    """Accepts a datetime.time, an 'HH:MM' string, or an already-computed
    int minute value — used because existing_blocks can come from DB rows
    (time objects) or from ad-hoc emergency-blocked ranges (HH:MM strings)."""
    if isinstance(value, time):
        return _to_minutes(value)
    if isinstance(value, str):
        h, m = map(int, value.split(":")[:2])
        return h * 60 + m
    return int(value)


@dataclass
class OccupiedSlot:
    start_min: int
    end_min: int
    kind: str          # TRAIN | MAINTENANCE | BUFFER
    label: str
    meta: Dict[str, Any] = field(default_factory=dict)


def build_occupied_slots(train_movements: List[Dict[str, Any]],
                          goods_forecast: List[Dict[str, Any]],
                          existing_blocks: List[Dict[str, Any]]) -> List[OccupiedSlot]:
    """Turn raw train/goods/block data into a sorted list of occupied slots
    (each train movement expands into an occupancy window plus a safety buffer)."""
    slots: List[OccupiedSlot] = []

    for mv in train_movements:
        arr = mv.get("arrival_time")
        if not arr:
            continue
        h, m = map(int, arr.split(":"))
        center = h * 60 + m
        start = center - TRAIN_OCCUPANCY_MINUTES // 2
        end = center + TRAIN_OCCUPANCY_MINUTES // 2
        slots.append(OccupiedSlot(start, end, "TRAIN",
                                   f"{mv.get('train_type', 'TRAIN')} {mv.get('train_number', '')} "
                                   f"({mv.get('train_name', '')})",
                                   meta=mv))
        slots.append(OccupiedSlot(max(0, start - BUFFER_MINUTES), start, "BUFFER", "Safety buffer"))
        slots.append(OccupiedSlot(end, end + BUFFER_MINUTES, "BUFFER", "Safety buffer"))

    for g in goods_forecast:
        t_ = g.get("expected_time")
        if not t_:
            continue
        h, m = map(int, t_.split(":"))
        center = h * 60 + m
        slots.append(OccupiedSlot(center - 5, center + 5, "TRAIN",
                                   f"GOODS ({g.get('load_description','')})", meta=g))

    for b in existing_blocks:
        slots.append(OccupiedSlot(
            _coerce_to_minutes(b["start_time"]),
            _coerce_to_minutes(b["end_time"]),
            "MAINTENANCE", b.get("label", "Maintenance block"), meta=b,
        ))

    slots.sort(key=lambda s: s.start_min)
    return slots


def _merge_overlaps(slots: List[OccupiedSlot]) -> List[OccupiedSlot]:
    """Merge overlapping occupied slots, preferring MAINTENANCE/TRAIN labels over BUFFER."""
    if not slots:
        return []
    ordered = sorted(slots, key=lambda s: (s.start_min, s.end_min))
    merged = [ordered[0]]
    for s in ordered[1:]:
        last = merged[-1]
        if s.start_min <= last.end_min:
            # overlap -> extend, keep the more specific label
            new_end = max(last.end_min, s.end_min)
            label = last.label if last.kind != "BUFFER" else s.label
            kind = last.kind if last.kind != "BUFFER" else s.kind
            merged[-1] = OccupiedSlot(last.start_min, new_end, kind, label, {**last.meta, **s.meta})
        else:
            merged.append(s)
    return merged


def compute_timeline(train_movements, goods_forecast, existing_blocks) -> List[Dict[str, Any]]:
    """Full 06:00-22:00 timeline: TRAIN / MAINTENANCE / BUFFER / FREE segments."""
    slots = _merge_overlaps(build_occupied_slots(train_movements, goods_forecast, existing_blocks))
    timeline = []
    cursor = _to_minutes(OPERATING_START)
    day_end = _to_minutes(OPERATING_END)
    for s in slots:
        s_start, s_end = max(s.start_min, 0), min(s.end_min, day_end)
        if s_start >= day_end or s_end <= cursor:
            continue
        if s_start > cursor:
            timeline.append({"start_time": _t(cursor).strftime("%H:%M"),
                              "end_time": _t(s_start).strftime("%H:%M"),
                              "kind": "FREE", "label": "Free / available", "meta": {}})
        timeline.append({"start_time": _t(s_start).strftime("%H:%M"),
                          "end_time": _t(s_end).strftime("%H:%M"),
                          "kind": s.kind, "label": s.label, "meta": {}})
        cursor = max(cursor, s_end)
    if cursor < day_end:
        timeline.append({"start_time": _t(cursor).strftime("%H:%M"),
                          "end_time": _t(day_end).strftime("%H:%M"),
                          "kind": "FREE", "label": "Free / available", "meta": {}})
    return timeline


def compute_free_windows(train_movements, goods_forecast, existing_blocks,
                          required_duration_minutes: int) -> List[Dict[str, Any]]:
    """Return only the FREE segments, flagged with whether they're long enough
    for the requested maintenance duration."""
    timeline = compute_timeline(train_movements, goods_forecast, existing_blocks)
    windows = []
    for seg in timeline:
        if seg["kind"] != "FREE":
            continue
        h1, m1 = map(int, seg["start_time"].split(":"))
        h2, m2 = map(int, seg["end_time"].split(":"))
        duration = (h2 * 60 + m2) - (h1 * 60 + m1)
        windows.append({
            "start_time": seg["start_time"],
            "end_time": seg["end_time"],
            "duration_minutes": duration,
            "sufficient": duration >= required_duration_minutes,
        })
    return windows
