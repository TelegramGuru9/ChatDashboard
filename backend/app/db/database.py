"""
app/db/database.py
Database connection pool management using async SQLAlchemy.
"""

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
    AsyncEngine
)
from sqlalchemy.pool import QueuePool
from sqlalchemy import text
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
import logging

from app.core.config import settings
from app.db.models import Base

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Manages database connection and session lifecycle."""

    def __init__(self):
        self.engine: Optional[AsyncEngine] = None
        self.session_maker: Optional[async_sessionmaker] = None
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize database connection pool."""
        if self._initialized:
            logger.warning("Database already initialized, skipping")
            return

        try:
            self.engine = create_async_engine(
                settings.DATABASE_URL,
                echo=settings.DATABASE_ECHO,
                pool_size=settings.DATABASE_POOL_SIZE,
                max_overflow=5,
                pool_pre_ping=settings.DATABASE_POOL_PRE_PING,
                pool_recycle=settings.DATABASE_POOL_RECYCLE,
                connect_args={
                    "timeout": 30,
                    "command_timeout": 30,
                    "server_settings": {
                        "jit": "off",
                    }
                },
                poolclass=QueuePool,
            )

            self.session_maker = async_sessionmaker(
                self.engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autoflush=False,
                autocommit=False,
            )

            # Enable required extensions, then create tables
            async with self.engine.begin() as conn:
                await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
                await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "vector"'))
                await conn.run_sync(Base.metadata.create_all)

            self._initialized = True
            logger.info("Database initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise

    async def close(self) -> None:
        """Close database connections."""
        if self.engine:
            await self.engine.dispose()
            self._initialized = False
            logger.info("Database connections closed")

    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get a database session (context manager)."""
        if not self._initialized or not self.session_maker:
            raise RuntimeError("Database not initialized. Call initialize() first.")

        session = self.session_maker()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def create_tables(self) -> None:
        """Create all tables (idempotent — called after initialize)."""
        # Tables are already created in initialize(); this is a no-op.
        logger.info("Tables already created during initialize()")


# Global database manager instance
db_manager = DatabaseManager()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for getting a database session."""
    async with db_manager.get_session() as session:
        yield session


__all__ = ["db_manager", "get_db", "DatabaseManager", "AsyncSession"]
