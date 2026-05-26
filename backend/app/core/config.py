"""
app/core/config.py
Configuration management using Pydantic Settings v2
Centralized environment variable handling with validation
"""

from pydantic_settings import BaseSettings
from typing import Literal
import os
from pathlib import Path


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    
    WHY THIS MATTERS:
    - Centralized config prevents scattered .env usage
    - Pydantic validates types automatically
    - Fails fast at startup if env vars are missing
    - Easy to override for testing
    - Supports .env file reading
    """
    
    # ==================== APP CORE ====================
    APP_NAME: str = "AI Telegram CRM"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    
    # ==================== SERVER ====================
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    API_V1_STR: str = "/api/v1"
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
    ]
    
    # ==================== DATABASE ====================
    DATABASE_URL: str
    # Format: postgresql+asyncpg://user:password@host:port/dbname
    
    DATABASE_ECHO: bool = False  # Log SQL queries
    DATABASE_POOL_SIZE: int = 20
    DATABASE_POOL_RECYCLE: int = 3600  # Recycle connections after 1 hour
    DATABASE_POOL_PRE_PING: bool = True  # Check connection validity
    
    # ==================== REDIS ====================
    REDIS_URL: str
    # Format: redis://localhost:6379/0
    
    REDIS_MAX_CONNECTIONS: int = 10
    REDIS_SOCKET_KEEPALIVE: bool = True
    REDIS_HEALTH_CHECK_INTERVAL: int = 30
    
    # ==================== TELEGRAM ====================
    TELEGRAM_API_ID: int
    TELEGRAM_API_HASH: str
    TELEGRAM_PHONE: str  # Phone number to sign in
    TELEGRAM_SESSION_PATH: str = "./sessions"
    TELEGRAM_SESSION_NAME: str = "telegram_session"
    
    # Optional: if using bot token instead of user account
    TELEGRAM_BOT_TOKEN: str | None = None
    
    # Rate limiting
    TELEGRAM_FLOOD_SLEEP: int = 60  # Wait time if rate limited
    TELEGRAM_REQUEST_RETRIES: int = 5
    
    # ==================== CLAUDE API ====================
    ANTHROPIC_API_KEY: str
    CLAUDE_MODEL: str = "claude-opus-4-1"  # Latest Claude model
    CLAUDE_MAX_TOKENS: int = 2048
    CLAUDE_TEMPERATURE: float = 0.7  # Slightly varied for personality
    CLAUDE_TIMEOUT: int = 30  # seconds
    
    # ==================== VECTOR EMBEDDINGS ====================
    EMBEDDING_MODEL: str = "voyage-3"  # Or use Claude's embeddings
    EMBEDDING_DIMENSION: int = 1024
    VECTOR_SEARCH_LIMIT: int = 5  # Top-k similar memories
    EMBEDDING_BATCH_SIZE: int = 10
    
    # ==================== MEMORY & CONTEXT ====================
    CONTEXT_WINDOW_SIZE: int = 10  # Recent messages
    MEMORY_SEMANTIC_MATCHES: int = 5  # Retrieved from vector search
    MEMORY_RETENTION_DAYS: int = 365
    MEMORY_CLEANUP_BATCH: int = 1000
    
    # ==================== SECURITY ====================
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # ==================== ENCRYPTION ====================
    ENCRYPTION_KEY: str | None = None  # For sensitive data
    # Generate with: from cryptography.fernet import Fernet; Fernet.generate_key()
    
    # ==================== LOGGING ====================
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"  # "json" or "standard"
    LOG_FILE: str | None = None
    LOG_RETENTION_DAYS: int = 30
    
    # ==================== FEATURE FLAGS ====================
    ENABLE_AI_RESPONSES: bool = True
    ENABLE_VECTOR_MEMORY: bool = True
    ENABLE_AUTO_LEAD_SCORING: bool = True
    ENABLE_AUTO_TAGGING: bool = True
    ENABLE_SALES_FUNNEL: bool = True
    
    # ==================== RATE LIMITING ====================
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: int = 60  # seconds
    
    # ==================== BACKGROUND JOBS ====================
    ENABLE_BACKGROUND_JOBS: bool = True
    MESSAGE_SYNC_INTERVAL: int = 30  # seconds
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


# Create global settings instance
settings = Settings()


# ==================== VALIDATION ====================

def validate_settings() -> None:
    """
    Validate critical settings at startup.
    Fails fast if configuration is invalid.
    """
    errors = []
    
    # Validate database URL format
    if not settings.DATABASE_URL.startswith("postgresql+asyncpg://"):
        errors.append(
            "DATABASE_URL must use asyncpg driver: "
            "postgresql+asyncpg://user:password@host/dbname"
        )
    
    # Validate Redis URL format
    if not settings.REDIS_URL.startswith("redis://"):
        errors.append("REDIS_URL must start with redis://")
    
    # Validate Telegram config
    if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
        errors.append("TELEGRAM_API_ID and TELEGRAM_API_HASH are required")
    
    # Validate Claude API key
    if not settings.ANTHROPIC_API_KEY.startswith("sk-"):
        errors.append("ANTHROPIC_API_KEY must start with sk-")
    
    # Validate secret key length
    if len(settings.SECRET_KEY) < 32:
        errors.append("SECRET_KEY must be at least 32 characters")
    
    # Create session directory
    Path(settings.TELEGRAM_SESSION_PATH).mkdir(parents=True, exist_ok=True)
    
    if errors:
        raise ValueError(f"Configuration validation failed:\n" + "\n".join(errors))


__all__ = ["settings", "validate_settings"]
