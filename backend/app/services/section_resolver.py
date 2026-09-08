"""
Resolves a From/To station pair (picked from live search results, spec
section 3) into an internal RailwaySection, creating the Station rows
and a default set of Tracks on first use. This is the ONLY place stations
get written to the database — there is no pre-seeded station list; every
Station row exists because a manager searched for and selected it.

Track-level data is not available from public train-status APIs (see
real_railway_api.py), so tracks are generated from a realistic mock
template the first time a section is used — deterministic per section so
repeated visits see the same tracks, and clearly sourced as MOCK_API.
"""
import hashlib
import random
from typing import List, Tuple

from sqlalchemy.orm import Session

from app.models import models as m

TRACK_TEMPLATES = [
    ("Track 1", "MAIN"), ("Track 2", "MAIN"), ("Loop Line", "LOOP"),
    ("Up Line", "UP"), ("Down Line", "DOWN"),
]


def get_or_create_station(db: Session, code: str, name: str) -> m.Station:
    station = db.query(m.Station).filter(m.Station.code == code).first()
    if station:
        return station
    station = m.Station(name=name, code=code)
    db.add(station)
    db.flush()
    return station


def get_or_create_section(db: Session, from_station: m.Station, to_station: m.Station) -> m.RailwaySection:
    section = (db.query(m.RailwaySection)
              .filter(m.RailwaySection.from_station_id == from_station.id,
                      m.RailwaySection.to_station_id == to_station.id)
              .first())
    if section:
        return section
    section = m.RailwaySection(name=f"{from_station.name} -> {to_station.name}",
                               from_station_id=from_station.id, to_station_id=to_station.id,
                               length_km=0)
    db.add(section)
    db.flush()
    return section


def ensure_tracks(db: Session, section: m.RailwaySection) -> List[m.Track]:
    existing = db.query(m.Track).filter(m.Track.section_id == section.id).all()
    if existing:
        return existing
    seed = int(hashlib.sha256(section.id.encode()).hexdigest(), 16) % (10 ** 8)
    rng = random.Random(seed)
    n_tracks = rng.randint(3, 5)
    tracks = []
    for track_code, track_type in TRACK_TEMPLATES[:n_tracks]:
        t = m.Track(track_code=track_code, track_type=track_type, section_id=section.id,
                    is_available=True, source=m.DataSourceEnum.MOCK_API)
        db.add(t)
        tracks.append(t)
    db.flush()
    return tracks


def resolve_section_and_tracks(db: Session, from_code: str, from_name: str,
                                to_code: str, to_name: str) -> Tuple[m.RailwaySection, List[m.Track]]:
    if from_code == to_code:
        raise ValueError("From and To stations cannot be the same")
    from_station = get_or_create_station(db, from_code, from_name)
    to_station = get_or_create_station(db, to_code, to_name)
    section = get_or_create_section(db, from_station, to_station)
    tracks = ensure_tracks(db, section)
    db.commit()
    db.refresh(section)
    return section, tracks
