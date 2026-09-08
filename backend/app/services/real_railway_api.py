"""
RealRailwayAPIProvider — talks to the RailRadar API
(https://api.railradar.in), matching the endpoints/response handling
verified in the reference browser tester:

  GET  {base}/v1/lookup/search/stations?q={query}      (Bearer auth)
  GET  {base}/v1/trains/between/{fromCode}/{toCode}?live=true|false

Both endpoints' response shapes vary slightly across accounts/plans, so
this adapter defensively looks for the payload under several common keys
(`data`, `results`, `stations`/`trains`, or a bare array) — the same
tolerant parsing used in the reference tester — before normalizing into
the shapes the rest of the app expects.

When you get your API key:
1. Put it in backend/.env as RAILWAY_API_KEY.
2. Set RAILWAY_API_BASE_URL=https://api.railradar.in (default already).
3. Set RAILWAY_API_PROVIDER=real.
4. Restart the backend.

If the response shape from your plan differs, adjust only
`_extract_list` / `_normalize_station` / `_normalize_train` below —
nothing else in the app needs to change.
"""
from datetime import date
from typing import List, Dict, Any, Optional
import logging

import httpx

from app.config import settings
from app.services.railway_provider import RailwayDataProvider

logger = logging.getLogger("railway_api.real")


def _extract_list(data: Any, *keys: str) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in keys:
            val = data.get(key)
            if isinstance(val, list):
                return val
            if isinstance(val, dict):
                for inner_key in keys:
                    inner = val.get(inner_key)
                    if isinstance(inner, list):
                        return inner
    return []


class RealRailwayAPIProvider(RailwayDataProvider):
    name = "real"

    def __init__(self):
        if not settings.RAILWAY_API_KEY:
            raise RuntimeError("RAILWAY_API_KEY is not set; cannot use the real provider.")
        self.api_key = settings.RAILWAY_API_KEY
        self.base_url = (settings.RAILWAY_API_BASE_URL or "https://api.railradar.in").rstrip("/")

    def is_live(self) -> bool:
        return True

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}

    def _get(self, path: str) -> Any:
        url = f"{self.base_url}{path}"
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(url, headers=self._headers())
            resp.raise_for_status()
            try:
                return resp.json()
            except ValueError:
                return {"rawResponse": resp.text}

    @staticmethod
    def _normalize_station(s: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "name": s.get("name") or s.get("station_name") or s.get("stationName") or s.get("title") or "Unknown Station",
            "code": s.get("code") or s.get("station_code") or s.get("stationCode") or s.get("stnCode") or "",
            "city": s.get("city") or s.get("location") or s.get("district") or "",
            "source": "REAL_API",
        }

    def search_stations(self, query: str) -> List[Dict[str, Any]]:
        if not query or len(query.strip()) < 2:
            return []
        try:
            data = self._get(f"/v1/lookup/search/stations?q={query}")
        except Exception as exc:
            logger.warning("Station search failed: %s", exc)
            return []
        raw_stations = _extract_list(data, "stations", "data", "results")
        return [self._normalize_station(s) for s in raw_stations][:20]

    @staticmethod
    def _normalize_train(t: Dict[str, Any], from_code: str, to_code: str, live: bool) -> Dict[str, Any]:
        train_obj = t.get("train") if isinstance(t.get("train"), dict) else {}
        from_obj = t.get("from") if isinstance(t.get("from"), dict) else {}
        to_obj = t.get("to") if isinstance(t.get("to"), dict) else {}
        live_obj = t.get("live") if isinstance(t.get("live"), dict) else {}

        # Extract departure from origin station and arrival from destination station block
        departure_time = from_obj.get("departure") or from_obj.get("departureTime") or ""
        arrival_time = to_obj.get("arrival") or to_obj.get("arrivalTime") or ""

        live_type = live_obj.get("type", "not-running")
        delay = live_obj.get("delayMinutes", 0)

        if live_type == "departed":
            status = "DEPARTED"
        elif live_type == "upcoming":
            status = "UPCOMING"
        elif live_type == "not-running":
            status = "ON_TIME"
        else:
            status = str(live_type).upper()

        platform = live_obj.get("platform")
        location_label = f"Platform {platform}" if platform else (live_obj.get("currentLocation") or None)

        return {
            "train_number": str(train_obj.get("number") or train_obj.get("trainNumber") or train_obj.get("trainNo") or ""),
            "train_name": train_obj.get("name") or train_obj.get("trainName") or train_obj.get("trainTitle") or "",
            "train_type": train_obj.get("type") or train_obj.get("trainType") or "PASSENGER",
            "arrival_time": arrival_time, 
            "departure_time": departure_time,
            "origin": from_obj.get("code") or from_code, 
            "destination": to_obj.get("code") or to_code,
            "status": status,
            "delay_minutes": delay if isinstance(delay, (int, float)) else 0,
            "current_location_label": location_label,
            "direction": f"{from_code} -> {to_code}",
            "expected_through_time": arrival_time,
            "last_updated": live_obj.get("departedAt") or live_obj.get("lastUpdated"),
            "granularity": "TRAIN_LEVEL" if live else "STATION_LEVEL",
            "source": "REAL_API",
        }

    def get_trains_between(self, from_code: str, to_code: str, on_date: date,
                            live: bool = False) -> List[Dict[str, Any]]:
        live_param = "true" if live else "false"
        data = self._get(f"/v1/trains/between/{from_code}/{to_code}?live={live_param}")
        raw_trains = _extract_list(data, "trains", "data", "results")
        return [self._normalize_train(t, from_code, to_code, live) for t in raw_trains]

    def get_goods_forecast(self, section_name: str, on_date: date) -> List[Dict[str, Any]]:
        return []