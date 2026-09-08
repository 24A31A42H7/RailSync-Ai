from datetime import date as date_cls

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import models as m
from app.services.railway_api import railway_api_service
from app.core.security import get_current_manager

router = APIRouter(prefix="/api/trains", tags=["trains"])


def _codes(section: m.RailwaySection):
    return (section.from_station.code if section.from_station else "",
            section.to_station.code if section.to_station else "")


@router.get("/schedule")
def train_schedule(section_id: str, on_date: date_cls = Query(default=None), db: Session = Depends(get_db),
                    _manager=Depends(get_current_manager)):
    on_date = on_date or date_cls.today()
    section = db.query(m.RailwaySection).get(section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    from_code, to_code = _codes(section)
    movements = railway_api_service.get_trains_between(from_code, to_code, on_date, live=False)
    goods = railway_api_service.get_goods_forecast(section.name, on_date)
    return {
        "section": section.name,
        "date": on_date.isoformat(),
        "data_source": "REAL_API" if railway_api_service.is_live() else "MOCK_API/SIMULATED",
        "train_movements": movements,
        "goods_forecast": goods,
    }


@router.get("/live")
def live_trains(section_id: str, db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    """Live train tracking for a selected corridor (spec section 14). Also
    reachable via /ws/live-trains?section_id=... for push updates."""
    section = db.query(m.RailwaySection).get(section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    from_code, to_code = _codes(section)
    trains = railway_api_service.get_trains_between(from_code, to_code, date_cls.today(), live=True)
    return {
        "section": section.name,
        "data_source": "REAL_API" if railway_api_service.is_live() else "MOCK_API/SIMULATED",
        "trains": trains,
    }


@router.get("/status")
def railway_status(_manager=Depends(get_current_manager)):
    return {
        "provider": "real" if railway_api_service.is_live() else "mock",
        "is_live": railway_api_service.is_live(),
        "message": ("Connected to the live Railway Data API." if railway_api_service.is_live()
                    else "No RAILWAY_API_KEY configured — serving realistic SIMULATED data. "
                         "Add your key to backend/.env and set RAILWAY_API_PROVIDER=real to go live."),
    }
