from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import models as m
from app.optimization.free_window_engine import compute_timeline, compute_free_windows
from app.optimization.conflict_checker import detect_live_train_conflicts
from app.services.railway_api import railway_api_service
from app.core.security import get_current_manager

router = APIRouter(prefix="/api", tags=["conflicts-blocks-windows"])


@router.get("/conflicts")
def list_conflicts(db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    conflicts = db.query(m.ScheduleConflict).order_by(m.ScheduleConflict.detected_at.desc()).limit(100).all()
    return [{"id": c.id, "type": c.conflict_type, "description": c.description,
             "severity": c.severity, "detected_at": c.detected_at.isoformat()} for c in conflicts]


@router.get("/blocks")
def list_blocks(section_id: str | None = None, track_id: str | None = None, on_date: date_cls | None = None,
                 db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    q = db.query(m.Block)
    if section_id:
        q = q.filter(m.Block.section_id == section_id)
    if track_id:
        q = q.filter(m.Block.track_id == track_id)
    if on_date:
        q = q.filter(m.Block.block_date == on_date)
    out = []
    for b in q.order_by(m.Block.block_date.desc()).limit(200).all():
        out.append({"id": b.id, "section_id": b.section_id, "track_id": b.track_id,
                    "block_date": b.block_date.isoformat(),
                    "start_time": b.start_time.strftime("%H:%M"), "end_time": b.end_time.strftime("%H:%M"),
                    "purpose": b.purpose, "status": b.status, "is_combined": b.is_combined,
                    "department": b.department.code if b.department else None})
    return out


@router.get("/blocks/availability")
def block_availability(section_id: str, track_id: str | None = None, on_date: date_cls = None,
                        db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    """Timeline + free windows for a section, optionally narrowed to one
    track, plus a live-train-conflict check overlaid on any existing
    planned/active blocks (spec sections 13/15)."""
    on_date = on_date or date_cls.today()
    section = db.query(m.RailwaySection).get(section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    from_code = section.from_station.code if section.from_station else ""
    to_code = section.to_station.code if section.to_station else ""
    movements = railway_api_service.get_trains_between(from_code, to_code, on_date, live=False)
    goods = railway_api_service.get_goods_forecast(section.name, on_date)

    q = db.query(m.Block).filter(m.Block.section_id == section_id, m.Block.block_date == on_date,
                                 m.Block.status.in_(["PLANNED", "ACTIVE"]))
    if track_id:
        q = q.filter(m.Block.track_id == track_id)
    blocks = q.all()
    existing_blocks = [{"start_time": b.start_time, "end_time": b.end_time,
                        "label": b.purpose or "Maintenance block"} for b in blocks]
    timeline = compute_timeline(movements, goods, existing_blocks)
    free_windows = compute_free_windows(movements, goods, existing_blocks, required_duration_minutes=0)

    live_trains = railway_api_service.get_trains_between(from_code, to_code, on_date, live=True)
    live_conflicts = []
    for b in blocks:
        live_conflicts.extend(detect_live_train_conflicts(
            proposed_start=b.start_time.strftime("%H:%M"), proposed_end=b.end_time.strftime("%H:%M"),
            live_trains=live_trains))

    return {
        "section": section.name, "date": on_date.isoformat(),
        "data_source": "REAL_API" if railway_api_service.is_live() else "MOCK_API/SIMULATED",
        "timeline": timeline, "free_windows": free_windows,
        "live_train_conflicts": live_conflicts,
    }
