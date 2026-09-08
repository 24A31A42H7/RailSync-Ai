from datetime import date as date_cls

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import models as m
from app.core.security import get_current_manager

router = APIRouter(prefix="/api", tags=["analytics-reports"])


def _manager_group_ids(db: Session, manager_id: str) -> set:
    rows = (db.query(m.MaintenanceTask.task_group_id)
           .filter(m.MaintenanceTask.created_by == manager_id).distinct().all())
    return {r[0] for r in rows}


def _compute_analytics(db: Session, manager_id: str) -> dict:
    tasks = db.query(m.MaintenanceTask).filter(m.MaintenanceTask.created_by == manager_id).all()
    group_ids = {t.task_group_id for t in tasks}

    total_tasks = len(tasks)
    critical_tasks = sum(1 for t in tasks if t.priority_class == "CRITICAL")
    high_priority_tasks = sum(1 for t in tasks if t.priority_class in ("HIGH", "CRITICAL"))
    overdue_tasks = sum(1 for t in tasks if t.overdue)

    blocks_q = db.query(m.Block).filter(m.Block.task_group_id.in_(group_ids)) if group_ids else db.query(m.Block).filter(False)
    scheduled_blocks = blocks_q.filter(m.Block.status.in_(["PLANNED", "ACTIVE"])).count()
    completed_blocks = blocks_q.filter(m.Block.status == "COMPLETED").count()
    total_blocks = blocks_q.count()
    utilization = round(100 * completed_blocks / total_blocks, 1) if total_blocks else 0.0

    versions = (db.query(m.ScheduleVersion)
               .filter(m.ScheduleVersion.task_group_id.in_(group_ids)) if group_ids
               else db.query(m.ScheduleVersion).filter(False))
    versions = versions.order_by(m.ScheduleVersion.generated_at.asc()).all()
    conflicts_open = sum(len((v.result_json or {}).get("conflicts", [])) for v in versions)

    before_conflicts = after_conflicts = None
    if versions:
        before_conflicts = len((versions[0].result_json or {}).get("conflicts", []))
        after_conflicts = len((versions[-1].result_json or {}).get("conflicts", []))

    emergency_open = db.query(m.EmergencyEvent).filter(m.EmergencyEvent.status == "OPEN").count()

    return {
        "total_tasks": total_tasks, "critical_tasks": critical_tasks,
        "high_priority_tasks": high_priority_tasks, "overdue_tasks": overdue_tasks,
        "scheduled_blocks": scheduled_blocks, "conflicts_open": conflicts_open,
        "emergency_events_open": emergency_open, "block_utilization_pct": utilization,
        "before_after": {
            "note": "Populated only from this manager's own generated ScheduleVersion records — "
                    "empty until at least one schedule has been generated.",
            "conflicts_first_generated": before_conflicts,
            "conflicts_most_recent": after_conflicts,
            "schedule_versions_generated": len(versions),
        },
    }


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), manager=Depends(get_current_manager)):
    """Personal Manager Dashboard (spec section 18) — every count here is
    scoped to the logged-in manager's own maintenance requests, so each
    manager sees only their own tasks and work, not a shared global view."""
    tasks = db.query(m.MaintenanceTask).filter(m.MaintenanceTask.created_by == manager.id).all()
    group_ids = {t.task_group_id for t in tasks}

    by_status = {}
    for t in tasks:
        by_status.setdefault(t.status.value, 0)
        by_status[t.status.value] += 1

    active_tasks = sum(v for k, v in by_status.items()
                       if k in ("PENDING_OPTIMIZATION", "RECOMMENDED", "APPROVED", "IN_PROGRESS"))

    versions = (db.query(m.ScheduleVersion).filter(m.ScheduleVersion.task_group_id.in_(group_ids)).all()
               if group_ids else [])
    conflicts_open = sum(len((v.result_json or {}).get("conflicts", [])) for v in versions)

    active_blocks = (db.query(m.Block)
                    .filter(m.Block.task_group_id.in_(group_ids), m.Block.status.in_(["PLANNED", "ACTIVE"])).count()
                    if group_ids else 0)

    return {
        "manager": manager.full_name,
        "active_maintenance_tasks": active_tasks,
        "pending_approvals": by_status.get("RECOMMENDED", 0),
        "approved_tasks": by_status.get("APPROVED", 0),
        "in_progress": by_status.get("IN_PROGRESS", 0),
        "completed": by_status.get("COMPLETED", 0),
        "critical_tasks": sum(1 for t in tasks if t.priority_class == "CRITICAL"),
        "active_blocks": active_blocks,
        "train_conflicts": conflicts_open,
    }


@router.get("/analytics")
def analytics(db: Session = Depends(get_db), manager=Depends(get_current_manager)):
    return _compute_analytics(db, manager.id)


@router.get("/reports")
def reports(period: str = "daily", db: Session = Depends(get_db), manager=Depends(get_current_manager)):
    """period: daily | weekly | monthly — scoped to the logged-in manager."""
    today = date_cls.today()
    base_q = db.query(m.MaintenanceTask).filter(m.MaintenanceTask.created_by == manager.id)
    tasks = base_q.filter(m.MaintenanceTask.preferred_date == today).all() if period == "daily" else base_q.all()
    group_ids = {t.task_group_id for t in tasks}

    completed = [t for t in tasks if t.status.value == "COMPLETED"]
    pending = [t for t in tasks if t.status.value in
               ("DRAFT", "PENDING_OPTIMIZATION", "RECOMMENDED", "APPROVED", "IN_PROGRESS")]
    critical = [t for t in tasks if t.priority_class == "CRITICAL"]
    overdue = [t for t in tasks if t.overdue]

    blocks = (db.query(m.Block).filter(m.Block.task_group_id.in_(group_ids)).all() if group_ids else [])
    emergencies = db.query(m.EmergencyEvent).all()

    return {
        "period": period, "generated_for": today.isoformat(),
        "completed_maintenance": len(completed), "pending_maintenance": len(pending),
        "critical_tasks": len(critical), "overdue_tasks": len(overdue),
        "blocks_used": len([b for b in blocks if b.status in ("ACTIVE", "COMPLETED")]),
        "total_blocks": len(blocks),
        "emergency_events": len(emergencies),
        "analytics_summary": _compute_analytics(db, manager.id),
    }
