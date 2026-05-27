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


async def _sync_one_entity(client, entity, limit_per_chat: int, folder_name: str | None = None):
    """Sync a single user entity into the DB. Returns (is_new_user, new_msg_count)."""
    from sqlalchemy import select, and_, func as sqlfunc
    from app.db.models import User, Message
    tg_id = entity.id
    new_msgs = 0
    try:
        async with db_manager.get_session() as session:
            res = await session.execute(select(User).where(User.user_id == tg_id))
            user = res.scalars().first()
            is_new = not user
            if not user:
                user = User(
                    user_id=tg_id,
                    first_name=getattr(entity, "first_name", None) or "Unknown",
                    last_name=getattr(entity, "last_name", None),
                    username=getattr(entity, "username", None),
                    is_bot=getattr(entity, "bot", False),
                    extra_data={},
                )
                session.add(user)
                await session.flush()

            # Tag with folder name if provided
            if folder_name:
                ed = dict(user.extra_data or {})
                folders = ed.get("tg_folders", [])
                if folder_name not in folders:
                    folders.append(folder_name)
                    ed["tg_folders"] = folders
                    user.extra_data = ed

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
                    if "Photo" in n:     mt = "photo"
                    elif "Document" in n: mt = "document"
                    elif "Video" in n:   mt = "video"
                    elif "Audio" in n:   mt = "audio"
                    else:               mt = n.lower()
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
                new_msgs += 1

            cnt = await session.execute(
                sqlfunc.count(Message.id).select().where(Message.user_id == user.id)
            )
            # fallback count
            cnt2 = await session.execute(
                select(sqlfunc.count(Message.id)).where(Message.user_id == user.id)
            )
            user.total_messages = cnt2.scalar() or 0
            await session.commit()
        return is_new, new_msgs
    except Exception as e:
        logger.error(f"Sync error for tg_id={tg_id}: {e}")
        return False, 0


async def _do_sync(client, limit_per_chat: int = 100, max_dialogs: int = 0):
    """
    Pull ALL Telegram dialogs into DB.
    Iterates BOTH main folder (0) AND archived folder (1).
    max_dialogs=0 means unlimited.
    """
    synced_users = 0
    synced_messages = 0
    seen_ids: set = set()

    async def _iter_folder(folder_id: int):
        nonlocal synced_users, synced_messages
        count = 0
        try:
            # limit=None → no cap; folder param selects main(0) or archived(1)
            async for dialog in client.iter_dialogs(limit=None, folder=folder_id):
                if not dialog.is_user:
                    continue
                entity = dialog.entity
                tg_id = entity.id
                if tg_id in seen_ids:
                    continue
                seen_ids.add(tg_id)
                if max_dialogs and count >= max_dialogs:
                    logger.info(f"Hit max_dialogs={max_dialogs} in folder {folder_id}")
                    break
                count += 1
                is_new, nm = await _sync_one_entity(client, entity, limit_per_chat)
                if is_new:
                    synced_users += 1
                synced_messages += nm
        except Exception as e:
            logger.error(f"iter_dialogs folder={folder_id} failed: {e}", exc_info=True)

    logger.info("Syncing main folder (0)…")
    await _iter_folder(0)
    logger.info(f"Main folder done — {len(seen_ids)} unique chats")

    logger.info("Syncing archived folder (1)…")
    await _iter_folder(1)
    logger.info(f"Archived folder done — {len(seen_ids)} total unique chats")

    logger.info(f"Full sync done: {synced_users} new users, {synced_messages} new messages")
    return synced_users, synced_messages, 0


async def _sync_telegram_folders(client):
    """
    Fetch Telegram custom folders (Käufer, Warm, etc.), tag matching users in DB,
    save folder list to Config. Returns list of folder names.
    """
    from sqlalchemy import select
    from app.db.models import User, Config
    folder_names = []
    try:
        from telethon.tl.functions.messages import GetDialogFiltersRequest
        filters = await client(GetDialogFiltersRequest())
        for f in filters:
            title = getattr(f, "title", None)
            if not title:
                continue
            folder_names.append(title)
            include_peers = getattr(f, "include_peers", []) or []
            for peer in include_peers:
                try:
                    entity = await client.get_entity(peer)
                    tg_id = getattr(entity, "id", None)
                    if not tg_id:
                        continue
                    async with db_manager.get_session() as session:
                        res = await session.execute(select(User).where(User.user_id == tg_id))
                        user = res.scalars().first()
                        if user:
                            ed = dict(user.extra_data or {})
                            folders = ed.get("tg_folders", [])
                            if title not in folders:
                                folders.append(title)
                                ed["tg_folders"] = folders
                                user.extra_data = ed
                                await session.commit()
                except Exception as pe:
                    logger.debug(f"Peer resolve failed in folder '{title}': {pe}")

        # Persist folder list so frontend can load it
        async with db_manager.get_session() as session:
            res = await session.execute(select(Config).where(Config.key == "tg_folders"))
            cfg = res.scalars().first()
            if not cfg:
                cfg = Config(key="tg_folders", value=folder_names)
                session.add(cfg)
            else:
                cfg.value = folder_names
            await session.commit()

        logger.info(f"Folder sync done: {folder_names}")
    except Exception as e:
        logger.error(f"Folder sync failed: {e}", exc_info=True)
    return folder_names


async def _startup_sync():
    """Run after startup — wait for Telegram to fully settle, then sync ALL dialogs + folders."""
    await asyncio.sleep(12)
    from app.services.telegram.client import telegram_client
    if telegram_client.is_connected:
        logger.info("Auto-syncing ALL existing Telegram chats on startup…")
        await _do_sync(telegram_client.client, limit_per_chat=150)
        logger.info("Auto-syncing Telegram folders…")
        await _sync_telegram_folders(telegram_client.client)
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
            asyncio.create_task(message_processor.start_processor())
            asyncio.create_task(_startup_sync())
        else:
            logger.warning("Telegram NOT connected — session may be expired.")
    except Exception as e:
        logger.warning(f"Telegram init failed: {e}")

    yield

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
