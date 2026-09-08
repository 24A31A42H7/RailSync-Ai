from datetime import datetime, date as date_cls

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import models as m
from app.optimization.scheduler import scheduling_engine
from app.schemas.schemas import EmergencyCreate
from app.api._context_helpers import build_group_context_and_data, fetch_date_bundle
from app.websocket.manager import ws_manager
from app.core.security import get_current_manager

router = APIRouter(prefix="/api/emergency", tags=["emergency"])


def _emergency_out(e: m.EmergencyEvent) -> dict:
    return {"id": e.id, "section_id": e.section_id, "track_id": e.track_id, "asset_id": e.asset_id,
            "event_type": e.event_type, "severity": e.severity.value if hasattr(e.severity, "value") else e.severity,
            "description": e.description, "status": e.status, "reported_at": e.reported_at.isoformat()}


@router.get("")
def list_emergencies(db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    return [_emergency_out(e) for e in db.query(m.EmergencyEvent).order_by(m.EmergencyEvent.reported_at.desc()).all()]


@router.get("/{emergency_id}")
def get_emergency(emergency_id: str, db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    e = db.query(m.EmergencyEvent).get(emergency_id)
    if not e:
        raise HTTPException(404, "Not found")
    return _emergency_out(e)


@router.post("")
async def create_emergency(payload: EmergencyCreate, db: Session = Depends(get_db),
                            manager=Depends(get_current_manager)):
    e = m.EmergencyEvent(section_id=payload.section_id, track_id=payload.track_id, asset_id=payload.asset_id,
                         event_type=payload.event_type, severity=payload.severity,
                         description=payload.description, status="OPEN")
    db.add(e)
    db.add(m.AuditLog(manager_id=manager.id, action="EMERGENCY_REPORTED", entity_type="EmergencyEvent",
                      entity_id=e.id, details=payload.event_type))
    db.commit()
    db.refresh(e)
    await ws_manager.broadcast({"event": "emergency_reported", "emergency": _emergency_out(e)})
    return _emergency_out(e)


@router.post("/{emergency_id}/reoptimize")
async def reoptimize(emergency_id: str, db: Session = Depends(get_db), manager=Depends(get_current_manager)):
    """Impact analysis + CP-SAT re-optimization for task groups affected by
    the emergency's section/track (spec section 17). Produces
    recommendations only — never auto-approved, never reroutes traffic."""
    start_wall = datetime.utcnow()
    event = db.query(m.EmergencyEvent).get(emergency_id)
    if not event:
        raise HTTPException(404, "Emergency event not found")

    today = date_cls.today()
    now = datetime.utcnow().time()
    emergency_blocked_ranges = [{"start_time": now.strftime("%H:%M"), "end_time": "23:59"}]

    q = (db.query(m.MaintenanceTask)
         .filter(m.MaintenanceTask.section_id == event.section_id,
                 m.MaintenanceTask.preferred_date == today,
                 m.MaintenanceTask.status.in_(["PENDING_OPTIMIZATION", "RECOMMENDED"])))
    if event.track_id:
        q = q.filter(m.MaintenanceTask.track_id == event.track_id)
    affected_tasks = q.all()

    # group affected tasks by (task_group_id, track_id) so each group is re-optimized as one unit
    groups: dict = {}
    for t in affected_tasks:
        groups.setdefault((t.task_group_id, t.track_id), []).append(t)

    affected_blocks = (db.query(m.Block)
                       .filter(m.Block.section_id == event.section_id, m.Block.block_date == today,
                               m.Block.status.in_(["PLANNED", "ACTIVE"]))
                       .all())

    results = []
    for (group_id, track_id), group_tasks in groups.items():
        ctx, _all_date_bundles, _ = build_group_context_and_data(db, group_tasks)
        # emergency scope is deliberately today-only, not the group's full
        # earliest/latest window — re-fetched fresh so the blocked ranges apply cleanly
        today_bundle = fetch_date_bundle(db, group_tasks[0].section, track_id, today,
                                         [t.id for t in group_tasks])
        rec = scheduling_engine.emergency_reschedule(ctx, {today.isoformat(): today_bundle},
                                                      emergency_blocked_ranges)
        version = m.ScheduleVersion(mode="EMERGENCY", section_id=group_tasks[0].section_id,
                                   task_group_id=group_id,
                                   schedule_score=rec["schedule_score"], solver_status=rec["solver_status"],
                                   solve_time_seconds=rec["solve_time_seconds"], result_json=rec)
        db.add(version)
        db.flush()
        results.append({"task_group_id": group_id, "track_id": track_id,
                        "task_types": [t.task_type for t in group_tasks],
                        "schedule_version_id": version.id, **rec})

    db.add(m.AuditLog(manager_id=manager.id, action="EMERGENCY_REOPTIMIZED", entity_type="EmergencyEvent",
                      entity_id=emergency_id, details=f"{len(groups)} groups affected"))
    db.commit()
    elapsed = (datetime.utcnow() - start_wall).total_seconds()

    payload = {
        "emergency_id": emergency_id,
        "affected_section_id": event.section_id,
        "affected_task_groups": len(groups),
        "affected_blocks_count": len(affected_blocks),
        "reoptimization_time_seconds": round(elapsed, 3),
        "results": results,
    }
    await ws_manager.broadcast({"event": "emergency_reoptimized", "emergency_id": emergency_id,
                                "affected_groups": len(groups)})
    return payload


@router.post("/{emergency_id}/resolve")
async def resolve_emergency(emergency_id: str, db: Session = Depends(get_db),
                             manager=Depends(get_current_manager)):
    event = db.query(m.EmergencyEvent).get(emergency_id)
    if not event:
        raise HTTPException(404, "Not found")
    event.status = "RESOLVED"
    db.add(m.AuditLog(manager_id=manager.id, action="EMERGENCY_RESOLVED", entity_type="EmergencyEvent",
                      entity_id=emergency_id))
    db.commit()
    await ws_manager.broadcast({"event": "emergency_resolved", "emergency_id": emergency_id})
    return _emergency_out(event)
