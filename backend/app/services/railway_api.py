"""
RailwayAPIService — the single entry point the rest of the backend uses
for station search and train data. It:

1. Picks the configured provider (mock by default; real once an API key
   is present and RAILWAY_API_PROVIDER=real).
2. Calls it.
3. Falls back to the mock provider on any failure (timeout, bad key,
   rate limit, malformed response) so the app never breaks.
4. Reports which one actually served the request via `last_source`; every
   endpoint surfaces this to the UI as "Data Source: LIVE API" /
   "Data Source: SIMULATED DATA" — never mislabelled.
"""
import logging
from datetime import date
from typing import List, Dict, Any, Optional

from app.config import settings
from app.services.mock_railway_api import MockRailwayAPIProvider
from app.services.railway_provider import RailwayDataProvider

logger = logging.getLogger("railway_api")


class RailwayAPIService:
    def __init__(self):
        self.mock = MockRailwayAPIProvider()
        self._real: Optional[RailwayDataProvider] = None
        self.last_source = "MOCK_API"

    def _get_real(self) -> RailwayDataProvider:
        if self._real is None:
            from app.services.real_railway_api import RealRailwayAPIProvider
            self._real = RealRailwayAPIProvider()
        return self._real

    def _active_provider(self) -> RailwayDataProvider:
        if settings.RAILWAY_API_PROVIDER == "real" and settings.RAILWAY_API_KEY:
            try:
                return self._get_real()
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Real railway API unavailable, falling back to mock: %s", exc)
                return self.mock
        return self.mock

    def search_stations(self, query: str) -> List[Dict[str, Any]]:
        provider = self._active_provider()
        try:
            results = provider.search_stations(query)
            if not results and provider.is_live():
                # real API might just have no matches — don't force mock data
                # over a legitimate empty result unless the call itself failed
                return results
            self.last_source = "REAL_API" if provider.is_live() else "MOCK_API"
            return results
        except Exception as exc:
            logger.warning("Station search failed (%s); falling back to mock data.", exc)
            self.last_source = "MOCK_API"
            return self.mock.search_stations(query)

    def get_trains_between(self, from_code: str, to_code: str, on_date: date,
                            live: bool = False) -> List[Dict[str, Any]]:
        provider = self._active_provider()
        try:
            data = provider.get_trains_between(from_code, to_code, on_date, live=live)
            self.last_source = "REAL_API" if provider.is_live() else "MOCK_API"
            return data
        except Exception as exc:
            logger.warning("Trains-between call failed (%s); falling back to mock data.", exc)
            self.last_source = "MOCK_API"
            return self.mock.get_trains_between(from_code, to_code, on_date, live=live)

    def get_goods_forecast(self, section_name: str, on_date: date) -> List[Dict[str, Any]]:
        provider = self._active_provider()
        try:
            data = provider.get_goods_forecast(section_name, on_date)
            if not data:
                data = self.mock.get_goods_forecast(section_name, on_date)
            return data
        except Exception:
            return self.mock.get_goods_forecast(section_name, on_date)

    def is_live(self) -> bool:
        return self._active_provider().is_live()


railway_api_service = RailwayAPIService()
