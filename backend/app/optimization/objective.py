"""
Configurable objective weights (spec section 8). Loaded straight from
environment variables via app.config, so operators can retune the
optimizer's priorities without touching any code.
"""
from app.config import settings


def get_weights() -> dict:
    return {
        "asset_availability": settings.WEIGHT_ASSET_AVAILABILITY,
        "critical_task": settings.WEIGHT_CRITICAL_TASK,
        "block_utilization": settings.WEIGHT_BLOCK_UTILIZATION,
        "coordination_benefit": settings.WEIGHT_COORDINATION_BENEFIT,
        "train_delay_penalty": settings.WEIGHT_TRAIN_DELAY_PENALTY,
        "conflict_penalty": settings.WEIGHT_CONFLICT_PENALTY,
        "downtime_penalty": settings.WEIGHT_DOWNTIME_PENALTY,
        "deadline_violation_penalty": settings.WEIGHT_DEADLINE_VIOLATION_PENALTY,
        "earliness_bonus": settings.WEIGHT_EARLINESS_BONUS,
    }
