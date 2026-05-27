"""
app/services/telegram/message_handler.py
Processing pipeline for incoming Telegram messages + AI autopilot.
"""

import logging
import asyncio
import re
import random
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


# ── Persona helpers ────────────────────────────────────────────────────────────

def _build_system_prompt(persona_data: dict) -> str:
    """
    Build the AI system prompt from the persona config JSON.
    Supports both legacy flat format (persona/system_prompt/prompt key)
    and the structured Nika JSON format (bot_general_prompt + texting_habits etc.).
    """

    # Legacy flat format — use as-is
    if persona_data.get("persona"):
        return str(persona_data["persona"])
    if persona_data.get("system_prompt"):
        return str(persona_data["system_prompt"])
    if persona_data.get("prompt"):
        return str(persona_data["prompt"])

    # Structured Nika JSON format
    if persona_data.get("bot_general_prompt"):
        p = persona_data.get("personal", {})
        name = p.get("name", "Nika")
        age = p.get("age", "28")
        languages = p.get("languages", ["German", "English"])
        lang_str = " and ".join(languages)

        personality = persona_data.get("personality", {})
        comm_style = personality.get("communication_style", "teasing, warm, casual")
        traits = [
            t for t in personality.get("traits", [])
            if not any(x in t.lower() for x in ["fuck", "dick", "hard", "wet", "cock", "sex"])
        ]
        traits_str = ", ".join(traits[:6]) if traits else "confident, flirty, playful, disciplined"

        texting = persona_data.get("texting_habits", {})
        msg_len = texting.get("typical_message_length", "short, max 2 sentences by default")
        quirks = [
            q for q in texting.get("typing_quirks", [])
            if "dash" not in q.lower() or "never" in q.lower()
        ]
        quirks_str = "; ".join(quirks) if quirks else "short and casual, uses 'hmm', 'okay but', 'lol'"

        general = persona_data.get("bot_general_prompt", "")
        style = persona_data.get("bot_message_style", "")

        # Writing examples — use the structured Q&A pairs (filter explicit content)
        _EXPLICIT = {"hose", "feucht", "geil", "fick", "pussy", "cock", "dick", "nackt", "nackig", "steckt"}
        examples = persona_data.get("writing_style_questions", [])
        ex_lines = []
        for ex in examples:
            if not isinstance(ex, dict):
                continue
            q = ex.get("question", "")
            a = ex.get("answer", "")
            if not q or not a:
                continue
            combined_lower = (q + a).lower()
            if any(w in combined_lower for w in _EXPLICIT):
                continue  # skip explicit examples
            ex_lines.append(f'Fan: "{q}"\nYou: "{a}"')
        examples_block = "\n\n".join(ex_lines[:6]) if ex_lines else ""

        sig_phrases = texting.get("signature_phrases", [])
        conv_enders = texting.get("conversation_enders", [])

        prompt = f"""You are {name}, {age} years old, a fitness and lifestyle content creator from near Saarbrücken, Germany.
You speak {lang_str}. Stay in character as {name} and respond as she would.

PERSONALITY:
Communication style: {comm_style}
Key traits: {traits_str}

BEHAVIOR:
{general}

WRITING STYLE (follow strictly):
{style}

CRITICAL FORMATTING RULES:
- Always write in lowercase
- NEVER use the "–" or "—" character. Replace pauses with "..." or a comma instead
- NEVER use " - " as a separator. Use a comma or rewrite the sentence
- Message length: {msg_len}
- Typing quirks: {quirks_str}
- Occasional emojis only when they feel natural: 😊 😈 😌 🔥 💦 🥰
- When writing German: always use "du", never "Sie"
- Never write long structured paragraphs or bullet points

EXAMPLE CONVERSATIONS (match this energy and style):
{examples_block}

SIGNATURE PHRASES: {", ".join(sig_phrases)}
CONVERSATION ENDERS: {" | ".join(conv_enders[:3])}
"""
        return prompt.strip()

    # Ultimate fallback
    return (
        "You are Nika, a friendly and flirty content creator. "
        "Reply casually in lowercase, keep it short (1-2 sentences), "
        "never use dashes. Match the user's language and energy."
    )


def _clean_response(text: str) -> str:
    """
    Post-process AI response to enforce no-dash rule and clean up formatting.
    Acts as a safety net in case Claude ignores the system prompt instruction.
    """
    # Em dash and en dash → ellipsis (feels more natural in casual texting)
    text = text.replace("—", "...")
    text = text.replace("–", "...")
    # Inline " - " used as a clause separator → comma (only when surrounded by spaces)
    text = re.sub(r'(?<=\w) - (?=\w)', ', ', text)
    # Clean up "..." chains longer than 3
    text = re.sub(r'\.{4,}', '...', text)
    # Collapse multiple spaces
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()


async def _human_typing_delay(response_text: str, persona_data: dict) -> None:
    """
    Simulate realistic human behaviour before sending:
      1. Read delay  — Nika "reads" the incoming message (3-10 s)
      2. Typing delay — time to physically type the response (~35-50 chars/sec)

    Shows the Telegram typing indicator for the full duration so the chat
    looks exactly like a real person is composing the message.
    """
    # Read delay — enforce realistic minimums regardless of JSON config
    cfg_min = float(persona_data.get("bot_reply_delay_min", 4))
    cfg_max = float(persona_data.get("bot_reply_delay_max", 12))
    read_min = max(cfg_min, 4.0)
    read_max = max(cfg_max, read_min + 5.0)
    read_delay = random.uniform(read_min, read_max)

    # Typing delay — chars / chars-per-second
    typing_speed = random.uniform(32.0, 52.0)   # chars per second
    typing_delay = len(response_text) / typing_speed

    total = min(read_delay + typing_delay, 60.0)
    logger.info(f"[human delay] {total:.1f}s  (read={read_delay:.1f}s + typing={typing_delay:.1f}s for {len(response_text)} chars)")
    await asyncio.sleep(total)


# ── Main processor ─────────────────────────────────────────────────────────────

class MessageProcessor:
    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue()
        self._processor_running = False
        self._stats = {"processed": 0, "failed": 0, "ai_responses": 0}

    async def process_incoming_message(self, event_data: Dict[str, Any]) -> bool:
        try:
            telegram_message: TelegramMessage = event_data["message"]
            sender_id: int = event_data["sender_id"]

            if not sender_id:
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

                user.total_messages = (user.total_messages or 0) + 1
                user.total_interactions = (user.total_interactions or 0) + 1
                user.last_message_at = _naive_utc()
                if not user.first_message_at:
                    user.first_message_at = _naive_utc()

                ai_enabled = bool(user.ai_enabled)
                user_id = user.id
                telegram_id = user.user_id
                await session.commit()

            # Broadcast to SSE stream (live inbox update)
            try:
                import main as _main
                _main._broadcast_new_message(str(user_id), {
                    "id": str(message.id),
                    "text": text,
                    "direction": "incoming",
                    "is_ai_generated": False,
                    "created_at": _naive_utc().isoformat(),
                })
            except Exception:
                pass

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

            created_at = _naive_utc()
            if telegram_message.date:
                try:
                    created_at = telegram_message.date.replace(tzinfo=None)
                except Exception:
                    pass

            media_type = None
            if telegram_message.media:
                n = type(telegram_message.media).__name__
                if "Photo" in n:      media_type = "photo"
                elif "Document" in n: media_type = "document"
                elif "Video" in n:    media_type = "video"
                elif "Audio" in n:    media_type = "audio"
                else:                 media_type = n.lower()

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
        """Generate Claude AI response and send it via Telegram with human-like timing."""
        try:
            if not settings.ANTHROPIC_API_KEY:
                logger.warning("ANTHROPIC_API_KEY not set — AI autopilot disabled.")
                return

            from app.services.telegram.client import telegram_client

            # ── Auto-reply rules: keyword match → send template, skip Claude ─────
            auto_reply_match = await self._check_auto_reply_rules(incoming_text)
            if auto_reply_match:
                auto_reply_text = _clean_response(auto_reply_match["text"])
                rule_action     = auto_reply_match.get("action", "")
                logger.info(f"[auto-reply] rule matched action={rule_action} for tg_id={telegram_id}")
                try:
                    from telethon.tl.functions.messages import SetTypingRequest
                    from telethon.tl.types import SendMessageTypingAction
                    await telegram_client.client(
                        SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                    )
                except Exception:
                    pass
                await _human_typing_delay(auto_reply_text, {})
                tg_msg_id = await telegram_client.send_message(telegram_id, auto_reply_text)
                if tg_msg_id:
                    async with db_manager.get_session() as session:
                        ai_msg = Message(
                            message_id=tg_msg_id, user_id=user_id, text=auto_reply_text,
                            direction="outgoing", has_media=False, is_ai_generated=True,
                            extra_data={"source": "auto_reply", "action": rule_action},
                            created_at=_naive_utc(),
                        )
                        session.add(ai_msg)

                        # Tag chat as WARM whenever the package menu is sent
                        if rule_action == "send_package_menu":
                            user_res = await session.execute(
                                select(User).where(User.id == user_id)
                            )
                            u = user_res.scalars().first()
                            if u:
                                extra = dict(u.extra_data or {})
                                extra["lead_label"] = "WARM"
                                u.extra_data = extra
                                logger.info(f"[auto-reply] tagged user {user_id} as WARM")

                        await session.commit()
                    try:
                        import main as _main
                        _main._broadcast_new_message(str(user_id), {
                            "id": str(tg_msg_id), "text": auto_reply_text,
                            "direction": "outgoing", "is_ai_generated": True,
                            "created_at": _naive_utc().isoformat(),
                        })
                    except Exception:
                        pass
                return  # Rule handled — no Claude call

            async with db_manager.get_session() as session:
                result = await session.execute(select(Config).where(Config.key == "persona"))
                cfg = result.scalars().first()
                persona_data = cfg.value if cfg else {}

                if persona_data.get("ai_enabled") is False:
                    logger.debug("AI globally disabled — skipping")
                    return

                # ── Build system prompt from persona JSON ───────────────────
                base_prompt = _build_system_prompt(persona_data)

                # ── Language detection rule ─────────────────────────────────
                enabled_langs = persona_data.get("enabled_languages") or ["en", "de", "uk", "ru"]
                LANG_NAMES = {"en": "English", "de": "German", "uk": "Ukrainian", "ru": "Russian"}
                lang_list = ", ".join(LANG_NAMES.get(c, c) for c in enabled_langs)
                lang_rule = (
                    f"\n\nLANGUAGE RULE (non-negotiable): Detect the language of the user's "
                    f"latest message and reply ONLY in that same language. "
                    f"Supported: {lang_list}. Default to English if unsupported language. "
                    f"Never mix languages in a single reply."
                )
                system_prompt = base_prompt + lang_rule

                # ── Model selection ─────────────────────────────────────────
                VALID_MODELS = {
                    "claude-haiku-4-5-20251001",
                    "claude-sonnet-4-6",
                    "claude-opus-4-6",
                    "claude-3-5-haiku-20241022",
                    "claude-3-5-sonnet-20241022",
                    "claude-3-haiku-20240307",
                }
                raw_model = persona_data.get("model", settings.CLAUDE_MODEL)
                model = raw_model if raw_model in VALID_MODELS else settings.CLAUDE_MODEL
                max_tokens = int(persona_data.get("max_tokens", 512))

                # ── Conversation history ────────────────────────────────────
                hist_result = await session.execute(
                    select(Message)
                    .where(Message.user_id == user_id)
                    .order_by(Message.created_at.desc())
                    .limit(20)
                )
                recent = list(reversed(hist_result.scalars().all()))

            # Build Claude messages list
            claude_msgs: List[Dict[str, str]] = []
            for m in recent:
                if not m.text:
                    continue
                role = "user" if m.direction == "incoming" else "assistant"
                if claude_msgs and claude_msgs[-1]["role"] == role:
                    claude_msgs[-1]["content"] += "\n" + m.text
                else:
                    claude_msgs.append({"role": role, "content": m.text})

            if not claude_msgs or claude_msgs[-1]["role"] != "user":
                claude_msgs.append({"role": "user", "content": incoming_text})

            logger.info(f"Calling Claude ({model}) for tg_id={telegram_id}, {len(claude_msgs)} msgs in context")

            # ── Call Claude ─────────────────────────────────────────────────
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
                logger.warning(f"Claude returned empty response for {telegram_id}")
                return

            # ── Post-process: strip dashes ──────────────────────────────────
            ai_text = _clean_response(ai_text)

            logger.info(f"✓ AI response for tg_id={telegram_id}: {ai_text[:120]}")

            # ── Human delay: show typing indicator while waiting ────────────
            try:
                from telethon.tl.functions.messages import SetTypingRequest
                from telethon.tl.types import SendMessageTypingAction
                await telegram_client.client(
                    SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                )
            except Exception:
                pass  # typing indicator is best-effort

            await _human_typing_delay(ai_text, persona_data)

            # ── Send via Telegram ───────────────────────────────────────────
            tg_msg_id = await telegram_client.send_message(telegram_id, ai_text)
            if tg_msg_id is None:
                logger.error(f"Telegram send failed for tg_id={telegram_id}")
                return

            # ── Store in DB ─────────────────────────────────────────────────
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

            # ── Broadcast via SSE ───────────────────────────────────────────
            try:
                import main as _main
                _main._broadcast_new_message(str(user_id), {
                    "id": str(tg_msg_id),
                    "text": ai_text,
                    "direction": "outgoing",
                    "is_ai_generated": True,
                    "created_at": _naive_utc().isoformat(),
                })
            except Exception:
                pass

            self._stats["ai_responses"] += 1
            logger.info(f"AI stats: {self._stats}")

        except Exception as e:
            logger.error(f"AI response failed for tg_id={telegram_id}: {e}", exc_info=True)

    async def _check_auto_reply_rules(self, incoming_text: str) -> Optional[Dict[str, Any]]:
        """
        Check auto_replies config for a keyword match.
        Returns dict {"text": ..., "label": ..., "action": ...} or None.
        Rules sorted by priority (lower = higher priority).
        """
        try:
            async with db_manager.get_session() as session:
                result = await session.execute(
                    select(Config).where(Config.key == "auto_replies")
                )
                cfg = result.scalars().first()
                rules = cfg.value if cfg and isinstance(cfg.value, list) else []
            if not rules:
                return None
            text_lower = incoming_text.lower()
            enabled = sorted(
                [r for r in rules
                 if r.get("enabled") and r.get("keywords") and r.get("response_template")],
                key=lambda r: r.get("priority", 99),
            )
            for rule in enabled:
                for kw in rule.get("keywords", []):
                    if str(kw).lower() in text_lower:
                        logger.info(f"[auto-reply] rule '{rule.get('name','?')}' matched kw='{kw}'")
                        return {
                            "text": rule.get("response_template", ""),
                            "label": rule.get("label", ""),
                            "action": rule.get("action", ""),
                        }
        except Exception as e:
            logger.error(f"Auto-reply rules check: {e}")
        return None

    # ── Background queue ───────────────────────────────────────────────────────

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
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Queue processing error: {e}")
                await asyncio.sleep(5)


message_processor = MessageProcessor()
__all__ = ["message_processor", "MessageProcessor"]
