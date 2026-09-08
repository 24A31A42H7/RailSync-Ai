from datetime import time as time_cls

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import models as m
from app.models.models import gen_id
from app.optimization.scheduler import scheduling_engine
from app.services.railway_api import railway_api_service
from app.api._context_helpers import build_group_context_and_data, get_group_tasks
from app.websocket.manager import ws_manager
from app.core.security import get_current_manager

router = APIRouter(prefix="/api/optimization", tags=["optimization"])


def _log(db: Session, manager_id: str, action: str, entity_type: str, entity_id: str, details: str = ""):
    db.add(m.AuditLog(manager_id=manager_id, action=action, entity_type=entity_type,
                      entity_id=entity_id, details=details))


@router.post("/run")
async def run_optimization(task_group_id: str, track_id: str, db: Session = Depends(get_db),
                            manager=Depends(get_current_manager)):
    """MODE 1 — Automated Optimization for every task on `track_id` that was
    submitted together under `task_group_id` (spec section 16). Searches
    every date in the task group's [earliest, latest] date window."""
    group_tasks = get_group_tasks(db, task_group_id, track_id)
    if not group_tasks:
        raise HTTPException(404, "No tasks found for this group/track")

    ctx, date_bundles, combined = build_group_context_and_data(db, group_tasks)
    rec = scheduling_engine.generate_optimal_schedule(ctx, date_bundles, combined)
    rec["data_source"] = "REAL_API" if railway_api_service.is_live() else "MOCK_API/SIMULATED"
    rec["track_id"] = track_id
    rec["track_code"] = ctx.track_code
    rec["group_mode"] = ctx.group_mode
    rec["sub_tasks"] = ctx.sub_tasks
    rec["date_range"] = {"earliest": ctx.earliest_date.isoformat(), "latest": ctx.latest_date.isoformat()}

    version_id = gen_id()
    rec["schedule_version_id"] = version_id
    version = m.ScheduleVersion(id=version_id, mode="AUTOMATED", section_id=group_tasks[0].section_id,
                               task_group_id=task_group_id,
                               schedule_score=rec["schedule_score"], solver_status=rec["solver_status"],
                               solve_time_seconds=rec["solve_time_seconds"], result_json=rec)
    db.add(version)

    for c in rec.get("conflicts", []):
        db.add(m.ScheduleConflict(schedule_version_id=version.id, conflict_type=c["type"],
                                  description=c["description"], severity=c["severity"]))

    if rec.get("recommended_start"):
        for t in group_tasks:
            t.status = "RECOMMENDED"

    _log(db, manager.id, "OPTIMIZATION_RUN", "TaskGroup", task_group_id,
         f"track={track_id} score={rec['schedule_score']}")

    db.commit()

    await ws_manager.broadcast({"event": "schedule_generated", "task_group_id": task_group_id,
                                "recommended_date": rec.get("recommended_date"),
                                "recommended_start": rec.get("recommended_start")})
    return rec


@router.get("/{task_group_id}")
def get_group_schedule(task_group_id: str, db: Session = Depends(get_db),
                        _manager=Depends(get_current_manager)):
    version = (db.query(m.ScheduleVersion)
              .filter(m.ScheduleVersion.task_group_id == task_group_id)
              .order_by(m.ScheduleVersion.generated_at.desc()).first())
    if not version:
        raise HTTPException(404, "No schedule generated yet for this group")
    return version.result_json


@router.get("/{task_group_id}/alternatives")
def get_alternatives(task_group_id: str, db: Session = Depends(get_db),
                      _manager=Depends(get_current_manager)):
    version = (db.query(m.ScheduleVersion)
              .filter(m.ScheduleVersion.task_group_id == task_group_id)
              .order_by(m.ScheduleVersion.generated_at.desc()).first())
    if not version:
        raise HTTPException(404, "No schedule generated yet for this group")
    result = version.result_json or {}
    return {"rejected_alternatives": result.get("rejected_alternatives", []),
            "alternative_windows": result.get("alternative_windows", [])}


@router.post("/{schedule_id}/approve")
async def approve_schedule(schedule_id: str, db: Session = Depends(get_db),
                            manager=Depends(get_current_manager)):
    v = db.query(m.ScheduleVersion).get(schedule_id)
    if not v:
        raise HTTPException(404, "Not found")
    v.approved = True
    result = v.result_json or {}
    task_group_id = result.get("task_id")  # TaskContext.task_id carries the group id
    track_id = result.get("track_id")
    if task_group_id and track_id and result.get("recommended_start"):
        group_tasks = get_group_tasks(db, task_group_id, track_id)
        h1, m1 = map(int, result["recommended_start"].split(":"))
        h2, m2 = map(int, result["recommended_end"].split(":"))
        block_date = (__import__("datetime").date.fromisoformat(result["recommended_date"])
                     if result.get("recommended_date") else group_tasks[0].preferred_date)
        rep = group_tasks[0]
        block = m.Block(section_id=rep.section_id, track_id=track_id, task_group_id=task_group_id,
                        task_id=rep.id, department_id=rep.department_id,
                        block_date=block_date, start_time=time_cls(h1, m1), end_time=time_cls(h2, m2),
                        purpose=", ".join(sorted({t.task_type for t in group_tasks})),
                        status="PLANNED", is_combined=len(group_tasks) > 1)
        db.add(block)
        for t in group_tasks:
            t.status = "APPROVED"
            t.approved_at = __import__("datetime").datetime.utcnow()
            t.approved_by = manager.id
        _log(db, manager.id, "SCHEDULE_APPROVED", "ScheduleVersion", schedule_id, f"group={task_group_id}")
    db.commit()
    await ws_manager.broadcast({"event": "schedule_approved", "schedule_id": schedule_id})
    return {"status": "approved", "schedule_id": schedule_id}
