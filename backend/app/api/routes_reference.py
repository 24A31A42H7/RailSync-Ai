from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import models as m
from app.core.security import get_current_manager
from app.services.railway_api import railway_api_service
from app.services.section_resolver import resolve_section_and_tracks

router = APIRouter(prefix="/api", tags=["reference-data"])


# ---------------------------------------------------------------------
# Live station search (spec section 3) — NOT a hardcoded list. Backed by
# the real RailRadar API once RAILWAY_API_KEY is set, or a realistic
# mock provider until then.
# ---------------------------------------------------------------------

@router.get("/stations/search")
def search_stations(q: str = Query(..., min_length=1), _manager=Depends(get_current_manager)):
    results = railway_api_service.search_stations(q)
    return {
        "query": q,
        "data_source": "REAL_API" if railway_api_service.is_live() else "MOCK_API/SIMULATED",
        "stations": results,
    }


class StationRef(BaseModel):
    code: str
    name: str


class ResolveSectionRequest(BaseModel):
    from_station: StationRef
    to_station: StationRef


@router.post("/sections/resolve")
def resolve_section(payload: ResolveSectionRequest, db: Session = Depends(get_db),
                     _manager=Depends(get_current_manager)):
    """Given two stations picked from live search, resolve (or create) the
    railway section between them and its selectable tracks (spec section
    3/6). This is the only way Station/RailwaySection/Track rows get
    created — there is no pre-seeded list."""
    try:
        section, tracks = resolve_section_and_tracks(
            db, payload.from_station.code, payload.from_station.name,
            payload.to_station.code, payload.to_station.name,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {
        "section": _section_out(section),
        "tracks": [_track_out(t) for t in tracks],
    }


@router.get("/sections")
def list_sections(db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    """Lists sections that have actually been resolved through a manager's
    From/To search — grows organically, never pre-seeded."""
    return [_section_out(s) for s in db.query(m.RailwaySection).all()]


def _section_out(s: m.RailwaySection) -> dict:
    return {"id": s.id, "name": s.name, "length_km": s.length_km,
            "from_station_id": s.from_station_id, "to_station_id": s.to_station_id,
            "from_station": s.from_station.name if s.from_station else None,
            "from_station_code": s.from_station.code if s.from_station else None,
            "to_station": s.to_station.name if s.to_station else None,
            "to_station_code": s.to_station.code if s.to_station else None}


def _track_out(t: m.Track) -> dict:
    return {"id": t.id, "track_code": t.track_code, "track_type": t.track_type,
            "is_available": t.is_available, "source": t.source.value}


@router.get("/tracks")
def list_tracks(section_id: str, db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    """Available tracks for a resolved section (spec section 3/6)."""
    tracks = db.query(m.Track).filter(m.Track.section_id == section_id).all()
    return [_track_out(t) for t in tracks]


@router.get("/departments")
def list_departments(db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    return [{"id": d.id, "name": d.name, "code": d.code} for d in db.query(m.Department).all()]


@router.get("/assets")
def list_assets(section_id: str | None = None, track_id: str | None = None,
                 db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    q = db.query(m.Asset)
    if section_id:
        q = q.filter(m.Asset.section_id == section_id)
    if track_id:
        q = q.filter(m.Asset.track_id == track_id)
    return [{"id": a.id, "asset_code": a.asset_code, "asset_type": a.asset_type,
             "criticality": a.criticality.value, "condition": a.condition,
             "is_available": a.is_available, "section_id": a.section_id,
             "track_id": a.track_id, "department_id": a.department_id} for a in q.all()]


@router.get("/assets/{asset_id}")
def get_asset(asset_id: str, db: Session = Depends(get_db), _manager=Depends(get_current_manager)):
    a = db.query(m.Asset).get(asset_id)
    if not a:
        raise HTTPException(404, "Asset not found")
    return {"id": a.id, "asset_code": a.asset_code, "asset_type": a.asset_type,
            "criticality": a.criticality.value, "condition": a.condition,
            "is_available": a.is_available, "section": a.section.name if a.section else None,
            "department": a.department.name if a.department else None}
