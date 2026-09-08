# RailSync AI — AI-Powered Automatic Block Planning to Maximize Asset Availability

SIH 2026 · Problem Statement **SIH26027** (South Central Railway / Guntakal Division demo data).

An intelligent decision-support system — **not a CRUD app** — that coordinates railway
maintenance across departments, tracks, assets and train schedules. A Manager
picks **From Station → To Station**, the system resolves the railway section
and lists its tracks, the Manager selects one or more tracks and adds one or
more tasks per track, and **Google OR-Tools CP-SAT** finds the best shared
maintenance block — explaining its reasoning, flagging live-train conflicts,
and always waiting for Manager approval before anything becomes active.

## 1. What's implemented

- **Live station search** (`GET /api/stations/search?q=`) — no hardcoded
  station list anywhere. Backed by the real **RailRadar API**
  (`api.railradar.in`, matching the reference tester's
  `/v1/lookup/search/stations` and `/v1/trains/between/{from}/{to}?live=`
  endpoints) once `RAILWAY_API_KEY` is set, or a ~40-station realistic
  mock fallback until then. The database starts with **zero** pre-seeded
  stations/sections/tracks/tasks — everything is created the moment a
  Manager searches for and resolves a real From/To pair.
- **In-between date ranges for task completion**: a task can specify an
  earliest and (optionally) latest acceptable date; CP-SAT then searches
  every day in that window for the single best date+time combination,
  collapsing to today's exact single-day behaviour whenever only one date
  is given.
- **Search-first UI everywhere**, not just Create Maintenance Task: Block
  Availability, Live Train Tracking and Emergency Re-Scheduling all use the
  same live From/To station search + section-resolve flow; What-If
  Simulation uses a type-to-filter search over your own existing requests
  instead of a plain dropdown.
- **Per-manager personal dashboards**: every manager only ever sees their
  own maintenance requests, dashboard counts, analytics and reports —
  registering a second manager account starts them with a completely empty
  dashboard, verified independently of any other manager's data.
- **Manager registration** (`POST /api/auth/register`) alongside login —
  any number of managers can self-register; the schema already supports
  multiple managers per station via `manager_stations`.
- **Single-role Manager authentication** (JWT + bcrypt).
- **From/To Station → Railway Section → Track** model, resolved on demand
  (`POST /api/sections/resolve`) and cached (idempotent — searching the
  same pair again returns the same section/tracks, doesn't duplicate).
  Tracks are still generated from a realistic mock template, since no
  public train-status API exposes physical track-level infrastructure —
  this is called out explicitly in the UI, not silently invented.
- **Multi-track, multi-task Create Maintenance Task workflow** — one
  submission can cover several tracks, each with its own list of tasks,
  all individually traceable via a shared `task_group_id`.
- **Group Duration Engine** (`optimization/group_duration.py`): parallel-
  compatible tasks share a block sized to the **longest** task; dependent
  or exclusive-resource tasks stack **sequentially**. Verified against the
  spec's own worked examples.
- **One CP-SAT `SchedulingEngine`** powering Automated Optimization,
  What-If Simulation and Emergency Re-Scheduling.
- **Rule-based Priority/Criticality Engine** (explicitly not a trained ML
  model, with an interface one could later slot into).
- **Task lifecycle**: DRAFT → PENDING_OPTIMIZATION → RECOMMENDED →
  APPROVED → IN_PROGRESS → COMPLETED (+ REJECTED/CANCELLED), with a
  working **Mark as Completed** action.
- **Live Train Tracking**, including a "live track of the selected track"
  panel embedded directly in the Create Maintenance Task wizard and the
  request detail page (`/ws/live-trains?section_id=&track_id=`) —
  section/train-level granularity, never invented track-level precision.
- **Railway Data Provider abstraction** — `MockRailwayAPIProvider` and
  `RealRailwayAPIProvider` (RailRadar), with automatic fallback and a
  `data_source` badge everywhere so REAL and SIMULATED data are never
  confused.
- Audit log of Manager actions; no invented performance numbers anywhere.

## 2. Architecture

```
React (Vite/Tailwind) → FastAPI (JWT-protected) → Railway Data Provider → Real/Mock Railway API
                                  ↓
                            PostgreSQL / SQLAlchemy
                                  ↓
   Group Duration Engine → Free-Window Engine → Priority Engine → Conflict Detector (incl. live trains)
                                  ↓
                            CP-SAT Scheduling Engine
                                  ↓
                 Explainable Recommendation → Manager Approval → Active Block
                                  ↓
                        WebSocket → Live Dashboard / Live Trains
```

Key backend modules:
- `app/core/security.py` — JWT auth for the Manager role.
- `app/models/models.py` — Manager, Station/Section/Track topology,
  MaintenanceTask (+ TaskDependency), Block, EmergencyEvent, ScheduleVersion,
  AuditLog, etc.
- `app/services/` — `railway_provider.py` (interface), `mock_railway_api.py`,
  `real_railway_api.py`, `railway_api.py` (facade with fallback).
- `app/optimization/` — `group_duration.py`, `free_window_engine.py`,
  `priority_engine.py`, `conflict_checker.py`, `objective.py` (configurable
  weights), `scheduler.py` (the CP-SAT `SchedulingEngine`).
- `app/api/` — REST routes matching the spec's suggested structure
  (`/api/auth`, `/api/stations`, `/api/sections`, `/api/tracks`,
  `/api/trains/schedule`, `/api/trains/live`, `/api/maintenance`,
  `/api/optimization`, `/api/simulation`, `/api/emergency`, `/api/conflicts`,
  `/api/dashboard`).
- `app/websocket/` — `/ws/dashboard`, `/ws/live-trains`.

## 3. Adding your RailRadar API key (do this whenever you're ready)

The system runs entirely on a realistic **mock** provider out of the box —
station search and train data both work immediately with no key.

1. Open `backend/.env` (copy from `backend/.env.example` if missing).
2. Set:
   ```
   RAILWAY_API_KEY=your_railradar_api_key
   RAILWAY_API_BASE_URL=https://api.railradar.in
   RAILWAY_API_PROVIDER=real
   ```
3. Restart the backend. Every response's `data_source` field switches from
   `MOCK_API/SIMULATED` to `REAL_API` once the real provider answers
   successfully; if a call fails, the system falls back to mock data
   automatically and never mislabels it.
4. If your RailRadar plan's response shape differs from the defensive
   parsing in `backend/app/services/real_railway_api.py`
   (`_extract_list` / `_normalize_station` / `_normalize_train`), adjust
   only that file.

**The API key is never sent to or read by the React frontend** — it lives
only in `backend/.env`, exactly like your reference browser tester warned
against hardcoding it into client-side code.

## 4. Running locally (no Docker)

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # SQLite by default — zero setup
uvicorn app.main:app --reload --port 8000
```
The database seeds only a demo Manager account and the three maintenance
departments on first startup — no stations, sections, tracks or tasks are
pre-created. Everything else appears once you search for and use real (or
mock-search-returned) stations.

To use PostgreSQL instead, set in `backend/.env`:
```
DATABASE_URL=postgresql+psycopg2://railway:railway@localhost:5432/railway_maintenance
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env       # VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

### Manager login
| username | password |
|---|---|
| manager1 | password123 |

New managers can also self-register from the login screen.

## 5. Running with Docker Compose

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build
```
Starts Postgres (`:5432`), FastAPI (`:8000`), and the built React frontend
(`:5173`). The frontend's API base URL is baked in at build time — rebuild
the frontend image if you change it.

## 6. Demo script (spec section 34)

1. **Login** as `manager1` (or register a new manager account — try it,
   then note their dashboard starts completely empty, independent of
   `manager1`'s work).
2. **Create Maintenance Task** → type "Anantapur" in From Station and pick
   it from the live search results, do the same for "Gooty" in To Station
   → the railway section resolves automatically → select **Track 1** → add
   three tasks: *Rail inspection* (30 min), *Rail grinding* (120 min),
   *Sleeper maintenance* (60 min), all with no dependency. Try setting a
   **Latest Date** a few days after the Earliest Date on one of them.
3. On the request page, click **Run Optimization** — CP-SAT recommends a
   **120-minute** block (the longest task), not 210 minutes, explains that
   the three tasks were grouped in parallel, and (if you set a date range)
   shows which date within that range was chosen and why. The Live Trains
   panel on the same page shows current corridor traffic.
4. **Manager Approve** → task statuses become `APPROVED`. **Start
   Maintenance** → `IN_PROGRESS`. **Mark as Completed** → `COMPLETED`.
5. **What-If Simulation** — search for the request you just created,
   propose a different date/time that overlaps a timetabled train, see the
   current-vs-proposed comparison and a "higher operational impact" verdict.
6. **Block Availability** / **Live Train Tracking** — search a From/To pair
   directly on these pages (same live search as Create Maintenance Task).
7. **Emergency Re-Scheduling** — search a corridor, report a signal
   failure → **Re-optimize (CP-SAT)** → see affected task groups
   re-scheduled with the actual measured solve time from that run.

## 7. What's a deliberate prototype simplification

Per spec section 39 ("don't over-engineer the prototype"), a few things are
intentionally kept simple and are natural next steps rather than gaps:
- Cross-track/cross-department coordination bonus is evaluated per section
  rather than a single joint CP-SAT model across all tracks simultaneously —
  the per-track CP-SAT calls already share the same engine and weights, so
  extending to a joint model is additive, not a rewrite.
- `Resource`/`TaskResource`/`Approval` as fully separate tables were folded
  into fields directly on `MaintenanceTask` (`resource_name`,
  `exclusive_resource`, `approved_by`/`approved_at`) for a leaner schema;
  splitting them out later is a straightforward migration.
- WebSocket endpoints are open (no token) for simplicity in this prototype —
  fine for a local/demo deployment, but should be authenticated before any
  real deployment.

## 8. Safety note

This is a **decision-support prototype**. It never claims to and does not
directly control railway signals, points, or trains, and it never invents
live train positions beyond what the configured data source actually
supports. It only produces recommendations that the Manager reviews and
approves.
