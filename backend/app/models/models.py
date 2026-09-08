"""
SQLAlchemy models for RailSync AI (SIH26027).

Topology: Zone -> Division -> Station -> RailwaySection (derived from a
From/To station pair) -> Track (the actual selectable maintenance unit).
Maintenance: MaintenanceTask (one per selected track, batched together via
task_group_id when created from the same Create Maintenance Task submission),
optional TaskDependency between tasks in the same group (drives whether the
optimizer treats them as parallel-compatible or sequential), Block (the
approved/active physical possession), EmergencyEvent, Simulation,
ScheduleVersion/ScheduleConflict/OptimizationResult (CP-SAT run artifacts).

Auth: a single Manager role for this prototype, associated with one or more
stations via ManagerStation (kept as a many-to-many table so the schema
already supports multiple managers/assignments later without a migration).
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Date, Time,
    ForeignKey, Enum, Text, JSON, Table
)
from sqlalchemy.orm import relationship

from app.database.session import Base


def gen_id() -> str:
    return str(uuid.uuid4())


class CriticalityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class TaskStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_OPTIMIZATION = "PENDING_OPTIMIZATION"
    RECOMMENDED = "RECOMMENDED"
    APPROVED = "APPROVED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class DataSourceEnum(str, enum.Enum):
    REAL_API = "REAL_API"
    MOCK_API = "MOCK_API"
    MANUAL = "MANUAL"


# ---------------------------------------------------------------------------
# Auth — single Manager role, schema extendable to multiple managers/stations
# ---------------------------------------------------------------------------

manager_stations = Table(
    "manager_stations", Base.metadata,
    Column("manager_id", String, ForeignKey("managers.id"), primary_key=True),
    Column("station_id", String, ForeignKey("stations.id"), primary_key=True),
)


class Manager(Base):
    __tablename__ = "managers"
    id = Column(String, primary_key=True, default=gen_id)
    username = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    stations = relationship("Station", secondary=manager_stations, back_populates="managers")


# ---------------------------------------------------------------------------
# Railway topology
# ---------------------------------------------------------------------------

class Department(Base):
    __tablename__ = "departments"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, unique=True, nullable=False)
    code = Column(String, unique=True, nullable=False)


class Zone(Base):
    __tablename__ = "zones"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)

    divisions = relationship("Division", back_populates="zone")


class Division(Base):
    __tablename__ = "divisions"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    zone_id = Column(String, ForeignKey("zones.id"))

    zone = relationship("Zone", back_populates="divisions")
    stations = relationship("Station", back_populates="division")


class Station(Base):
    __tablename__ = "stations"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    division_id = Column(String, ForeignKey("divisions.id"))
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    division = relationship("Division", back_populates="stations")
    managers = relationship("Manager", secondary=manager_stations, back_populates="stations")


class RailwaySection(Base):
    """Derived from a From/To station pair — never picked directly by the
    manager, only resolved once both stations are selected (spec section 3)."""
    __tablename__ = "railway_sections"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)  # e.g. "Anantapur -> Gooty"
    from_station_id = Column(String, ForeignKey("stations.id"))
    to_station_id = Column(String, ForeignKey("stations.id"))
    length_km = Column(Float, default=0)

    from_station = relationship("Station", foreign_keys=[from_station_id])
    to_station = relationship("Station", foreign_keys=[to_station_id])
    tracks = relationship("Track", back_populates="section")


class Track(Base):
    """The actual selectable maintenance unit within a section (spec section
    3/6): e.g. Line 1, Line 2, Loop Line, Up Line, Down Line."""
    __tablename__ = "tracks"
    id = Column(String, primary_key=True, default=gen_id)
    track_code = Column(String, nullable=False)          # "Track 1", "Loop Line", ...
    track_type = Column(String, default="MAIN")           # MAIN / LOOP / UP / DOWN
    section_id = Column(String, ForeignKey("railway_sections.id"))
    is_available = Column(Boolean, default=True)
    source = Column(Enum(DataSourceEnum), default=DataSourceEnum.MOCK_API)

    section = relationship("RailwaySection", back_populates="tracks")


class Asset(Base):
    """Physical infrastructure item (optional link from a task — a track can
    have zero or more known assets/defects tracked against it)."""
    __tablename__ = "assets"
    id = Column(String, primary_key=True, default=gen_id)
    asset_code = Column(String, unique=True, nullable=False)
    asset_type = Column(String, nullable=False)  # TRACK / SIGNAL / OHE / POINT
    section_id = Column(String, ForeignKey("railway_sections.id"))
    track_id = Column(String, ForeignKey("tracks.id"), nullable=True)
    department_id = Column(String, ForeignKey("departments.id"))
    criticality = Column(Enum(CriticalityEnum), default=CriticalityEnum.MEDIUM)
    condition = Column(String, default="OK")  # OK / DEGRADED / DEFECTIVE
    is_available = Column(Boolean, default=True)

    section = relationship("RailwaySection")
    department = relationship("Department")


class Train(Base):
    __tablename__ = "trains"
    id = Column(String, primary_key=True, default=gen_id)
    train_number = Column(String, unique=True, nullable=False)
    train_name = Column(String, nullable=False)
    train_type = Column(String, nullable=False)  # PASSENGER / EXPRESS / GOODS
    origin = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    route = Column(String, nullable=True)


class TrainSchedule(Base):
    __tablename__ = "train_schedules"
    id = Column(String, primary_key=True, default=gen_id)
    train_id = Column(String, ForeignKey("trains.id"))
    station_id = Column(String, ForeignKey("stations.id"), nullable=True)
    section_id = Column(String, ForeignKey("railway_sections.id"), nullable=True)
    arrival_time = Column(Time, nullable=True)
    departure_time = Column(Time, nullable=True)
    schedule_date = Column(Date, nullable=False)
    status = Column(String, default="ON_TIME")
    source = Column(Enum(DataSourceEnum), default=DataSourceEnum.MOCK_API)

    train = relationship("Train")
    section = relationship("RailwaySection")


class GoodsTrainForecast(Base):
    __tablename__ = "goods_train_forecasts"
    id = Column(String, primary_key=True, default=gen_id)
    section_id = Column(String, ForeignKey("railway_sections.id"))
    forecast_date = Column(Date, nullable=False)
    expected_time = Column(Time, nullable=False)
    load_description = Column(String, nullable=True)
    source = Column(Enum(DataSourceEnum), default=DataSourceEnum.MOCK_API)


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

class MaintenanceTask(Base):
    __tablename__ = "maintenance_tasks"
    id = Column(String, primary_key=True, default=gen_id)

    # location — always resolved via From/To station -> section -> track
    section_id = Column(String, ForeignKey("railway_sections.id"))
    track_id = Column(String, ForeignKey("tracks.id"))
    asset_id = Column(String, ForeignKey("assets.id"), nullable=True)

    # grouping: every track+task submitted together in one Create Maintenance
    # Task form shares a task_group_id, so the optimizer/UI can treat them
    # as one planning request even though each task stays individually
    # traceable (spec sections 6/7/21).
    task_group_id = Column(String, index=True, nullable=False)

    department_id = Column(String, ForeignKey("departments.id"))
    task_type = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=False)
    # Earliest/latest date form the completion window the manager will
    # accept (spec: "in-between dates to complete task"). If latest_date is
    # null or equal to preferred_date, the optimizer schedules on that single
    # day exactly as before; otherwise it searches every day in the range
    # for the best date+time combination.
    preferred_date = Column(Date, nullable=False)  # earliest acceptable date
    latest_date = Column(Date, nullable=True)       # latest acceptable date (optional)
    preferred_start_time = Column(Time, nullable=True)
    earliest_start_time = Column(Time, nullable=True)
    latest_completion_time = Column(Time, nullable=True)
    deadline = Column(Date, nullable=True)
    criticality = Column(Enum(CriticalityEnum), default=CriticalityEnum.MEDIUM)
    urgency = Column(Enum(CriticalityEnum), default=CriticalityEnum.MEDIUM)
    safety_risk = Column(Enum(CriticalityEnum), default=CriticalityEnum.MEDIUM)
    overdue = Column(Boolean, default=False)
    priority_score = Column(Float, default=0)
    priority_class = Column(String, default="MEDIUM")
    required_resources = Column(Integer, default=1)
    resource_name = Column(String, nullable=True)   # e.g. "Team A" (spec section 6 example)
    exclusive_resource = Column(Boolean, default=False)  # forces sequential scheduling vs siblings needing same resource
    notes = Column(Text, nullable=True)

    status = Column(Enum(TaskStatusEnum), default=TaskStatusEnum.DRAFT)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String, ForeignKey("managers.id"), nullable=True)  # personal dashboard scoping

    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(String, ForeignKey("managers.id"), nullable=True)
    rejected_reason = Column(Text, nullable=True)

    completed_at = Column(DateTime, nullable=True)
    completed_by = Column(String, ForeignKey("managers.id"), nullable=True)
    completion_notes = Column(Text, nullable=True)

    asset = relationship("Asset")
    department = relationship("Department")
    section = relationship("RailwaySection")
    track = relationship("Track")


class TaskDependency(Base):
    """task_id cannot start until depends_on_task_id finishes — used only
    for sibling tasks sharing the same track/group. Presence of a dependency
    forces sequential scheduling for that pair (spec section 7)."""
    __tablename__ = "task_dependencies"
    id = Column(String, primary_key=True, default=gen_id)
    task_id = Column(String, ForeignKey("maintenance_tasks.id"))
    depends_on_task_id = Column(String, ForeignKey("maintenance_tasks.id"))


class Block(Base):
    __tablename__ = "blocks"
    id = Column(String, primary_key=True, default=gen_id)
    section_id = Column(String, ForeignKey("railway_sections.id"))
    track_id = Column(String, ForeignKey("tracks.id"), nullable=True)
    task_group_id = Column(String, nullable=True, index=True)
    task_id = Column(String, ForeignKey("maintenance_tasks.id"), nullable=True)
    department_id = Column(String, ForeignKey("departments.id"), nullable=True)
    block_date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    purpose = Column(String, nullable=True)
    status = Column(String, default="PLANNED")  # PLANNED/ACTIVE/COMPLETED/CANCELLED
    is_combined = Column(Boolean, default=False)
    combined_departments = Column(String, nullable=True)  # comma separated

    section = relationship("RailwaySection")
    task = relationship("MaintenanceTask")


class EmergencyEvent(Base):
    __tablename__ = "emergency_events"
    id = Column(String, primary_key=True, default=gen_id)
    section_id = Column(String, ForeignKey("railway_sections.id"))
    track_id = Column(String, ForeignKey("tracks.id"), nullable=True)
    asset_id = Column(String, ForeignKey("assets.id"), nullable=True)
    event_type = Column(String, nullable=False)  # e.g. SIGNAL_FAILURE
    severity = Column(Enum(CriticalityEnum), default=CriticalityEnum.CRITICAL)
    description = Column(Text, nullable=True)
    reported_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="OPEN")  # OPEN / RESOLVED


class Simulation(Base):
    __tablename__ = "simulations"
    id = Column(String, primary_key=True, default=gen_id)
    task_id = Column(String, ForeignKey("maintenance_tasks.id"))
    proposed_date = Column(Date, nullable=False)
    proposed_start_time = Column(Time, nullable=False)
    proposed_duration_minutes = Column(Integer, nullable=False)
    result_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ScheduleVersion(Base):
    __tablename__ = "schedule_versions"
    id = Column(String, primary_key=True, default=gen_id)
    mode = Column(String, nullable=False)  # AUTOMATED / WHAT_IF / EMERGENCY
    section_id = Column(String, ForeignKey("railway_sections.id"), nullable=True)
    task_group_id = Column(String, nullable=True, index=True)
    generated_at = Column(DateTime, default=datetime.utcnow)
    schedule_score = Column(Float, default=0)
    solver_status = Column(String, nullable=True)
    solve_time_seconds = Column(Float, default=0)
    result_json = Column(JSON, nullable=True)
    approved = Column(Boolean, default=False)
    approved_at = Column(DateTime, nullable=True)


class ScheduleConflict(Base):
    __tablename__ = "schedule_conflicts"
    id = Column(String, primary_key=True, default=gen_id)
    schedule_version_id = Column(String, ForeignKey("schedule_versions.id"), nullable=True)
    conflict_type = Column(String, nullable=False)  # incl. LIVE_TRAIN_CONFLICT
    description = Column(Text, nullable=True)
    severity = Column(String, default="MEDIUM")
    detected_at = Column(DateTime, default=datetime.utcnow)


class OptimizationResult(Base):
    __tablename__ = "optimization_results"
    id = Column(String, primary_key=True, default=gen_id)
    schedule_version_id = Column(String, ForeignKey("schedule_versions.id"))
    objective_value = Column(Float, default=0)
    train_conflicts = Column(Integer, default=0)
    expected_delay_minutes = Column(Float, default=0)
    block_utilization_pct = Column(Float, default=0)
    critical_tasks_completed = Column(Integer, default=0)
    downtime_minutes = Column(Float, default=0)
    deadline_violations = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    """Lightweight audit trail (spec section 21) — one row per manager
    action on a task/schedule/emergency."""
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True, default=gen_id)
    manager_id = Column(String, ForeignKey("managers.id"), nullable=True)
    action = Column(String, nullable=False)      # e.g. "TASK_APPROVED"
    entity_type = Column(String, nullable=False)  # e.g. "MaintenanceTask"
    entity_id = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
