import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.session import engine, Base, SessionLocal
from app.utils.mock_data_generator import seed_database

# Import all models so metadata knows about every table before create_all
from app.models import models as _models  # noqa: F401

from app.api import (
    routes_auth, routes_reference, routes_trains, routes_tasks,
    routes_scheduling, routes_simulation, routes_emergency,
    routes_operational, routes_analytics,
)
from app.websocket import routes_ws

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="RailSync AI — AI-Powered Automatic Block Planning to Maximize Asset Availability",
    description="SIH 2026 · Problem Statement SIH26027 — CP-SAT-driven multi-track/multi-department "
                "maintenance block planning, what-if simulation, live train awareness and emergency "
                "re-scheduling for Indian Railways. Decision-support only: a Manager always approves.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(routes_auth.router)
app.include_router(routes_reference.router)
app.include_router(routes_trains.router)
app.include_router(routes_tasks.router)
app.include_router(routes_scheduling.router)
app.include_router(routes_simulation.router)
app.include_router(routes_emergency.router)
app.include_router(routes_operational.router)
app.include_router(routes_analytics.router)
app.include_router(routes_ws.router)
