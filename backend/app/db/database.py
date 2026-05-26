"""
app/db/database.py
Database connection pool management using async SQLAlchemy.

ARCHITECTURE DECISIONS:
1. AsyncSession for async/await compatibility
2. Connection pooling for performance
3. Explicit session management in repositories
4. Automatic reconnection on connection loss
5. Transaction management at service level
"""

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
    AsyncEngine
)
from sqlalchemy.pool import NullPool, QueuePool
from sqlalchemy import event, inspect
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
import logging

from app.core.config import settings
from app.db.models import Base

logger = logging.getLogger(__name__)


class DatabaseManager:
    """
    Manages database connection and session lifecycle.
    
    WHY THIS PATTERN:
    - Centralized connection management
    - Easy to mock for testing
    - Handles connection pool efficiently
    - Automatic cleanup on shutdown
    """
    
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
            # Create async engine
            self.engine = create_async_engine(
                settings.DATABASE_URL,
                echo=settings.DATABASE_ECHO,
                pool_size=settings.DATABASE_POOL_SIZE,
                max_overflow=10,  # Additional connections beyond pool_size
                pool_pre_ping=settings.DATABASE_POOL_PRE_PING,
                pool_recycle=settings.DATABASE_POOL_RECYCLE,
                connect_args={
                    "timeout": 30,
                    "command_timeout": 30,
                    "server_settings": {
                        "jit": "off",  # Disable JIT for consistency
                        "work_mem": "256MB",
                    }
                },
                # Use NullPool for serverless, QueuePool for traditional
                poolclass=QueuePool,
            )
            
            # Create session factory
            self.session_maker = async_sessionmaker(
                self.engine,
                class_=AsyncSession,
                expire_on_commit=False,  # Keep objects after commit
                autoflush=False,
                autocommit=False,
            )
            
            # Test connection
            async with self.engine.begin() as conn:
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
        """
        Get a database session.
        
        Usage:
            async with db_manager.get_session() as session:
                result = await session.execute(query)
        """
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
        """Create all tables in database."""
        if not self.engine:
            raise RuntimeError("Database engine not initialized")
        
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created")
    
    async def drop_tables(self) -> None:
        """Drop all tables (use with caution!)."""
        if not self.engine:
            raise RuntimeError("Database engine not initialized")
        
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        logger.warning("All database tables dropped")


# Global database manager instance
db_manager = DatabaseManager()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for getting database session.
    
    Usage in endpoints:
        @router.get("/users")
        async def get_users(session: AsyncSession = Depends(get_db)):
            ...
    """
    async with db_manager.get_session() as session:
        yield session


# ==================== CONNECTION EVENTS ====================

@event.listens_for(AsyncEngine, "connect")
async def receive_connect(dbapi_conn, connection_record):
    """Configure PostgreSQL connection on connect."""
    # Enable UUID type support
    await dbapi_conn.run_sync(lambda conn: conn.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\""))
    # Enable pgvector extension
    await dbapi_conn.run_sync(lambda conn: conn.execute("CREATE EXTENSION IF NOT EXISTS \"vector\""))
    logger.debug("PostgreSQL extensions enabled")


@event.listens_for(AsyncEngine, "engine_disposed")
def receive_engine_disposed(engine):
    """Log when engine is disposed."""
    logger.info("AsyncEngine disposed")


# ==================== MIGRATION SUPPORT ====================

async def run_migrations() -> None:
    """
    Run database migrations using Alembic.
    Should be called at startup if using migration system.
    """
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from alembic.runtime.migration import MigrationContext
    from alembic.operations import Operations
    
    # This is a simplified version
    # For production, use Alembic CLI
    logger.info("Running database migrations...")
    # Implementation depends on Alembic setup


__all__ = ["db_manager", "get_db", "DatabaseManager", "AsyncSession"]
