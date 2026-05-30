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

                # ── Auto-migrations ─────────────────────────────────────────
                for migration_sql in [
                    # INTEGER → BIGINT for Telegram IDs
                    """
                    DO $$ BEGIN
                        IF EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='user_id'
                              AND data_type='integer') THEN
                            ALTER TABLE users ALTER COLUMN user_id TYPE BIGINT;
                        END IF;
                    END $$;
                    """,
                    """
                    DO $$ BEGIN
                        IF EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_name='messages' AND column_name='message_id'
                              AND data_type='integer') THEN
                            ALTER TABLE messages ALTER COLUMN message_id TYPE BIGINT;
                        END IF;
                    END $$;
                    """,
                    # Add creator_id to users (nullable FK — legacy rows stay NULL until reassigned)
                    """
                    DO $$ BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='creator_id') THEN
                            ALTER TABLE users ADD COLUMN creator_id UUID
                                REFERENCES creators(id) ON DELETE SET NULL;
                            CREATE INDEX IF NOT EXISTS idx_user_creator ON users(creator_id);
                        END IF;
                    END $$;
                    """,
                    # Drop old global unique on users.user_id (replaced by composite unique)
                    """
                    DO $$ BEGIN
                        IF EXISTS (SELECT 1 FROM pg_constraint
                            WHERE conname='users_user_id_key') THEN
                            ALTER TABLE users DROP CONSTRAINT users_user_id_key;
                        END IF;
                    END $$;
                    """,
                    # Add composite unique (user_id, creator_id) if not exists
                    """
                    DO $$ BEGIN
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint
                            WHERE conname='uq_user_creator') THEN
                            ALTER TABLE users
                                ADD CONSTRAINT uq_user_creator
                                UNIQUE (user_id, creator_id);
                        END IF;
                    END $$;
                    """,
                ]:
                    await conn.execute(text(migration_sql))

            # ── Seed default creator + assign existing users ────────────────
            await self._ensure_default_creator()

            self._initialized = True
            logger.info("Database initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise

    async def _ensure_default_creator(self) -> None:
        """
        Create a 'Default' creator on first run and assign all existing users to it.
        Idempotent — safe to call on every startup.
        """
        try:
            from app.db.models import Creator, User
            async with self.session_maker() as session:
                from sqlalchemy import select as sa_select
                # Check if any creators exist
                res = await session.execute(sa_select(Creator).where(Creator.is_default == True))
                default = res.scalars().first()

                if not default:
                    import uuid as _uuid
                    default = Creator(
                        id=_uuid.uuid4(),
                        name="Default",
                        display_name="Default Creator",
                        color="#0a84ff",
                        emoji="🤖",
                        is_default=True,
                        is_active=True,
                    )
                    session.add(default)
                    await session.flush()
                    logger.info(f"Created default creator id={default.id}")

                # Assign all users without a creator_id to the default creator
                from sqlalchemy import update as sa_update
                await session.execute(
                    sa_update(User)
                    .where(User.creator_id == None)
                    .values(creator_id=default.id)
                )
                await session.commit()
                logger.info("Default creator ensured; orphaned users assigned.")
        except Exception as e:
            logger.warning(f"_ensure_default_creator: {e}")

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
