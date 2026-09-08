import asyncio
import json
from datetime import date

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session

from app.websocket.manager import ws_manager
from app.services.railway_api import railway_api_service
from app.database.session import get_db
from app.models import models as m

router = APIRouter()


@router.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # clients don't need to send anything; keep the connection open
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@router.websocket("/ws/live-trains")
async def live_trains_ws(websocket: WebSocket, section_id: str, track_id: str | None = None,
                          db: Session = Depends(get_db)):
    """Pushes live train positions for the selected corridor every few
    seconds (spec section 14) — controlled polling under the hood via the
    mock/real provider, exposed to the client as a stream. `track_id` is
    accepted purely for display context ("live track of the selected
    track") since public train-status APIs report section/train-level
    position, not exact track occupancy — the payload's `granularity`
    field always reflects what the active provider actually supports."""
    section = db.query(m.RailwaySection).get(section_id)
    if not section:
        await websocket.close(code=4404)
        return
    from_code = section.from_station.code if section.from_station else ""
    to_code = section.to_station.code if section.to_station else ""
    track = db.query(m.Track).get(track_id) if track_id else None

    await websocket.accept()
    try:
        while True:
            trains = railway_api_service.get_trains_between(from_code, to_code, date.today(), live=True)
            await websocket.send_text(json.dumps({
                "section_id": section_id, "section": section.name,
                "track_id": track_id, "track_code": track.track_code if track else None,
                "data_source": "REAL_API" if railway_api_service.is_live() else "MOCK_API/SIMULATED",
                "trains": trains,
            }))
            await asyncio.sleep(300)
    except WebSocketDisconnect:
        pass
