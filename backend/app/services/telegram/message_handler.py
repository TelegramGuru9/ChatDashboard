"""
app/services/telegram/message_handler.py
Processing pipeline for incoming Telegram messages + AI autopilot.
"""

import logging
import asyncio
import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.types import Message as TelegramMessage

from app.db.database import db_manager
from app.db.models import User, Message, Config
from app.core.config import settings

logger = logging.getLogger(__name__)


def _naive_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class MessageProcessor:
    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue()
        self._processor_running = False
        self._stats = {"processed": 0, "failed": 0, "ai_responses": 0}

    async def process_incoming_message(self, event_data: Dict[str, Any]) -> bool:
        try:
            telegram_message: TelegramMessage = event_data["message"]
            sender_id: int = event_data["sender_id"]

            if telegram_message.from_id is None:
                return False

            text = telegram_message.message or ""
            has_media = telegram_message.media is not None

            logger.info(f"Processing incoming message from {sender_id}")

            async with db_manager.get_session() as session:
                user = await self._get_or_create_user(session, sender_id)
                if not user:
                    return False

                message = await self._store_message(session, user.id, telegram_message, text, has_media)
                if not message:
                    return False

                # Update engagement
                user.total_messages = (user.total_messages or 0) + 1
                user.total_interactions = (user.total_interactions or 0) + 1
                user.last_message_at = _naive_utc()
                if not user.first_message_at:
                    user.first_message_at = _naive_utc()

                ai_enabled = bool(user.ai_enabled)
                user_id = user.id
                telegram_id = user.user_id
                await session.commit()

            # Fire AI response asynchronously (non-blocking)
            if ai_enabled and text:
                asyncio.create_task(
                    self._generate_and_send_ai_response(user_id, telegram_id, text)
                )

            self._stats["processed"] += 1
            return True

        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)
            self._stats["failed"] += 1
            return False

    async def _get_or_create_user(self, session: AsyncSession, telegram_user_id: int) -> Optional[User]:
        try:
            result = await session.execute(select(User).where(User.user_id == telegram_user_id))
            user = result.scalars().first()
            if user:
                return user

            from app.services.telegram.client import telegram_client
            tg_user = await telegram_client.get_user(telegram_user_id)

            user = User(
                user_id=telegram_user_id,
                first_name=(getattr(tg_user, "first_name", None) or "Unknown") if tg_user else "Unknown",
                last_name=getattr(tg_user, "last_name", None) if tg_user else None,
                username=getattr(tg_user, "username", None) if tg_user else None,
                is_bot=getattr(tg_user, "bot", False) if tg_user else False,
            )
            session.add(user)
            await session.flush()
            logger.info(f"Created new user {user.id} for Telegram {telegram_user_id}")
            return user
        except Exception as e:
            logger.error(f"Error getting/creating user {telegram_user_id}: {e}")
            return None

    async def _store_message(
        self,
        session: AsyncSession,
        user_id: UUID,
        telegram_message: TelegramMessage,
        text: str,
        has_media: bool,
    ) -> Optional[Message]:
        try:
            result = await session.execute(
                select(Message).where(
                    (Message.user_id == user_id) &
                    (Message.message_id == telegram_message.id)
                )
            )
            if result.scalars().first():
                return None

            # Always store timezone-naive datetimes
            created_at = _naive_utc()
            if telegram_message.date:
                try:
                    created_at = telegram_message.date.replace(tzinfo=None)
                except Exception:
                    pass

            media_type = None
            if telegram_message.media:
                n = type(telegram_message.media).__name__
                if "Photo" in n: media_type = "photo"
                elif "Document" in n: media_type = "document"
                elif "Video" in n: media_type = "video"
                elif "Audio" in n: media_type = "audio"
                else: media_type = n.lower()

            msg = Message(
                message_id=telegram_message.id,
                user_id=user_id,
                text=text or None,
                direction="incoming",
                has_media=has_media,
                media_type=media_type,
                is_ai_generated=False,
                extra_data={},
                created_at=created_at,
            )
            session.add(msg)
            await session.flush()
            return msg
        except Exception as e:
            logger.error(f"Error storing message: {e}")
            return None

    async def _generate_and_send_ai_response(
        self,
        user_id: UUID,
        telegram_id: int,
        incoming_text: str,
    ) -> None:
        """Generate Claude AI response and send it via Telegram."""
        try:
            from app.services.telegram.client import telegram_client
            from app.db.models import Config

            async with db_manager.get_session() as session:
                # Load persona config
                result = await session.execute(select(Config).where(Config.key == "persona"))
                cfg = result.scalars().first()
                persona_data = cfg.value if cfg else {}

                # Check global AI toggle
                if not persona_data.get("ai_enabled", True):
                    logger.debug("AI globally disabled — skipping response")
                    return

                system_prompt = persona_data.get("persona") or persona_data.get("system_prompt") or \
                    "You are a friendly and helpful assistant. Keep replies concise (2-3 sentences)."
                model = persona_data.get("model", settings.CLAUDE_MODEL)
                max_tokens = int(persona_data.get("max_tokens", 512))
                temperature = float(persona_data.get("temperature", 0.7))

                # Load recent conversation history
                hist_result = await session.execute(
                    select(Message)
                    .where(Message.user_id == user_id)
                    .order_by(Message.created_at.desc())
                    .limit(30)
                )
                recent = list(reversed(hist_result.scalars().all()))

            # Build Claude message list
            claude_msgs: List[Dict[str, str]] = []
            for m in recent:
                if not m.text:
                    continue
                role = "user" if m.direction == "incoming" else "assistant"
                # Merge consecutive same-role messages
                if claude_msgs and claude_msgs[-1]["role"] == role:
                    claude_msgs[-1]["content"] += "\n" + m.text
                else:
                    claude_msgs.append({"role": role, "content": m.text})

            # Ensure last message is from user
            if not claude_msgs or claude_msgs[-1]["role"] != "user":
                claude_msgs.append({"role": "user", "content": incoming_text})

            # Call Claude (sync client wrapped in thread to avoid blocking)
            import anthropic
            client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

            def _call_claude():
                return client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    system=system_prompt,
                    messages=claude_msgs,
                )

            response = await asyncio.to_thread(_call_claude)
            ai_text = response.content[0].text.strip()

            if not ai_text:
                return

            logger.info(f"AI response for {telegram_id}: {ai_text[:80]}…")

            # Send via Telegram
            tg_msg_id = await telegram_client.send_message(telegram_id, ai_text)
            if tg_msg_id is None:
                logger.error(f"Failed to deliver AI message to {telegram_id}")
                return

            # Store in DB
            async with db_manager.get_session() as session:
                ai_msg = Message(
                    message_id=tg_msg_id,
                    user_id=user_id,
                    text=ai_text,
                    direction="outgoing",
                    has_media=False,
                    is_ai_generated=True,
                    extra_data={"model": model},
                    created_at=_naive_utc(),
                )
                session.add(ai_msg)
                await session.commit()

            self._stats["ai_responses"] += 1

        except Exception as e:
            logger.error(f"Error generating AI response for {telegram_id}: {e}", exc_info=True)

    # ── Background embedding queue ──

    async def start_processor(self) -> None:
        if self._processor_running:
            return
        self._processor_running = True
        logger.info("Message processor started")
        try:
            await self._process_queue()
        except asyncio.CancelledError:
            logger.info("Message processor stopped")
        finally:
            self._processor_running = False

    async def _process_queue(self) -> None:
        while self._processor_running:
            try:
                await asyncio.wait_for(self.queue.get(), timeout=30)
                # embedding generation omitted for now — pgvector optional
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Queue processing error: {e}")
                await asyncio.sleep(5)


message_processor = MessageProcessor()
__all__ = ["message_processor", "MessageProcessor"]
