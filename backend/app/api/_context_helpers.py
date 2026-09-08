from datetime import time, date, timedelta
from typing import Tuple, List, Dict, Any

from sqlalchemy.orm import Session

from app.models import models as m
from app.optimization.scheduler import TaskContext, date_range_list
from app.optimization.group_duration import compute_group_duration, GroupTask
from app.services.railway_api import railway_api_service

LEVEL_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}


def _worst_level(values: List[str]) -> str:
    return max(values, key=lambda v: LEVEL_ORDER.get(v, 1)) if values else "MEDIUM"


def get_group_tasks(db: Session, task_group_id: str, track_id: str) -> List[m.MaintenanceTask]:
    """All sibling tasks that were submitted together for the same track
    (spec section 6/7) — this is the unit the scheduling engine optimizes."""
    return (db.query(m.MaintenanceTask)
            .filter(m.MaintenanceTask.task_group_id == task_group_id,
                    m.MaintenanceTask.track_id == track_id)
            .order_by(m.MaintenanceTask.created_at.asc())
            .all())


def fetch_date_bundle(db: Session, section: m.RailwaySection, track_id: str, on_date: date,
                      exclude_task_ids: List[str]) -> Dict[str, Any]:
    """One day's worth of train/goods/existing-block data for a track,
    normalized into the shape the free-window/CP-SAT engine expects."""
    from_code = section.from_station.code if section.from_station else ""
    to_code = section.to_station.code if section.to_station else ""
    movements = railway_api_service.get_trains_between(from_code, to_code, on_date, live=False)
    goods = railway_api_service.get_goods_forecast(section.name, on_date)

    q = (db.query(m.Block)
         .filter(m.Block.track_id == track_id, m.Block.block_date == on_date,
                 m.Block.status.in_(["PLANNED", "ACTIVE"])))
    if exclude_task_ids:
        q = q.filter(~m.Block.task_id.in_(exclude_task_ids))
    other_blocks = q.all()
    existing_blocks = [{"start_time": b.start_time, "end_time": b.end_time,
                        "label": f"{b.purpose or 'Maintenance'} ({b.department.code if b.department else ''})"}
                       for b in other_blocks]
    return {"movements": movements, "goods": goods, "existing_blocks": existing_blocks}


def build_group_context_and_data(db: Session, group_tasks: List[m.MaintenanceTask]
                                  ) -> Tuple[TaskContext, Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    """Returns (ctx, date_bundles, combined_candidates) for a whole task
    group on one track — this is what MODE 1/2/3 all optimize against.
    `date_bundles` covers every day from the group's earliest to latest
    acceptable date (spec: "in-between dates to complete the task")."""
    rep = group_tasks[0]
    section = rep.section
    track = rep.track

    earliest_date = min(t.preferred_date for t in group_tasks)
    latest_date = max((t.latest_date or t.preferred_date) for t in group_tasks)
    group_ids = [t.id for t in group_tasks]

    date_bundles = {
        d.isoformat(): fetch_date_bundle(db, section, rep.track_id, d, group_ids)
        for d in date_range_list(earliest_date, latest_date)
    }

    dependencies_rows = (db.query(m.TaskDependency)
                        .filter(m.TaskDependency.task_id.in_(group_ids))
                        .all())
    dependencies = [(d.task_id, d.depends_on_task_id) for d in dependencies_rows]

    duration_result = compute_group_duration(
        [GroupTask(id=t.id, duration_minutes=t.duration_minutes,
                   resource_name=t.resource_name or "", exclusive_resource=t.exclusive_resource)
         for t in group_tasks],
        dependencies,
    )

    # candidates for combined/coordinated maintenance: other groups' tasks in the
    # same SECTION+date range from a different department (coordination bonus signal)
    other_tasks = (db.query(m.MaintenanceTask)
                  .filter(m.MaintenanceTask.section_id == rep.section_id,
                          m.MaintenanceTask.preferred_date >= earliest_date,
                          m.MaintenanceTask.preferred_date <= latest_date,
                          m.MaintenanceTask.department_id != rep.department_id,
                          ~m.MaintenanceTask.id.in_(group_ids),
                          m.MaintenanceTask.status == "PENDING_OPTIMIZATION")
                  .all())
    combined_candidates = []
    for ot in other_tasks:
        if ot.preferred_start_time:
            start = ot.preferred_start_time
            end_minute = start.hour * 60 + start.minute + ot.duration_minutes
            end = time((end_minute // 60) % 24, end_minute % 60)
            combined_candidates.append({"date": ot.preferred_date.isoformat(),
                                        "start_time": start.strftime("%H:%M"),
                                        "end_time": end.strftime("%H:%M"),
                                        "department_id": ot.department_id})

    worst_safety = _worst_level([t.safety_risk.value for t in group_tasks])
    worst_criticality = _worst_level([t.criticality.value for t in group_tasks])
    worst_urgency = _worst_level([t.urgency.value for t in group_tasks])
    asset_crits = [t.asset.criticality.value for t in group_tasks if t.asset]
    worst_asset_crit = _worst_level(asset_crits) if asset_crits else "MEDIUM"
    earliest_deadline = min((t.deadline for t in group_tasks if t.deadline), default=None)
    max_resources = max((t.required_resources for t in group_tasks), default=1)
    available_resources = 2 + (1 if worst_criticality in ("HIGH", "CRITICAL") else 0)

    ctx = TaskContext(
        task_id=rep.task_group_id, section_name=section.name,
        duration_minutes=duration_result["total_minutes"],
        safety_risk=worst_safety, criticality=worst_criticality, urgency=worst_urgency,
        asset_criticality=worst_asset_crit,
        earliest_date=earliest_date, latest_date=latest_date, deadline=earliest_deadline,
        required_resources=max_resources, available_resources=available_resources,
        department_id=rep.department_id, track_id=rep.track_id,
        track_code=track.track_code if track else None,
        from_code=section.from_station.code if section.from_station else None,
        to_code=section.to_station.code if section.to_station else None,
        sub_tasks=[{"id": t.id, "task_type": t.task_type, "duration_minutes": t.duration_minutes,
                    "department": t.department.code if t.department else None} for t in group_tasks],
        group_mode=duration_result["mode"],
    )
    return ctx, date_bundles, combined_candidates
