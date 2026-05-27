import logging
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import db_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _do_sync(client, limit_per_chat: int = 100, max_dialogs: int = 300):
    """Pull all existing Telegram dialogs into the DB. Safe to call repeatedly."""
    from sqlalchemy import select, and_, func as sqlfunc
    from app.db.models import User, Message
    from datetime import datetime

    synced_users = 0
    synced_messages = 0
    errors = 0

    try:
        async for dialog in client.iter_dialogs(limit=max_dialogs):
            if not dialog.is_user:
                continue
            entity = dialog.entity
            tg_id = entity.id
            try:
                async with db_manager.get_session() as session:
                    res = await session.execute(select(User).where(User.user_id == tg_id))
                    user = res.scalars().first()
                    if not user:
                        user = User(
                            user_id=tg_id,
                            first_name=getattr(entity, "first_name", None) or "Unknown",
                            last_name=getattr(entity, "last_name", None),
                            username=getattr(entity, "username", None),
                            is_bot=getattr(entity, "bot", False),
                        )
                        session.add(user)
                        await session.flush()
                        synced_users += 1

                    async for tg_msg in client.iter_messages(entity, limit=limit_per_chat):
                        if not tg_msg.message and not tg_msg.media:
                            continue
                        dup = await session.execute(
                            select(Message).where(
                                and_(Message.user_id == user.id, Message.message_id == tg_msg.id)
                            )
                        )
                        if dup.scalars().first():
                            continue

                        mt = None
                        if tg_msg.media:
                            n = type(tg_msg.media).__name__
                            if "Photo" in n: mt = "photo"
                            elif "Document" in n: mt = "document"
                            elif "Video" in n: mt = "video"
                            elif "Audio" in n: mt = "audio"
                            else: mt = n.lower()

                        msg = Message(
                            message_id=tg_msg.id,
                            user_id=user.id,
                            text=tg_msg.message or None,
                            direction="outgoing" if tg_msg.out else "incoming",
                            has_media=tg_msg.media is not None,
                            media_type=mt,
                            is_ai_generated=False,
                            extra_data={},
                            created_at=tg_msg.date.replace(tzinfo=None) if tg_msg.date else datetime.utcnow(),
                        )
                        session.add(msg)
                        synced_messages += 1

                    cnt = await session.execute(
                        select(sqlfunc.count(Message.id)).where(Message.user_id == user.id)
                    )
                    user.total_messages = cnt.scalar() or 0
                    await session.commit()
            except Exception as e:
                logger.error(f"Sync error for dialog {tg_id}: {e}")
                errors += 1
    except Exception as e:
        logger.error(f"iter_dialogs failed: {e}", exc_info=True)

    logger.info(f"Sync done: {synced_users} new users, {synced_messages} new messages, {errors} errors")
    return synced_users, synced_messages, errors


async def _startup_sync():
    """Run after startup — wait for Telegram to fully settle, then sync."""
    await asyncio.sleep(12)
    from app.services.telegram.client import telegram_client
    if telegram_client.is_connected:
        logger.info("Auto-syncing existing Telegram chats on startup…")
        await _do_sync(telegram_client.client)
    else:
        logger.warning("Startup sync skipped — Telegram not connected")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.APP_NAME}")

    # Database
    try:
        await db_manager.initialize()
        await db_manager.create_tables()
        logger.info("Database ready")
    except Exception as e:
        logger.error(f"Database init failed: {e}")

    # Telegram
    try:
        from app.services.telegram.client import telegram_client
        from app.services.telegram.message_handler import message_processor

        # Wire new-message events → processor BEFORE connecting
        telegram_client.on("message_new", message_processor.process_incoming_message)

        connected = await telegram_client.connect()
        if connected:
            logger.info("Telegram connected ✓")
            # Start embedding background processor
            asyncio.create_task(message_processor.start_processor())
            # Auto-sync existing chats in background
            asyncio.create_task(_startup_sync())
        else:
            logger.warning("Telegram NOT connected — session may be expired. Re-run auth.")
    except Exception as e:
        logger.warning(f"Telegram init failed: {e}")

    yield

    # Shutdown
    try:
        from app.services.telegram.client import telegram_client
        await telegram_client.disconnect()
    except Exception:
        pass
    try:
        await db_manager.close()
    except Exception:
        pass
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

_cors = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    from app.services.telegram.client import telegram_client
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "telegram_connected": bool(telegram_client.is_connected),
        "timestamp": str(datetime.utcnow()),
    }


from app.api.v1 import api_router
app.include_router(api_router, prefix=settings.API_V1_STR)
