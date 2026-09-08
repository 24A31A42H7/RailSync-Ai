"""
Central configuration. Everything secret/environment-specific comes from
environment variables (.env) — nothing is hardcoded, and nothing here is
ever imported by the frontend.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Railway Data API (RailRadar)
    RAILWAY_API_KEY: str = ""
    RAILWAY_API_BASE_URL: str = "https://api.railradar.in"
    RAILWAY_API_PROVIDER: str = "mock"  # "mock" | "real"

    # Database
    DATABASE_URL: str = "sqlite:///./railway_maintenance.db"

    # Auth (single MANAGER role)
    JWT_SECRET_KEY: str = "dev-secret-change-before-any-real-deployment"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    FRONTEND_URL: str = "http://localhost:5173"

    # Optimization objective weights (Section 8 of spec) — tunable without code changes
    WEIGHT_ASSET_AVAILABILITY: float = 10
    WEIGHT_CRITICAL_TASK: float = 25
    WEIGHT_BLOCK_UTILIZATION: float = 8
    WEIGHT_COORDINATION_BENEFIT: float = 15
    WEIGHT_TRAIN_DELAY_PENALTY: float = 20
    WEIGHT_CONFLICT_PENALTY: float = 40
    WEIGHT_DOWNTIME_PENALTY: float = 5
    WEIGHT_DEADLINE_VIOLATION_PENALTY: float = 50
    WEIGHT_EARLINESS_BONUS: float = 3  # small per-day preference for an earlier date within a date range


settings = Settings()
