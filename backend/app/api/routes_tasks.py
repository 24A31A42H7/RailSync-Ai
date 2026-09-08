import uuid
from datetime import date as date_cls, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import models as m
from app.schemas.schemas import MaintenanceBatchCreate, RejectRequest, CompleteRequest
from app.optimization.priority_engine import compute_priority
from app.core.security import get_current_manager
from app.websocket.manager import ws_manager

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


def _val(x):
    return x.value if hasattr(x, "value") else x


def _task_out(t: m.MaintenanceTask) -> dict:
    return {
        "id": t.id, "task_group_id": t.task_group_id,
        "track_id": t.track_id, "track_code": t.track.track_code if t.track else None,
        "section_id": t.section_id, "section": t.section.name if t.section else None,
        "department_id": t.department_id, "department": t.department.name if t.department else None,
        "task_type": t.task_type, "description": t.description,
        "duration_minutes": t.duration_minutes,
        "preferred_date": t.preferred_date.isoformat(),
        "latest_date": t.latest_date.isoformat() if t.latest_date else None,
        "deadline": t.deadline.isoformat() if t.deadline else None,
        "criticality": _val(t.criticality), "urgency": _val(t.urgency), "safety_risk": _val(t.safety_risk),
        "overdue": t.overdue, "priority_score": t.priority_score, "priority_class": t.priority_class,
        "required_resources": t.required_resources, "resource_name": t.resource_name,
        "exclusive_resource": t.exclusive_resource,
        "status": _val(t.status), "created_at": t.created_at.isoformat(), "created_by": t.created_by,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "completion_notes": t.completion_notes,
    }


@router.get("")
def list_tasks(status: str | None = None, track_id: str | None = None, mine_only: bool = True,
               db: Session = Depends(get_db), manager=Depends(get_current_manager)):
    """Defaults to the logged-in manager's own tasks (personal dashboard,
    per-user work list) — pass mine_only=false to see every manager's tasks."""
    q = db.query(m.MaintenanceTask)
    if mine_only:
        q = q.filter(m.MaintenanceTask.created_by == manager.id)
    if status:
        q = q.filter(m.MaintenanceTask.status == status)
    if track_id:
        q = q.filter(m.MaintenanceTask.track_id == track_id)
    tasks = q.order_by(m.MaintenanceTask.priority_score.desc()).all()
    return [_task_out(t) for t in tasks]


@router.get("/groups")
def list_groups(mine_only: bool = True, db: Session = Depends(get_db), manager=Depends(get_current_manager)):
    """One row per (task_group_id, track_id) — what the UI lists as a single
    'maintenance request' even though it may bundle several sub-tasks.
    Scoped to the logged-in manager's own requests by default."""
    q = db.query(m.MaintenanceTask)
    if mine_only:
        q = q.filter(m.MaintenanceTask.created_by == manager.id)
    tasks = q.order_by(m.MaintenanceTask.created_at.desc()).all()
    groups = {}
    for t in tasks:
        key = (t.task_group_id, t.track_id)
        if key not in groups:
            groups[key] = {
                "task_group_id": t.task_group_id, "track_id": t.track_id,
                "track_code": t.track.track_code if t.track else None,
                "section": t.section.name if t.section else None,
                "section_id": t.section_id,
                "preferred_date": t.preferred_date.isoformat(),
                "latest_date": t.latest_date.isoformat() if t.latest_date else None,
                "task_count": 0, "statuses": set(), "max_priority_score": 0, "worst_priority_class": "LOW",
                "task_types": [],
            }
        g = groups[key]
        g["task_count"] += 1
        g["statuses"].add(_val(t.status))
        g["max_priority_score"] = max(g["max_priority_score"], t.priority_score)
        g["task_types"].append(t.task_type)
        order = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
        if order.get(t.priority_class, 1) > order.get(g["worst_priority_class"], 1):
            g["worst_priority_class"] = t.priority_class
    out = []
    for g in groups.values():
        g["statuses"] = sorted(g["statuses"])
        out.append(g)
    return out


@router.get("/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    t = db.query(m.MaintenanceTask).get(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    return _task_out(t)


@router.post("")
def create_maintenance_batch(payload: MaintenanceBatchCreate, db: Session = Depends(get_db),
                              manager=Depends(get_current_manager)):
    """Create Maintenance Task workflow (spec sections 5-7): the section
    (already resolved from live-searched From/To stations via
    POST /api/sections/resolve) is passed in directly; this creates one
    MaintenanceTask per track+task, all sharing a task_group_id, preserving
    any intra-track dependencies the manager specified. Each task may carry
    an earliest/latest date window; the optimizer searches every day in
    that window for the best date+time combination."""
    section = db.query(m.RailwaySection).get(payload.section_id)
    if not section:
        raise HTTPException(400, "Unknown section_id — resolve the section via /api/sections/resolve first")

    if not payload.items:
        raise HTTPException(400, "Select at least one track and add at least one task")

    today = date_cls.today()
    group_id = str(uuid.uuid4())
    created_out = []

    for item in payload.items:
        track = db.query(m.Track).get(item.track_id)
        if not track or track.section_id != section.id:
            raise HTTPException(400, f"Track {item.track_id} does not belong to this railway section")
        if not item.tasks:
            raise HTTPException(400, f"Track {track.track_code} has no tasks configured")

        created_task_ids = []
        for task_input in item.tasks:
            if task_input.latest_date and task_input.latest_date < task_input.preferred_date:
                raise HTTPException(400, "latest_date cannot be before preferred_date (earliest date)")
            pr = compute_priority(
                safety_risk=task_input.safety_risk, criticality=task_input.criticality,
                urgency=task_input.urgency, preferred_date=task_input.preferred_date,
                deadline=task_input.deadline, asset_criticality="MEDIUM", today=today,
            )
            task = m.MaintenanceTask(
                section_id=section.id, track_id=track.id, task_group_id=group_id,
                department_id=task_input.department_id, task_type=task_input.task_type,
                description=task_input.description, duration_minutes=task_input.duration_minutes,
                preferred_date=task_input.preferred_date, latest_date=task_input.latest_date,
                preferred_start_time=task_input.preferred_start_time,
                earliest_start_time=task_input.earliest_start_time,
                latest_completion_time=task_input.latest_completion_time,
                deadline=task_input.deadline, criticality=task_input.criticality,
                urgency=task_input.urgency, safety_risk=task_input.safety_risk,
                overdue=pr["overdue"], priority_score=pr["score"], priority_class=pr["priority_class"],
                required_resources=task_input.required_resources, resource_name=task_input.resource_name,
                exclusive_resource=task_input.exclusive_resource, notes=task_input.notes,
                status="PENDING_OPTIMIZATION", created_by=manager.id,
            )
            db.add(task)
            db.flush()
            created_task_ids.append(task.id)
            created_out.append(_task_out(task))

        # translate depends_on_index (local to this track's task list) into TaskDependency rows
        for local_idx, task_input in enumerate(item.tasks):
            if task_input.depends_on_index is not None and 0 <= task_input.depends_on_index < len(created_task_ids):
                db.add(m.TaskDependency(task_id=created_task_ids[local_idx],
                                        depends_on_task_id=created_task_ids[task_input.depends_on_index]))

    db.add(m.AuditLog(manager_id=manager.id, action="MAINTENANCE_REQUEST_CREATED", entity_type="TaskGroup",
                      entity_id=group_id, details=f"{len(created_out)} task(s)"))
    db.commit()
    return {"task_group_id": group_id, "tasks": created_out}


@router.post("/{task_id}/reject")
async def reject_task(task_id: str, payload: RejectRequest, db: Session = Depends(get_db),
                       manager=Depends(get_current_manager)):
    t = db.query(m.MaintenanceTask).get(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    t.status = "REJECTED"
    t.rejected_reason = payload.reason
    t.updated_at = datetime.utcnow()
    db.add(m.AuditLog(manager_id=manager.id, action="TASK_REJECTED", entity_type="MaintenanceTask",
                      entity_id=task_id, details=payload.reason or ""))
    db.commit()
    await ws_manager.broadcast({"event": "task_rejected", "task_id": task_id})
    return _task_out(t)


@router.post("/{task_id}/complete")
async def complete_task(task_id: str, payload: CompleteRequest, db: Session = Depends(get_db),
                         manager=Depends(get_current_manager)):
    """Mark as Completed workflow (spec section 8)."""
    t = db.query(m.MaintenanceTask).get(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    if t.status.value not in ("APPROVED", "IN_PROGRESS"):
        raise HTTPException(400, f"Cannot complete a task in status {t.status.value}")
    t.status = "COMPLETED"
    t.completed_at = datetime.utcnow()
    t.completed_by = manager.id
    t.completion_notes = payload.completion_notes
    db.add(m.AuditLog(manager_id=manager.id, action="TASK_COMPLETED", entity_type="MaintenanceTask",
                      entity_id=task_id, details=payload.completion_notes or ""))
    db.commit()
    await ws_manager.broadcast({"event": "task_completed", "task_id": task_id})
    return _task_out(t)


@router.post("/{task_id}/start")
async def start_task(task_id: str, db: Session = Depends(get_db), manager=Depends(get_current_manager)):
    t = db.query(m.MaintenanceTask).get(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    if t.status.value != "APPROVED":
        raise HTTPException(400, f"Cannot start a task in status {t.status.value}")
    t.status = "IN_PROGRESS"
    db.commit()
    await ws_manager.broadcast({"event": "task_started", "task_id": task_id})
    return _task_out(t)
