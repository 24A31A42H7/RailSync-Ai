"""
RailwayDataProvider — the abstraction the rest of the app talks to. It
never knows or cares whether data came from a real API or the mock
provider; it only receives normalized dicts in the shapes below.

Implementations: MockRailwayAPIProvider (default, no key required — used
as a fallback too) and RealRailwayAPIProvider (used once RAILWAY_API_KEY /
RAILWAY_API_BASE_URL are configured, shaped around the RailRadar API:
station search + trains-between-stations with an optional live flag).
Swapping providers is a one-line config change (RAILWAY_API_PROVIDER=mock|real)
— the rest of the app is unaffected.
"""
from abc import ABC, abstractmethod
from datetime import date
from typing import List, Dict, Any


class RailwayDataProvider(ABC):
    name: str = "base"

    @abstractmethod
    def search_stations(self, query: str) -> List[Dict[str, Any]]:
        """Live station search/autocomplete — never a hardcoded list.
        Returns [{name, code, city, source}]."""
        raise NotImplementedError

    @abstractmethod
    def get_trains_between(self, from_code: str, to_code: str, on_date: date,
                            live: bool = False) -> List[Dict[str, Any]]:
        """Trains running between two stations. Returns a normalized list:
        {train_number, train_name, train_type, arrival_time (HH:MM or None),
         departure_time (HH:MM or None), origin, destination, status,
         delay_minutes, current_location_label, direction,
         expected_through_time (HH:MM), last_updated (ISO), source,
         granularity: "TRAIN_LEVEL" | "SECTION_LEVEL" | "STATION_LEVEL" | "TRACK_LEVEL"}.
        `live=True` requests current running position/delay where the
        provider supports it. Real providers must report the granularity
        they actually deliver — never claim track-level precision the
        underlying API doesn't provide (spec section 14)."""
        raise NotImplementedError

    @abstractmethod
    def get_goods_forecast(self, section_name: str, on_date: date) -> List[Dict[str, Any]]:
        """Return list of {expected_time (HH:MM), load_description, source}."""
        raise NotImplementedError

    @abstractmethod
    def is_live(self) -> bool:
        """True only when talking to the real, configured API."""
        raise NotImplementedError
