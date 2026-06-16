import logging
import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.db.database import db_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _sync_one_entity(client, entity, limit_per_chat: int, creator_id=None):
    """Sync a single user entity into the DB. Returns (is_new_user, new_msg_count).
    creator_id: UUID string — when set, users are stored scoped to that creator.
    """
    import uuid as _uuid
    from sqlalchemy import select, and_, func as sqlfunc
    from app.db.models import User, Message
    tg_id = entity.id
    new_msgs = 0
    creator_uuid = None
    if creator_id:
        try:
            creator_uuid = _uuid.UUID(str(creator_id))
        except Exception:
            pass
    try:
        async with db_manager.get_session() as session:
            # Look up by (tg_id, creator_id) so each creator has their own user rows
            q = select(User).where(User.user_id == tg_id)
            if creator_uuid is not None:
                q = q.where(User.creator_id == creator_uuid)
            else:
                q = q.where(User.creator_id.is_(None))
            res = await session.execute(q)
            user = res.scalars().first()
            is_new = not user
            if not user:
                user = User(
                    user_id=tg_id,
                    creator_id=creator_uuid,
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


async def _do_sync(client, limit_per_chat: int = 100, max_dialogs: int = 0, creator_id=None):
    """
    Pull ALL Telegram dialogs into DB using raw GetDialogsRequest pagination.
    Fetches both main folder (0) and archived folder (1).
    max_dialogs=0 means unlimited.
    creator_id: when set, users are stored scoped to that creator.
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
            is_new, nm = await _sync_one_entity(client, entity, limit_per_chat, creator_id=creator_id)
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


async def _seed_nika_persona():
    """
    Seed a clean Nika White persona config if none exists yet.
    Uses only identity/personality/style fields — no explicit content.
    The user can override this any time via Settings → Persona.
    """
    from app.db.models import Config
    from sqlalchemy import select

    PERSONA = {
        # ── Identity ──────────────────────────────────────────────────────────
        "identity": {
            "name": "Nika White",
            "age": 28,
            "nationality": "German",
            "location": "Cologne, Germany",
            "relationship_status": "single",
        },
        "persona_summary": (
            "Nika White is a 28-year-old German creator from Cologne, Germany. "
            "She is single, playful and flirty. She has a warm but bratty energy and likes "
            "keeping people curious instead of giving everything away immediately."
        ),
        "interests": [
            "fitness", "weight training", "cars", "tuning culture",
            "music", "lifestyle content", "exclusive creator content",
        ],
        "appearance": {
            "style": "sporty, feminine and seductive",
            "height": "168 cm",
            "body_type": "athletic and slim-curvy",
            "hair_color": "dark brown",
            "eye_color": "brown",
            "skin_tone": "light warm-toned skin",
            "features": ["tattoos", "belly button piercing", "clean gym-girl aesthetic"],
            "fashion_style": ["fitted", "sporty", "feminine", "confident"],
            "typical_outfits": ["gym sets", "cropped tops", "leggings", "sneakers", "minimal jewelry"],
        },
        "personality": {
            "traits": ["confident", "teasing", "playful", "sexually bold"],
            "private_side": "naughty",
            "likes": ["tension", "attention", "desire"],
            "boundaries": ["selective", "never cheap"],
        },
        # ── Bot behaviour ─────────────────────────────────────────────────────
        "bot_general_prompt": (
            "You are Nika White, a 28-year-old German content creator from Cologne. "
            "Be playful, warm, and slightly bratty. Keep people curious — never give everything away. "
            "Match the fan's energy: if they are casual, be casual; if they flirt, match it slowly. "
            "Never initiate explicit talk. Keep replies short and teasing. "
            "Your goal is to make the fan feel special and keep the conversation going."
        ),
        "bot_message_style": (
            "Always lowercase. Light emoji use — max 1 per message. No dashes. "
            "Short messages — 1 to 2 sentences by default. "
            "Be casual, natural, like texting a close friend who keeps you on your toes."
        ),
        "texting_habits": {
            "capitalization": "mostly lowercase in casual texting",
            "typical_message_length": "short, max 2 sentences by default",
            "typing_quirks": [
                "uses 'hmm', 'okay but', 'lol', 'idk'",
                "short and casual",
                "never uses dashes",
                "occasional tiny grammar slips to feel human",
            ],
            "signature_phrases": ["yesss baby", "haha okay but", "hmm"],
            "conversation_starters": ["heyy baby da bist du ja endlich 🥰", "heyy du was geht?"],
            "conversation_enders": [
                "bin müde… schreib mir morgen früh okayy?",
                "schlaf gut baby ich denk an dich ❤️",
                "gehe jetzt schlafen… bis morgen 😌",
            ],
            "emoji_usage": "light and selective",
        },
        "writing_style_questions": [
            {"question": "Hey wie gehts?",
             "answer": "Mmm besser jetzt wo du hier bist 😌 du kommst genau richtig"},
            {"question": "Was machst du gerade?",
             "answer": "Ich lieg gerade rum… nicht ganz brav angezogen. Und du so? :D"},
            {"question": "Bist du wirklich selbst im Chat?",
             "answer": "Jaa haha wieso sollte ich es nicht sein? Aber ich geb nicht jedem gleich viel Aufmerksamkeit"},
            {"question": "Woher kommst du eigentlich?",
             "answer": "Köln! und du?"},
            {"question": "Was trägst du gerade?",
             "answer": "wenig genug dass du neugierig werden würdest 😉"},
            {"question": "Gibt es Inhalte die man nur privat bekommt?",
             "answer": "jaa klar baby die besten Sachen landen nicht im Feed 😉"},
        ],
        # ── Runtime settings ──────────────────────────────────────────────────
        "enabled_languages": ["de", "en"],
        "model": "claude-haiku-4-5-20251001",
        "ai_enabled": True,
    }

    try:
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == "persona"))
            cfg = result.scalars().first()
            if cfg and cfg.value:
                logger.info("Persona already configured — skipping seed")
                return
            if cfg:
                cfg.value = PERSONA
            else:
                cfg = Config(key="persona", value=PERSONA, description="Nika White persona config")
                session.add(cfg)
            await session.commit()
        logger.info("✓ Seeded Nika persona config")
    except Exception as e:
        logger.error(f"Persona seeding failed: {e}")


async def _seed_default_packages():
    """Seed 4 blank packages with simplified {id, name, message, keywords} structure."""
    from app.db.models import Config
    from sqlalchemy import select

    DEFAULT_PACKAGES = [
        {"id": "pkg-1", "name": "Paket 1", "message": "", "keywords": "paket 1, p1"},
        {"id": "pkg-2", "name": "Paket 2", "message": "", "keywords": "paket 2, p2"},
        {"id": "pkg-3", "name": "Paket 3", "message": "", "keywords": "paket 3, p3"},
        {"id": "pkg-4", "name": "Paket 4", "message": "", "keywords": "paket 4, p4"},
    ]

    try:
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == "packages"))
            cfg = result.scalars().first()
            if cfg and cfg.value:
                existing = len(cfg.value) if isinstance(cfg.value, list) else 1
                logger.info(f"Packages already seeded ({existing} found) — skipping")
                return
            if cfg:
                cfg.value = DEFAULT_PACKAGES
            else:
                cfg = Config(key="packages", value=DEFAULT_PACKAGES, description="Content packages for sale")
                session.add(cfg)
            await session.commit()
        logger.info(f"✓ Seeded {len(DEFAULT_PACKAGES)} blank packages")
    except Exception as e:
        logger.error(f"Package seeding failed: {e}")


async def _seed_list_message():
    """Seed blank list_message config (auto-send overview message) if not present."""
    from app.db.models import Config
    from sqlalchemy import select

    DEFAULT_LIST_MSG = {
        "message": "",
        "keywords": "liste, pakete, was hast du, angebote, what do you have, offerings",
        "auto_send_at": 30,
        "active": True,
    }

    try:
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == "list_message"))
            cfg = result.scalars().first()
            if cfg and cfg.value:
                logger.info("list_message already seeded — skipping")
                return
            if cfg:
                cfg.value = DEFAULT_LIST_MSG
            else:
                cfg = Config(key="list_message", value=DEFAULT_LIST_MSG, description="Auto-send list message")
                session.add(cfg)
            await session.commit()
        logger.info("✓ Seeded blank list_message config")
    except Exception as e:
        logger.error(f"list_message seeding failed: {e}")


async def _seed_automessages():
    """Seed empty automessages config (array) if not yet present."""
    from app.db.models import Config
    from sqlalchemy import select
    try:
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == "automessages"))
            cfg = result.scalars().first()
            if cfg and cfg.value:
                logger.info("automessages already seeded — skipping")
                return
            if cfg:
                cfg.value = []
            else:
                cfg = Config(key="automessages", value=[], description="Automessage workflow triggers")
                session.add(cfg)
            await session.commit()
        logger.info("✓ Seeded blank automessages config")
    except Exception as e:
        logger.error(f"automessages seeding failed: {e}")


async def _check_inactive_users():
    """
    Background loop (every 6 h): send inactive_days automessages to users
    who have not sent a message in N days and haven't been re-triggered yet.
    """
    import datetime as dt
    from app.db.models import Config, User as DBUser
    from sqlalchemy import select

    await asyncio.sleep(60)  # wait for startup to fully settle
    logger.info("Inactive user checker started")

    while True:
        try:
            from app.services.telegram.client import telegram_client
            if not telegram_client.is_connected:
                await asyncio.sleep(3600)
                continue

            async with db_manager.get_session() as session:
                # Load inactive_days automessages (global key, first creator)
                am_res = await session.execute(
                    select(Config).where(Config.key == "automessages")
                )
                am_cfg = am_res.scalars().first()
                if not am_cfg or not isinstance(am_cfg.value, list):
                    await asyncio.sleep(6 * 3600)
                    continue

                inactive_ams = [
                    am for am in am_cfg.value
                    if am.get("trigger") == "inactive_days"
                    and am.get("active")
                    and str(am.get("message", "")).strip()
                ]
                if not inactive_ams:
                    await asyncio.sleep(6 * 3600)
                    continue

                for am in inactive_ams:
                    days     = int(am.get("inactive_days", 5) or 5)
                    msg_text = str(am.get("message", "")).strip()
                    cutoff   = dt.datetime.utcnow() - dt.timedelta(days=days)

                    users_res = await session.execute(
                        select(DBUser).where(DBUser.updated_at < cutoff).limit(100)
                    )
                    users = users_res.scalars().all()

                    for user in users:
                        extra = dict(user.extra_data or {})
                        # Skip if already re-triggered after last activity
                        last_sent_str = extra.get("inactive_trigger_sent_at")
                        if last_sent_str:
                            try:
                                last_sent_dt = dt.datetime.fromisoformat(
                                    last_sent_str.replace("Z", "")
                                )
                                if last_sent_dt > cutoff:
                                    continue
                            except Exception:
                                pass

                        try:
                            tg_id = int(user.telegram_id)
                            await telegram_client.client.send_message(tg_id, msg_text)
                            extra["inactive_trigger_sent_at"] = dt.datetime.utcnow().isoformat()
                            user.extra_data = extra
                            logger.info(
                                f"Inactive trigger sent → tg={tg_id} "
                                f"(inactive {days}d)"
                            )
                        except Exception as _se:
                            logger.warning(
                                f"Inactive trigger send failed tg={user.telegram_id}: {_se}"
                            )

                    await session.commit()

        except Exception as e:
            logger.error(f"Inactive user check error: {e}")

        await asyncio.sleep(6 * 3600)  # run every 6 hours


async def _generate_memory_for_user(user_id_str: str, messages: list, user_name: str) -> str:
    """
    Call Claude to produce a concise relationship memory for one user.
    Returns the summary text (stored in user.extra_data["ai_summary"]).
    """
    import anthropic
    from app.core.config import settings

    if not messages:
        return ""

    # Build a compact transcript (last 300 messages max)
    lines = []
    for m in messages[-300:]:
        direction = "Fan" if m.get("direction") == "incoming" else "Nika"
        text = (m.get("text") or "").strip()
        if text:
            lines.append(f"{direction}: {text}")
    transcript = "\n".join(lines)
    if not transcript:
        return ""

    prompt = f"""Du analysierst einen Telegram-Chat zwischen einer Creator (Nika) und einem Fan ({user_name}).

AUFGABE: Erstelle eine kompakte Gedächtnis-Zusammenfassung (Memory) für diesen Fan. Diese wird später dem KI-Assistenten übergeben, damit er den Kontext kennt.

FORMAT:
• Interessen & Vorlieben: [was interessiert den Fan]
• Kaufstatus: [hat gekauft / will kaufen / noch nicht interessiert]
• Persönlichkeit: [kurze Beschreibung des Kommunikationsstils]
• Wichtige Fakten: [Name, Beruf, Beziehungsstatus o.ä. falls erwähnt]
• Letzter Stand: [wo stehen die beiden gerade in der Konversation]
• Nächster Schritt: [was wäre sinnvoll als nächstes]

CHAT-VERLAUF:
{transcript}

Antworte NUR mit der Zusammenfassung, kein Präambel."""

    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip()
    except Exception as e:
        logger.error(f"Memory generation failed for {user_id_str}: {e}")
        return ""


async def _run_deep_memory_sync(creator_id: str | None = None):
    """
    For every user (optionally scoped to creator_id):
    1. Load all messages from DB
    2. Generate a Claude summary
    3. Store it in user.extra_data["ai_summary"]
    Returns (processed, skipped) counts.
    """
    from sqlalchemy import select
    from app.db.models import User, Message
    import uuid as _uuid

    processed = 0
    skipped = 0

    async with db_manager.get_session() as session:
        q = select(User).where((User.is_bot == False) | (User.is_bot == None))
        if creator_id:
            try:
                q = q.where(User.creator_id == _uuid.UUID(creator_id))
            except Exception:
                pass
        users = (await session.execute(q)).scalars().all()

    for user in users:
        try:
            async with db_manager.get_session() as session:
                msgs_res = await session.execute(
                    select(Message)
                    .where(Message.user_id == user.id)
                    .order_by(Message.created_at)
                )
                msgs = [
                    {"text": m.text, "direction": m.direction, "created_at": str(m.created_at)}
                    for m in msgs_res.scalars().all()
                    if m.text
                ]

            if not msgs:
                skipped += 1
                continue

            name = f"{user.first_name or ''} {user.last_name or ''}".strip() or f"User {user.user_id}"
            summary = await _generate_memory_for_user(str(user.id), msgs, name)

            if summary:
                async with db_manager.get_session() as session:
                    u = await session.get(User, user.id)
                    if u:
                        ed = dict(u.extra_data or {})
                        ed["ai_summary"] = summary
                        ed["ai_summary_updated_at"] = datetime.utcnow().isoformat()
                        u.extra_data = ed
                        await session.commit()
                processed += 1
                logger.info(f"[MemorySync] ✓ {name}")
            else:
                skipped += 1

        except Exception as e:
            logger.error(f"[MemorySync] Error for user {user.id}: {e}")
            skipped += 1

    logger.info(f"[MemorySync] Done — {processed} generated, {skipped} skipped")
    return processed, skipped


async def _daily_memory_loop():
    """
    Background loop: runs _run_deep_memory_sync every day at 00:00 CEST (22:00 UTC).
    """
    import datetime as dt

    await asyncio.sleep(90)  # wait for full startup
    logger.info("[DailyMemory] Scheduler started — fires daily at 22:00 UTC (00:00 CEST)")

    while True:
        try:
            now = dt.datetime.utcnow()
            # Next 22:00 UTC
            target = now.replace(hour=22, minute=0, second=0, microsecond=0)
            if now >= target:
                target += dt.timedelta(days=1)
            wait_secs = (target - now).total_seconds()
            logger.info(f"[DailyMemory] Next run in {wait_secs/3600:.1f}h at {target} UTC")
            await asyncio.sleep(wait_secs)

            logger.info("[DailyMemory] Starting nightly memory generation…")
            processed, skipped = await _run_deep_memory_sync()
            logger.info(f"[DailyMemory] Complete — {processed} memories generated, {skipped} skipped")

        except Exception as e:
            logger.error(f"[DailyMemory] Error: {e}", exc_info=True)
            await asyncio.sleep(3600)  # retry in 1h on error


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
        await _seed_nika_persona()
        await _seed_default_packages()
        await _seed_list_message()
        await _seed_automessages()
    except Exception as e:
        logger.error(f"Database init failed: {e}")

    try:
        from app.services.telegram.client import telegram_client, creator_pool
        from app.services.telegram.message_handler import message_processor

        # Default creator client — uses env-var session
        telegram_client.on("message_new", message_processor.process_incoming_message)
        connected = await telegram_client.connect()
        if connected:
            logger.info("Telegram connected ✓ (default creator)")
            asyncio.create_task(message_processor.start_processor())
            asyncio.create_task(_startup_sync())
            asyncio.create_task(_check_inactive_users())
            asyncio.create_task(_daily_memory_loop())
        else:
            logger.warning("Telegram NOT connected — session may be expired.")

        # Non-default creators — connect from stored session strings
        asyncio.create_task(creator_pool.startup_connect_all())
    except Exception as e:
        logger.warning(f"Telegram init failed: {e}")

    yield

    try:
        from app.services.telegram.client import telegram_client, creator_pool
        await telegram_client.disconnect()
        # Disconnect all creator pool clients
        for cid in list(creator_pool.all_connected()):
            try:
                await creator_pool.disconnect_creator(cid)
            except Exception:
                pass
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

# ── Static media file serving ──────────────────────────────────────────────
# Files uploaded via POST /api/v1/media/upload/file are served here.
# Set MEDIA_STORAGE_PATH env var to a persistent volume path in production.
_MEDIA_DIR = os.getenv("MEDIA_STORAGE_PATH", "/tmp/media")
os.makedirs(_MEDIA_DIR, exist_ok=True)
try:
    app.mount("/media/files", StaticFiles(directory=_MEDIA_DIR), name="media_files")
    logger.info(f"Media files served from {_MEDIA_DIR}")
except Exception as _e:
    logger.warning(f"Could not mount media static files: {_e}")
