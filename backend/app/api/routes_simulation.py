from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import models as m
from app.optimization.scheduler import scheduling_engine
from app.schemas.schemas import WhatIfRequest
from app.api._context_helpers import build_group_context_and_data, get_group_tasks, fetch_date_bundle
from app.core.security import get_current_manager

router = APIRouter(prefix="/api/simulation", tags=["what-if-simulation"])


@router.post("/what-if")
def what_if(payload: WhatIfRequest, db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    group_tasks = get_group_tasks(db, payload.task_group_id, payload.track_id)
    if not group_tasks:
        raise HTTPException(404, "No tasks found for this group/track")

    ctx, date_bundles, _ = build_group_context_and_data(db, group_tasks)

    proposed_iso = payload.proposed_date.isoformat()
    if proposed_iso not in date_bundles:
        # the manager proposed a date outside the task's original earliest/latest
        # window — fetch it on demand rather than silently refusing to evaluate it
        date_bundles[proposed_iso] = fetch_date_bundle(
            db, group_tasks[0].section, payload.track_id, payload.proposed_date,
            [t.id for t in group_tasks])

    result = scheduling_engine.simulate_schedule(
        ctx, date_bundles, proposed_date=payload.proposed_date,
        proposed_start=payload.proposed_start_time.strftime("%H:%M"),
        proposed_duration_minutes=payload.proposed_duration_minutes,
    )

    sim = m.Simulation(task_id=group_tasks[0].id, proposed_date=payload.proposed_date,
                       proposed_start_time=payload.proposed_start_time,
                       proposed_duration_minutes=payload.proposed_duration_minutes,
                       result_json=result)
    db.add(sim)
    db.commit()
    db.refresh(sim)
    result["simulation_id"] = sim.id
    # explicit: the What-If simulation never mutates the real schedule / task status
    return result


@router.get("/{simulation_id}")
def get_simulation(simulation_id: str, db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    sim = db.query(m.Simulation).get(simulation_id)
    if not sim:
        raise HTTPException(404, "Not found")
    return sim.result_json
