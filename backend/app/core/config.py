"""
app/core/config.py
Configuration management using Pydantic Settings v2.
"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Literal, Optional
import os
from pathlib import Path


class Settings(BaseSettings):
    # ==================== APP CORE ====================
    APP_NAME: str = "AI Telegram CRM"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # ==================== SERVER ====================
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    API_V1_STR: str = "/api/v1"
    CORS_ORIGINS: list = ["*"]

    # ==================== DATABASE ====================
    # Railway provides postgresql:// — we auto-upgrade to postgresql+asyncpg://
    DATABASE_URL: str = "postgresql+asyncpg://localhost/telegram_crm"

    DATABASE_ECHO: bool = False
    DATABASE_POOL_SIZE: int = 10
    DATABASE_POOL_RECYCLE: int = 3600
    DATABASE_POOL_PRE_PING: bool = True

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def fix_database_url(cls, v: str) -> str:
        """Convert Railway's postgresql:// to postgresql+asyncpg://"""
        if v and v.startswith("postgres://"):
            v = "postgresql+asyncpg://" + v[len("postgres://"):]
        elif v and v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

    # ==================== REDIS ====================
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 10

    # ==================== TELEGRAM ====================
    TELEGRAM_API_ID: Optional[int] = None
    TELEGRAM_API_HASH: Optional[str] = None
    TELEGRAM_PHONE: Optional[str] = None
    TELEGRAM_SESSION_PATH: str = "./sessions"
    TELEGRAM_SESSION_NAME: str = "telegram_session"
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_FLOOD_SLEEP: int = 60
    TELEGRAM_REQUEST_RETRIES: int = 5

    # ==================== CLAUDE API ====================
    ANTHROPIC_API_KEY: Optional[str] = None
    CLAUDE_MODEL: str = "claude-opus-4-5"
    CLAUDE_MAX_TOKENS: int = 2048
    CLAUDE_TEMPERATURE: float = 0.7
    CLAUDE_TIMEOUT: int = 30

    # ==================== VECTOR EMBEDDINGS ====================
    EMBEDDING_MODEL: str = "voyage-3"
    EMBEDDING_DIMENSION: int = 1024
    VECTOR_SEARCH_LIMIT: int = 5
    EMBEDDING_BATCH_SIZE: int = 10

    # ==================== MEMORY & CONTEXT ====================
    CONTEXT_WINDOW_SIZE: int = 10
    MEMORY_SEMANTIC_MATCHES: int = 5
    MEMORY_RETENTION_DAYS: int = 365

    # ==================== SECURITY ====================
    SECRET_KEY: str = "change-me-in-production-must-be-long-enough-32chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENCRYPTION_KEY: Optional[str] = None

    # ==================== LOGGING ====================
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    # ==================== FEATURE FLAGS ====================
    ENABLE_AI_RESPONSES: bool = True
    ENABLE_VECTOR_MEMORY: bool = True
    ENABLE_AUTO_LEAD_SCORING: bool = True
    ENABLE_AUTO_TAGGING: bool = True
    ENABLE_SALES_FUNNEL: bool = True

    # ==================== RATE LIMITING ====================
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: int = 60

    # ==================== BACKGROUND JOBS ====================
    ENABLE_BACKGROUND_JOBS: bool = True
    MESSAGE_SYNC_INTERVAL: int = 30
    EMBEDDING_BATCH_INTERVAL: int = 60
    LEAD_SCORE_UPDATE_INTERVAL: int = 300

    # ==================== SALES FUNNEL ====================
    FUNNEL_ENGAGEMENT_THRESHOLD: float = 0.7
    FUNNEL_CONVERSION_TARGET: str = "https://yourwebsite.com/offer"
    FUNNEL_AUTO_REDIRECT_AFTER_MESSAGES: int = 10

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


# Create global settings instance
settings = Settings()

# Ensure session directory exists
Path(settings.TELEGRAM_SESSION_PATH).mkdir(parents=True, exist_ok=True)


__all__ = ["settings"]
