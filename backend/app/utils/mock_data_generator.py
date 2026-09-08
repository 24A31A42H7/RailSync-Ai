"""
Seeds ONLY what has no live-data source: a demo Manager account and the
three maintenance departments. Stations, railway sections and tracks are
intentionally NOT seeded here — they are created on demand, the first
time a manager searches for and resolves a From/To station pair (see
app/services/section_resolver.py). This means the app starts with an
empty maintenance/dashboard picture until the manager actually creates
requests against real (searched) stations.
"""
from sqlalchemy.orm import Session

from app.models import models as m
from app.core.security import hash_password

DEPARTMENTS = [("Engineering", "ENGG"), ("Signal & Telecommunication", "S&T"),
               ("Traction / OHE", "TRD")]


def seed_database(db: Session):
    if db.query(m.Manager).first():
        return  # already seeded

    db.add(m.Manager(username="manager1", full_name="R. Venkatesh (Section Manager)",
                     hashed_password=hash_password("password123")))

    for name, code in DEPARTMENTS:
        if not db.query(m.Department).filter(m.Department.code == code).first():
            db.add(m.Department(name=name, code=code))

    db.commit()
