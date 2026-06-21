"""
app/services/telegram/client.py
Telethon client wrapper — supports both the legacy single-client mode
(default creator via env vars) and the new CreatorClientPool (one client
per creator, connected via stored session string).
"""

import logging
import asyncio
from typing import Optional, Callable, Any, Dict, Tuple
from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError, AuthKeyUnregisteredError, AuthKeyDuplicatedError
from telethon.network import ConnectionTcpAbridged
from telethon.sessions import StringSession
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Low-level client wrapper (used both standalone and inside the pool)
# ─────────────────────────────────────────────────────────────────────────────

class TelegramClientManager:
    """
    Manages one Telegram userbot connection.
    Can be initialised from env-var settings (legacy) or explicit credentials.
    """

    def __init__(self):
        self.client: Optional[TelegramClient] = None
        self._is_connected = False
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5
        self._reconnect_delay = 5
        self._connect_lock = asyncio.Lock()   # prevents concurrent connect() calls racing each other

        self._handlers: dict[str, list[Callable]] = {
            "message_new": [],
            "message_edit": [],
            "connection_lost": [],
            "connection_restored": [],
        }

    # ── Public connect API ────────────────────────────────────────────────

    async def connect(self, _retry: int = 0) -> bool:
        """Connect using env-var credentials (default creator / legacy mode).

        If another connect() is already in progress (e.g. startup vs frontend
        auto-reconnect racing) we wait for it to finish and return its result —
        rather than starting a second concurrent session which would cause
        AuthKeyDuplicatedError.
        """
        # --- concurrency guard ---
        if _retry == 0 and self._connect_lock.locked():
            logger.info("connect() already in progress — waiting for it to finish…")
            async with self._connect_lock:
                pass  # just wait; the other caller set _is_connected
            return self._is_connected

        async with self._connect_lock:
            return await self._connect_inner(_retry=_retry)

    async def _connect_inner(self, _retry: int = 0) -> bool:
        """Actual connect logic — always called with _connect_lock held."""
        self._last_error: str = ""
        # Fix 6: disconnect existing client before creating a new one to prevent ghost clients
        if self.client:
            try:
                await self.client.disconnect()
            except Exception:
                pass
            self.client = None
        self._is_connected = False
        try:
            if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
                self._last_error = "TELEGRAM_API_ID or TELEGRAM_API_HASH not set in Railway env vars"
                logger.error(self._last_error)
                return False

            if settings.TELEGRAM_SESSION_STRING:
                session = StringSession(settings.TELEGRAM_SESSION_STRING)
                logger.info("Using StringSession for Telegram auth")
            else:
                session = str(Path(settings.TELEGRAM_SESSION_PATH) / settings.TELEGRAM_SESSION_NAME)
                logger.info("Using file session for Telegram auth")

            self.client = TelegramClient(
                session=session,
                api_id=settings.TELEGRAM_API_ID,
                api_hash=settings.TELEGRAM_API_HASH,
                connection=ConnectionTcpAbridged,
                auto_reconnect=True,
                connection_retries=settings.TELEGRAM_REQUEST_RETRIES,
                retry_delay=1,
                request_retries=settings.TELEGRAM_REQUEST_RETRIES,
            )

            if settings.TELEGRAM_SESSION_STRING:
                await self.client.connect()
                # Verify session is actually authorized
                if not await self.client.is_user_authorized():
                    self._last_error = "Session string is not authorized — generate a new TELEGRAM_SESSION_STRING"
                    logger.error(self._last_error)
                    await self.client.disconnect()
                    return False
            else:
                await self.client.start(
                    phone=settings.TELEGRAM_PHONE,
                    code_callback=self._code_callback,
                    password=self._password_callback,
                )

            me = await self.client.get_me()
            logger.info(f"Connected to Telegram as {me.first_name} (@{me.username})")
            self._register_event_handlers()
            self._is_connected = True
            self._reconnect_attempts = 0
            return True

        except SessionPasswordNeededError:
            self._last_error = "2FA required — add TELEGRAM_2FA_PASSWORD to Railway env vars"
            logger.error(self._last_error)
            return False
        except AuthKeyUnregisteredError:
            self._last_error = "Session key invalid or expired — generate a new TELEGRAM_SESSION_STRING"
            logger.error(self._last_error)
            return False
        except AuthKeyDuplicatedError:
            # Railway rolling deploy: old instance still holds the session.
            # Retry up to 2 times, waiting 45 s each time — Railway can take
            # 30-60 s for the old instance to fully exit.
            if _retry >= 2:
                self._last_error = "AuthKeyDuplicatedError — retry limit reached. Session held by another process."
                logger.error(self._last_error)
                return False
            wait = 45
            logger.warning(f"AuthKeyDuplicatedError — old instance still connected. Retrying in {wait} s… (attempt {_retry + 1}/2)")
            self._last_error = f"AuthKeyDuplicated — retrying in {wait} s"
            if self.client:
                try:
                    await self.client.disconnect()
                except Exception:
                    pass
                self.client = None
            await asyncio.sleep(wait)
            logger.info("Retrying Telegram connect after AuthKeyDuplicatedError…")
            return await self._connect_inner(_retry=_retry + 1)  # lock already held
        except Exception as e:
            self._last_error = str(e)
            logger.error(f"Failed to connect to Telegram: {e}", exc_info=True)
            return False

    async def connect_with_session(
        self,
        session_string: str,
        api_id: int,
        api_hash: str,
        creator_id: str,
    ) -> Tuple[bool, dict]:
        """
        Connect using an explicit session string + credentials.
        Returns (success, account_info_dict).
        Used by CreatorClientPool for non-default creators.
        """
        try:
            session = StringSession(session_string)
            self.client = TelegramClient(
                session=session,
                api_id=api_id,
                api_hash=api_hash,
                connection=ConnectionTcpAbridged,
                auto_reconnect=True,
                connection_retries=3,
                retry_delay=1,
                request_retries=3,
            )
            await self.client.connect()

            if not await self.client.is_user_authorized():
                logger.error(f"Creator {creator_id}: session not authorized")
                await self.client.disconnect()
                return False, {}

            me = await self.client.get_me()
            name = f"{getattr(me, 'first_name', '') or ''} {getattr(me, 'last_name', '') or ''}".strip()
            account = {
                "name": name or getattr(me, "username", ""),
                "username": getattr(me, "username", None),
                "phone": getattr(me, "phone", None),
            }
            logger.info(f"Creator {creator_id}: connected as {account['name']} (@{account['username']})")

            # Register per-creator message handler
            self._register_creator_handlers(creator_id)
            self._is_connected = True
            self._reconnect_attempts = 0
            return True, account

        except Exception as e:
            logger.error(f"Creator {creator_id}: connect_with_session failed: {e}")
            return False, {}

    async def disconnect(self) -> None:
        if self.client:
            await self.client.disconnect()
            self._is_connected = False
            logger.info("Disconnected from Telegram")

    async def ensure_connected(self) -> bool:
        if self._is_connected and self.client and self.client.is_connected():
            return True
        logger.warning("Connection lost, attempting to reconnect…")
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            logger.error("Max reconnection attempts reached")
            return False
        self._reconnect_attempts += 1
        await asyncio.sleep(self._reconnect_delay)
        success = await self.connect()
        if success:
            await self._emit_event("connection_restored", {})
        else:
            await self._emit_event("connection_lost", {})
        return success

    # ── Messaging helpers ────────────────────────────────────────────────

    async def send_message(self, user_id: int, text: str, reply_to: Optional[int] = None, buttons=None) -> Optional[int]:
        if not await self.ensure_connected():
            return None
        try:
            kwargs: Dict[str, Any] = {}
            if reply_to is not None:
                kwargs["reply_to"] = reply_to
            if buttons is not None:
                kwargs["buttons"] = buttons
            message = await self.client.send_message(entity=user_id, message=text, **kwargs)
            return message.id
        except Exception as e:
            logger.error(f"Failed to send message to {user_id} (buttons={'yes' if buttons else 'no'}): {e}")
            return None

    async def send_file(self, user_id: int, file_bytes, caption: str = "", file_name: str = "file") -> Optional[int]:
        if not await self.ensure_connected():
            return None
        try:
            import io
            bio = io.BytesIO(file_bytes)
            bio.name = file_name
            message = await self.client.send_file(entity=user_id, file=bio, caption=caption)
            return message.id
        except Exception as e:
            logger.error(f"Failed to send file to {user_id}: {e}")
            return None

    async def action(self, user_id: int):
        """Return a typing action context manager."""
        if self.client:
            return self.client.action(user_id, "typing")
        return None

    async def edit_message(self, user_id: int, message_id: int, text: str) -> bool:
        if not await self.ensure_connected():
            return False
        try:
            await self.client.edit_message(entity=user_id, message=message_id, text=text)
            return True
        except Exception as e:
            logger.error(f"Failed to edit message: {e}")
            return False

    async def get_user(self, user_id: int) -> Optional[Any]:
        if not await self.ensure_connected():
            return None
        try:
            return await self.client.get_entity(user_id)
        except Exception as e:
            logger.error(f"Failed to get user {user_id}: {e}")
            return None

    async def get_chat_history(self, user_id: int, limit: int = 100) -> list[Any]:
        if not await self.ensure_connected():
            return []
        try:
            messages = []
            async for message in self.client.iter_messages(user_id, limit=limit):
                messages.append(message)
            return messages
        except Exception as e:
            logger.error(f"Failed to get chat history: {e}")
            return []

    # ── Event system ────────────────────────────────────────────────────

    def on(self, event_name: str, handler: Callable) -> None:
        if event_name not in self._handlers:
            raise ValueError(f"Unknown event type: {event_name}")
        self._handlers[event_name].append(handler)

    def off(self, event_name: str, handler: Callable) -> None:
        if event_name in self._handlers:
            self._handlers[event_name].remove(handler)

    async def _emit_event(self, event_name: str, data: dict) -> None:
        if event_name not in self._handlers:
            return
        tasks = [handler(data) for handler in self._handlers[event_name]]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def _register_event_handlers(self) -> None:
        """Register handlers for the legacy single-client (default creator)."""
        if not self.client:
            return

        @self.client.on(events.NewMessage(incoming=True))
        async def handle_new_message(event):
            try:
                # Cache the sender entity so we can reply later (fixes "Could not find entity")
                try:
                    await event.get_input_sender()
                except Exception:
                    pass
                await self._emit_event("message_new", {
                    "event": event,
                    "message": event.message,
                    "sender_id": event.sender_id,
                })
            except Exception as e:
                logger.error(f"Error handling new message: {e}")

        @self.client.on(events.MessageEdited())
        async def handle_message_edited(event):
            try:
                await self._emit_event("message_edit", {
                    "event": event,
                    "message": event.message,
                    "sender_id": event.sender_id,
                })
            except Exception as e:
                logger.error(f"Error handling message edit: {e}")

        logger.info("Event handlers registered (legacy default client)")

    def _register_creator_handlers(self, creator_id: str) -> None:
        """Register per-creator handlers that tag messages with creator_id."""
        if not self.client:
            return

        @self.client.on(events.NewMessage(incoming=True))
        async def handle_new_message(event):
            try:
                from app.services.telegram.message_handler import message_processor
                await message_processor.process_incoming_message({
                    "event": event,
                    "message": event.message,
                    "sender_id": event.sender_id,
                    "creator_id": creator_id,
                })
            except Exception as e:
                logger.error(f"Creator {creator_id}: error handling new message: {e}")

        logger.info(f"Event handlers registered for creator {creator_id}")

    # ── Private helpers ──────────────────────────────────────────────────

    async def _code_callback(self) -> str:
        return input("Enter Telegram code: ")

    async def _password_callback(self) -> str:
        return input("Enter Telegram password: ")

    @property
    def is_connected(self) -> bool:
        return self._is_connected and self.client is not None and self.client.is_connected()


# ─────────────────────────────────────────────────────────────────────────────
# Multi-creator pool — one Telethon client per creator
# ─────────────────────────────────────────────────────────────────────────────

class CreatorClientPool:
    """
    Manages a pool of Telethon clients, keyed by creator_id (str UUID).
    The default creator's client is kept as a separate singleton (`telegram_client`)
    for backward compatibility; non-default creators live here.
    """

    def __init__(self):
        self._clients: Dict[str, TelegramClientManager] = {}
        self._accounts: Dict[str, dict] = {}   # creator_id -> {name, username, phone}

    async def connect_creator(
        self,
        creator_id: str,
        session_string: str,
        api_id: int,
        api_hash: str,
    ) -> Tuple[bool, dict]:
        """
        Connect (or reconnect) a creator's Telethon client.
        Returns (success, account_info).
        """
        # Disconnect existing client if any
        if creator_id in self._clients:
            try:
                await self._clients[creator_id].disconnect()
            except Exception:
                pass

        mgr = TelegramClientManager()
        success, account = await mgr.connect_with_session(session_string, api_id, api_hash, creator_id)
        if success:
            self._clients[creator_id] = mgr
            self._accounts[creator_id] = account
        return success, account

    async def disconnect_creator(self, creator_id: str) -> None:
        if creator_id in self._clients:
            try:
                await self._clients[creator_id].disconnect()
            except Exception:
                pass
            del self._clients[creator_id]
            self._accounts.pop(creator_id, None)
            logger.info(f"Creator {creator_id}: disconnected")

    def get_client(self, creator_id: str) -> Optional[TelegramClientManager]:
        return self._clients.get(creator_id)

    def get_account(self, creator_id: str) -> Optional[dict]:
        return self._accounts.get(creator_id)

    def is_connected(self, creator_id: str) -> bool:
        c = self._clients.get(creator_id)
        return c is not None and c.is_connected

    def all_connected(self) -> list:
        return [cid for cid, c in self._clients.items() if c.is_connected]

    async def startup_connect_all(self) -> None:
        """
        Called at app startup: load all NON-DEFAULT active creators that have
        a session string stored in the DB and connect them via the pool.
        The default creator is handled by the telegram_client singleton (env vars).
        NEVER connect a creator via the pool if telegram_client already uses the
        same session — that causes AuthKeyDuplicatedError.
        """
        try:
            from app.db.models import Creator
            from app.db.database import db_manager
            from sqlalchemy import select as sa_select

            async with db_manager.get_session() as session:
                res = await session.execute(
                    sa_select(Creator).where(
                        Creator.is_active == True,
                        Creator.is_default == False,
                        Creator.telegram_session.isnot(None),
                    )
                )
                creators = res.scalars().all()

            api_id  = int(settings.TELEGRAM_API_ID or 0)
            api_hash = settings.TELEGRAM_API_HASH or ""

            for c in creators:
                logger.info(f"Auto-connecting creator {c.id} ({c.name})…")
                ok, account = await self.connect_creator(
                    str(c.id), c.telegram_session, api_id, api_hash
                )
                if ok:
                    logger.info(f"Creator {c.id}: auto-connected as {account.get('name')}")
                else:
                    logger.warning(f"Creator {c.id}: auto-connect failed")
        except Exception as e:
            logger.warning(f"startup_connect_all: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Singletons
# ─────────────────────────────────────────────────────────────────────────────

# Legacy single-client for the default creator (reads from env vars)
telegram_client = TelegramClientManager()

# Multi-creator pool for non-default creators
creator_pool = CreatorClientPool()


__all__ = ["telegram_client", "TelegramClientManager", "creator_pool", "CreatorClientPool"]
