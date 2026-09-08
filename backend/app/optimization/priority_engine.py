"""
Maintenance Priority Engine (spec section 6).

Transparent, weighted scoring — every component is visible so the
recommendation can be explained. Kept as a pure function so it is
trivial to later swap in a scikit-learn model with the same signature
(architecture is "ML-ready" per spec section 33, without making ML a
hard dependency for the core, deterministic scheduling path).
"""
from datetime import date
from typing import Dict

LEVEL_SCORE = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}

WEIGHTS = {
    "safety_risk": 3.0,
    "criticality": 2.5,
    "urgency": 2.0,
    "deadline": 2.0,
    "overdue": 3.0,
    "asset_importance": 1.5,
}


def _deadline_factor(preferred_date: date, deadline: date | None, today: date) -> float:
    if not deadline:
        return 1.0
    days_left = (deadline - today).days
    if days_left <= 0:
        return 4.0  # already at/after deadline
    if days_left <= 2:
        return 3.5
    if days_left <= 5:
        return 2.5
    if days_left <= 10:
        return 1.5
    return 1.0


def compute_priority(*, safety_risk: str, criticality: str, urgency: str,
                      preferred_date: date, deadline: date | None,
                      asset_criticality: str, today: date | None = None) -> Dict:
    today = today or date.today()
    overdue = bool(deadline and deadline < today)

    safety_pts = LEVEL_SCORE.get(safety_risk, 2) * WEIGHTS["safety_risk"]
    crit_pts = LEVEL_SCORE.get(criticality, 2) * WEIGHTS["criticality"]
    urgency_pts = LEVEL_SCORE.get(urgency, 2) * WEIGHTS["urgency"]
    deadline_pts = _deadline_factor(preferred_date, deadline, today) * WEIGHTS["deadline"]
    overdue_pts = (WEIGHTS["overdue"] * 4.0) if overdue else 0.0
    asset_pts = LEVEL_SCORE.get(asset_criticality, 2) * WEIGHTS["asset_importance"]

    total = safety_pts + crit_pts + urgency_pts + deadline_pts + overdue_pts + asset_pts
    max_possible = (4 * WEIGHTS["safety_risk"] + 4 * WEIGHTS["criticality"] + 4 * WEIGHTS["urgency"]
                    + 4 * WEIGHTS["deadline"] + 4 * WEIGHTS["overdue"] + 4 * WEIGHTS["asset_importance"])
    normalized = round(100 * total / max_possible, 1)

    if normalized >= 80 or overdue:
        band = "CRITICAL"
    elif normalized >= 60:
        band = "HIGH"
    elif normalized >= 35:
        band = "MEDIUM"
    else:
        band = "LOW"

    return {
        "score": normalized,
        "priority_class": band,
        "overdue": overdue,
        "breakdown": {
            "safety_risk": round(safety_pts, 1),
            "criticality": round(crit_pts, 1),
            "urgency": round(urgency_pts, 1),
            "deadline_proximity": round(deadline_pts, 1),
            "overdue_penalty_bonus": round(overdue_pts, 1),
            "asset_importance": round(asset_pts, 1),
        },
    }
