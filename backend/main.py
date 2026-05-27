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


async def _sync_one_entity(client, entity, limit_per_chat: int):
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
                    if "Photo" in n:      mt = "photo"
                    elif "Document" in n: mt = "document"
                    elif "Video" in n:    mt = "video"
                    elif "Audio" in n:    mt = "audio"
                    else:                mt = n.lower()
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

            cnt2 = await session.execute(
                select(sqlfunc.count(Message.id)).where(Message.user_id == user.id)
            )
            user.total_messages = cnt2.scalar() or 0
            await session.commit()
        return is_new, new_msgs
    except Exception as e:
        logger.error(f"Sync error for tg_id={tg_id}: {e}")
        return False, 0


async def _get_all_dialogs_raw(client, folder_id: int = 0):
    """
    Use GetDialogsRequest directly with manual pagination.
    This is MORE reliable than iter_dialogs which can stall at ~100.
    Returns list of (entity, peer) for all user dialogs in folder.
    folder_id: 0 = main/inbox, 1 = archived
    """
    from telethon.tl.functions.messages import GetDialogsRequest
    from telethon.tl.types import InputPeerEmpty, User as TLUser

    all_entities = []
    seen = set()
    offset_date = 0
    offset_id = 0
    offset_peer = InputPeerEmpty()
    PAGE = 100

    while True:
        try:
            result = await client(GetDialogsRequest(
                offset_date=offset_date,
                offset_id=offset_id,
                offset_peer=offset_peer,
                limit=PAGE,
                hash=0,
                folder_id=folder_id,
            ))
        except Exception as e:
            logger.error(f"GetDialogsRequest folder={folder_id} failed: {e}")
            break

        if not result.dialogs:
            logger.info(f"No more dialogs in folder={folder_id} after {len(all_entities)} entities")
            break

        # Build entity map from the response
        entity_map = {}
        for u in getattr(result, "users", []):
            entity_map[u.id] = u
        for c in getattr(result, "chats", []):
            entity_map[c.id] = c

        added_this_page = 0
        for dialog in result.dialogs:
            peer = dialog.peer
            peer_id = getattr(peer, "user_id", None) or getattr(peer, "chat_id", None) or getattr(peer, "channel_id", None)
            if peer_id is None or peer_id in seen:
                continue
            entity = entity_map.get(peer_id)
            if entity is None:
                continue
            # Only private user chats
            if not isinstance(entity, TLUser):
                continue
            seen.add(peer_id)
            all_entities.append(entity)
            added_this_page += 1

        logger.info(f"folder={folder_id}: fetched page, +{added_this_page} users, total={len(all_entities)}")

        # Set up next page offset using the last message
        if not result.messages:
            break

        last_msg = result.messages[-1]
        # offset_date MUST be a Unix timestamp integer (not a datetime object)
        raw_date = getattr(last_msg, "date", None)
        if raw_date and hasattr(raw_date, "timestamp"):
            offset_date = int(raw_date.timestamp())
        elif isinstance(raw_date, int):
            offset_date = raw_date
        else:
            offset_date = 0
        offset_id = getattr(last_msg, "id", 0)

        # offset_peer = peer of last dialog
        if result.dialogs:
            last_peer = result.dialogs[-1].peer
            pid = getattr(last_peer, "user_id", None) or getattr(last_peer, "chat_id", None) or getattr(last_peer, "channel_id", None)
            if pid and pid in entity_map:
                try:
                    offset_peer = await client.get_input_entity(entity_map[pid])
                except Exception:
                    offset_peer = InputPeerEmpty()

        # If we got fewer than PAGE results, we're at the end
        if len(result.dialogs) < PAGE:
            logger.info(f"folder={folder_id}: last page (got {len(result.dialogs)} < {PAGE}), done")
            break

    return all_entities


async def _do_sync(client, limit_per_chat: int = 100, max_dialogs: int = 0):
    """
    Pull ALL Telegram dialogs into DB using raw GetDialogsRequest pagination.
    Fetches both main folder (0) and archived folder (1).
    max_dialogs=0 means unlimited.
    """
    synced_users = 0
    synced_messages = 0
    seen_ids: set = set()

    for folder_id in (0, 1):
        label = "main" if folder_id == 0 else "archived"
        logger.info(f"Fetching all dialogs from {label} folder…")
        entities = await _get_all_dialogs_raw(client, folder_id)
        logger.info(f"{label} folder: {len(entities)} user dialogs found")

        for entity in entities:
            tg_id = entity.id
            if tg_id in seen_ids:
                continue
            seen_ids.add(tg_id)
            if max_dialogs and len(seen_ids) > max_dialogs:
                break
            is_new, nm = await _sync_one_entity(client, entity, limit_per_chat)
            if is_new:
                synced_users += 1
            synced_messages += nm

    logger.info(f"Full sync done: {len(seen_ids)} total chats, {synced_users} new users, {synced_messages} new messages")
    return synced_users, synced_messages, len(seen_ids)


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
                            folders_list = ed.get("tg_folders", [])
                            if title not in folders_list:
                                folders_list.append(title)
                                ed["tg_folders"] = folders_list
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


# ── Global SSE broadcast: new messages push to all connected clients ──
_sse_queues: list = []


def _broadcast_new_message(user_id: str, message: dict):
    """Push a new message event to all SSE subscribers."""
    dead = []
    for q in _sse_queues:
        try:
            q.put_nowait({"user_id": user_id, "message": message})
        except Exception:
            dead.append(q)
    for q in dead:
        try:
            _sse_queues.remove(q)
        except ValueError:
            pass


async def _startup_sync():
    """Run after startup — wait for Telegram to fully settle, then sync ALL dialogs + folders."""
    await asyncio.sleep(10)
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

    try:
        await db_manager.initialize()
        await db_manager.create_tables()
        logger.info("Database ready")
    except Exception as e:
        logger.error(f"Database init failed: {e}")

    try:
        from app.services.telegram.client import telegram_client
        from app.services.telegram.message_handler import message_processor

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
