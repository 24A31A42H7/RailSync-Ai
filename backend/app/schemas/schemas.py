from datetime import date, time, datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field


# ---------- Reference data ----------
class StationOut(BaseModel):
    id: str
    name: str
    code: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    class Config:
        from_attributes = True


class SectionOut(BaseModel):
    id: str
    name: str
    length_km: float

    class Config:
        from_attributes = True


class AssetOut(BaseModel):
    id: str
    asset_code: str
    asset_type: str
    criticality: str
    condition: str
    is_available: bool
    section_id: Optional[str] = None
    department_id: Optional[str] = None

    class Config:
        from_attributes = True


# ---------- Maintenance request (multi-track / multi-task batch) ----------
class TaskInput(BaseModel):
    """One maintenance task for one track — an index within a track's task
    list (0-based) is used to express intra-track dependencies."""
    task_type: str
    description: Optional[str] = None
    department_id: str
    duration_minutes: int = Field(gt=0)
    preferred_date: date               # earliest acceptable date
    latest_date: Optional[date] = None  # latest acceptable date — if omitted/equal, single-day scheduling
    preferred_start_time: Optional[time] = None
    earliest_start_time: Optional[time] = None
    latest_completion_time: Optional[time] = None
    deadline: Optional[date] = None
    criticality: str = "MEDIUM"
    urgency: str = "MEDIUM"
    safety_risk: str = "MEDIUM"
    required_resources: int = 1
    resource_name: Optional[str] = None
    exclusive_resource: bool = False
    notes: Optional[str] = None
    depends_on_index: Optional[int] = None   # index into this track's task list


class TrackTasksInput(BaseModel):
    track_id: str
    tasks: List[TaskInput]


class MaintenanceBatchCreate(BaseModel):
    section_id: str
    items: List[TrackTasksInput]


class MaintenanceTaskOut(BaseModel):
    id: str
    task_group_id: str
    track_id: str
    track_code: Optional[str] = None
    section_id: str
    department_id: str
    department: Optional[str] = None
    task_type: str
    description: Optional[str]
    duration_minutes: int
    preferred_date: date
    deadline: Optional[date]
    criticality: str
    urgency: str
    safety_risk: str
    overdue: bool
    priority_score: float
    priority_class: str
    status: str
    resource_name: Optional[str] = None
    exclusive_resource: bool = False
    completed_at: Optional[datetime] = None
    completion_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RejectRequest(BaseModel):
    reason: Optional[str] = None


class CompleteRequest(BaseModel):
    completion_notes: Optional[str] = None


# ---------- Timeline / windows ----------
class TimelineSegment(BaseModel):
    start_time: str
    end_time: str
    kind: str  # TRAIN | MAINTENANCE | FREE | BUFFER | CONFLICT | EMERGENCY
    label: str
    meta: Optional[dict] = None


class FreeWindow(BaseModel):
    start_time: str
    end_time: str
    duration_minutes: int
    sufficient: bool


# ---------- Scheduling ----------
class GenerateScheduleRequest(BaseModel):
    task_id: str


class RejectedAlternative(BaseModel):
    start_time: str
    end_time: str
    reason: str


class ScheduleRecommendation(BaseModel):
    task_id: str
    section_id: str
    recommended_start: Optional[str]
    recommended_end: Optional[str]
    priority_class: str
    priority_score: float
    reasons: List[str]
    rejected_alternatives: List[RejectedAlternative]
    alternative_windows: List[FreeWindow]
    conflicts: List[dict]
    schedule_score: float
    solver_status: str
    solve_time_seconds: float
    timeline: List[TimelineSegment]
    combined_with: Optional[List[str]] = None
    data_source: str


class WhatIfRequest(BaseModel):
    task_group_id: str
    track_id: str
    proposed_date: date
    proposed_start_time: time
    proposed_duration_minutes: int


class WhatIfResult(BaseModel):
    current: dict
    proposed: dict
    verdict: str


class EmergencyCreate(BaseModel):
    section_id: str
    track_id: Optional[str] = None
    asset_id: Optional[str] = None
    event_type: str
    severity: str = "CRITICAL"
    description: Optional[str] = None


class EmergencyOut(BaseModel):
    id: str
    section_id: str
    event_type: str
    severity: str
    status: str
    reported_at: datetime

    class Config:
        from_attributes = True


class AnalyticsSummary(BaseModel):
    total_tasks: int
    critical_tasks: int
    high_priority_tasks: int
    overdue_tasks: int
    scheduled_blocks: int
    conflicts_open: int
    emergency_events_open: int
    block_utilization_pct: float
    before_after: dict
