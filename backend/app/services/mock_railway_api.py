"""
MockRailwayAPIProvider — realistic, deterministic (seeded by inputs)
simulated railway data. Used automatically whenever no real
RAILWAY_API_KEY is configured, and as an automatic fallback if a real API
call fails. Every record is tagged source="MOCK_API" so the UI can never
confuse it with live data.

Station search is NOT a tiny hardcoded dropdown — it's a ~40-station
realistic South/South-Central Railway reference list that supports
fuzzy name/code matching, standing in for a real live-search API until
RAILWAY_API_KEY is configured.
"""
import hashlib
import random
from datetime import date, time, datetime
from typing import List, Dict, Any

from app.services.railway_provider import RailwayDataProvider

TRAIN_NAMES = [
    ("12708", "Deccan Express", "EXPRESS"),
    ("17232", "Narayanadri Express", "EXPRESS"),
    ("57487", "Anantapur Passenger", "PASSENGER"),
    ("56507", "Guntakal Passenger", "PASSENGER"),
    ("12649", "Sanghamitra Express", "EXPRESS"),
    ("07429", "Guntakal-Gooty MEMU", "PASSENGER"),
    ("BG-4501", "Goods Rake 4501", "GOODS"),
    ("BG-7788", "Goods Rake 7788", "GOODS"),
]

# Realistic station reference data (South Central Railway and neighbouring
# zones) used ONLY as a mock/demo stand-in for a live station-search API.
MOCK_STATIONS = [
    {"name": "Anantapur", "code": "ATP", "city": "Anantapur, AP"},
    {"name": "Gooty", "code": "GY", "city": "Anantapur, AP"},
    {"name": "Guntakal Jn", "code": "GTL", "city": "Anantapur, AP"},
    {"name": "Dharmavaram Jn", "code": "DMM", "city": "Sri Sathya Sai, AP"},
    {"name": "Tadipatri", "code": "TU", "city": "Anantapur, AP"},
    {"name": "Kadapa", "code": "HX", "city": "YSR Kadapa, AP"},
    {"name": "Renigunta Jn", "code": "RU", "city": "Tirupati, AP"},
    {"name": "Tirupati", "code": "TPTY", "city": "Tirupati, AP"},
    {"name": "Vijayawada Jn", "code": "BZA", "city": "NTR, AP"},
    {"name": "Rajahmundry", "code": "RJY", "city": "East Godavari, AP"},
    {"name": "Samalkot Jn", "code": "SLO", "city": "Kakinada, AP"},
    {"name": "Visakhapatnam", "code": "VSKP", "city": "Visakhapatnam, AP"},
    {"name": "Nellore", "code": "NLR", "city": "SPSR Nellore, AP"},
    {"name": "Guntur Jn", "code": "GNT", "city": "Guntur, AP"},
    {"name": "Secunderabad Jn", "code": "SC", "city": "Hyderabad, TG"},
    {"name": "Hyderabad Deccan", "code": "HYB", "city": "Hyderabad, TG"},
    {"name": "Kacheguda", "code": "KCG", "city": "Hyderabad, TG"},
    {"name": "Warangal", "code": "WL", "city": "Warangal, TG"},
    {"name": "Kazipet Jn", "code": "KZJ", "city": "Warangal, TG"},
    {"name": "Nagpur", "code": "NGP", "city": "Nagpur, MH"},
    {"name": "Chennai Central", "code": "MAS", "city": "Chennai, TN"},
    {"name": "Chennai Egmore", "code": "MS", "city": "Chennai, TN"},
    {"name": "Katpadi Jn", "code": "KPD", "city": "Vellore, TN"},
    {"name": "Bengaluru City Jn", "code": "SBC", "city": "Bengaluru, KA"},
    {"name": "Yesvantpur Jn", "code": "YPR", "city": "Bengaluru, KA"},
    {"name": "Dharmavaram", "code": "DMM2", "city": "Anantapur, AP"},
    {"name": "Kurnool City", "code": "KRNT", "city": "Kurnool, AP"},
    {"name": "Kurnool Town", "code": "KRNT2", "city": "Kurnool, AP"},
    {"name": "Adoni", "code": "AD", "city": "Kurnool, AP"},
    {"name": "Raichur Jn", "code": "RC", "city": "Raichur, KA"},
    {"name": "Wadi Jn", "code": "WADI", "city": "Kalaburagi, KA"},
    {"name": "Solapur Jn", "code": "SUR", "city": "Solapur, MH"},
    {"name": "Pune Jn", "code": "PUNE", "city": "Pune, MH"},
    {"name": "Mumbai CST", "code": "CSMT", "city": "Mumbai, MH"},
    {"name": "Vijayawada Bypass", "code": "BZAB", "city": "NTR, AP"},
    {"name": "Eluru", "code": "EE", "city": "Eluru, AP"},
    {"name": "Bhimavaram Town", "code": "BVRT", "city": "West Godavari, AP"},
    {"name": "Kakinada Town", "code": "CCT", "city": "Kakinada, AP"},
    {"name": "Anakapalle", "code": "AKP", "city": "Anakapalli, AP"},
    {"name": "Vizianagaram Jn", "code": "VZM", "city": "Vizianagaram, AP"},
    {"name": "Srikakulam Road", "code": "CHE", "city": "Srikakulam, AP"},
]


def _seeded_random(*parts: str) -> random.Random:
    key = "|".join(parts)
    seed = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (10 ** 8)
    return random.Random(seed)


class MockRailwayAPIProvider(RailwayDataProvider):
    name = "mock"

    def is_live(self) -> bool:
        return False

    def search_stations(self, query: str) -> List[Dict[str, Any]]:
        q = (query or "").strip().lower()
        if len(q) < 2:
            return []
        results = [
            {**s, "source": "MOCK_API"}
            for s in MOCK_STATIONS
            if q in s["name"].lower() or q in s["code"].lower()
        ]
        return results[:20]

    def get_trains_between(self, from_code: str, to_code: str, on_date: date,
                            live: bool = False) -> List[Dict[str, Any]]:
        if live:
            return self._live_trains(from_code, to_code)
        return self._scheduled_trains(from_code, to_code, on_date)

    def _scheduled_trains(self, from_code: str, to_code: str, on_date: date) -> List[Dict[str, Any]]:
        rng = _seeded_random(from_code, to_code, on_date.isoformat())
        n_movements = rng.randint(5, 9)
        movements = []
        used_minutes = set()
        for _ in range(n_movements):
            train_number, train_name, train_type = rng.choice(TRAIN_NAMES)
            minute_of_day = rng.randint(6 * 60, 22 * 60)
            while minute_of_day in used_minutes:
                minute_of_day = rng.randint(6 * 60, 22 * 60)
            used_minutes.add(minute_of_day)
            arr = time(minute_of_day // 60, minute_of_day % 60)
            dep_minute = minute_of_day + rng.randint(2, 10)
            dep = time((dep_minute // 60) % 24, dep_minute % 60)
            status = rng.choice(["ON_TIME", "ON_TIME", "ON_TIME", "DELAYED_5", "DELAYED_15"])
            movements.append({
                "train_number": f"{train_number}-{rng.randint(1,9)}",
                "train_name": train_name,
                "train_type": train_type,
                "arrival_time": arr.strftime("%H:%M"),
                "departure_time": dep.strftime("%H:%M"),
                "origin": from_code,
                "destination": to_code,
                "status": status,
                "delay_minutes": 0,
                "current_location_label": None,
                "direction": f"{from_code} -> {to_code}",
                "expected_through_time": arr.strftime("%H:%M"),
                "last_updated": None,
                "granularity": "STATION_LEVEL",
                "source": "MOCK_API",
            })
        movements.sort(key=lambda m: m["arrival_time"])
        return movements

    def _live_trains(self, from_code: str, to_code: str) -> List[Dict[str, Any]]:
        """Simulated live positions, seeded by the current ~2-minute tick so
        positions appear to move over successive polls without stored
        state. Granularity is honestly reported as SECTION_LEVEL — this
        mock (like most public Indian Rail APIs) does not claim exact
        track-level positioning (spec section 14)."""
        now = datetime.utcnow()
        tick = now.replace(second=0, microsecond=0)
        tick = tick.replace(minute=(tick.minute // 2) * 2)
        rng = _seeded_random("live", from_code, to_code, tick.isoformat())

        n = rng.randint(1, 4)
        out = []
        for _ in range(n):
            train_number, train_name, train_type = rng.choice(TRAIN_NAMES)
            direction = rng.choice([f"{from_code} -> {to_code}", f"{to_code} -> {from_code}"])
            status = rng.choice(["RUNNING", "RUNNING", "ON_TIME", "DELAYED"])
            delay = 0 if status == "ON_TIME" else rng.choice([0, 5, 8, 12, 18])
            location_pct = rng.randint(5, 95)
            expected_through_minute = rng.randint(0, 23 * 60)
            out.append({
                "train_number": f"{train_number}-{rng.randint(1, 9)}",
                "train_name": train_name,
                "train_type": train_type,
                "arrival_time": None, "departure_time": None,
                "origin": from_code, "destination": to_code,
                "status": status,
                "delay_minutes": delay,
                "current_location_label": f"~{location_pct}% between {from_code} and {to_code}",
                "direction": direction,
                "expected_through_time": time(expected_through_minute // 60, expected_through_minute % 60).strftime("%H:%M"),
                "last_updated": now.isoformat(timespec="seconds") + "Z",
                "granularity": "SECTION_LEVEL",
                "source": "MOCK_API",
            })
        return out

    def get_goods_forecast(self, section_name: str, on_date: date) -> List[Dict[str, Any]]:
        rng = _seeded_random("goods", section_name, on_date.isoformat())
        n = rng.randint(1, 3)
        out = []
        for _ in range(n):
            minute_of_day = rng.randint(6 * 60, 22 * 60)
            out.append({
                "expected_time": time(minute_of_day // 60, minute_of_day % 60).strftime("%H:%M"),
                "load_description": rng.choice(["Coal rake", "Container rake", "Cement rake", "Mixed goods"]),
                "source": "MOCK_API",
            })
        return out
