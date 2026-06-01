"""
app/services/telegram/message_handler.py
Processing pipeline for incoming Telegram messages + AI autopilot.
"""

import logging
import asyncio
import re
import random
import hashlib
import base64
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.types import Message as TelegramMessage

from app.db.database import db_manager
from app.db.models import User, Message, Config, Lead
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
- EMOJIS: use at most 1 emoji per message. Never put an emoji at the start of a sentence. Never use more than one emoji in a row. When in doubt, use none.
- When writing German: always use "du", never "Sie"
- Never write long structured paragraphs or bullet points

ANTI-REPETITION (critical):
- NEVER open two messages in a row the same way (no "oh", "hey", "haha" as every opener)
- NEVER repeat a sentence structure you already used in your last 3 replies
- NEVER use the same filler phrase twice in a conversation ("stimmt", "krass", "echt jetzt" etc.)
- If you notice the conversation getting monotone — switch register: ask a question, be more direct, change tone slightly
- Read your last 2 replies before writing. If anything sounds similar → rewrite it completely differently

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
    Post-process AI response to enforce no-dash rule, limit emojis, and clean up formatting.
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

    # ── Emoji limiter: max 2 emojis per message ────────────────────────────
    # Unicode emoji regex — matches any emoji character
    emoji_pattern = re.compile(
        "[\U0001F600-\U0001F64F"   # emoticons
        "\U0001F300-\U0001F5FF"   # symbols & pictographs
        "\U0001F680-\U0001F6FF"   # transport & map
        "\U0001F1E0-\U0001F1FF"   # flags
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "\U0001f926-\U0001f937"
        "\U00010000-\U0010ffff"
        "♀-♂"
        "☀-⭕"
        "‍⏏⏩⌚️〰"
        "]+", flags=re.UNICODE
    )
    emojis_found = emoji_pattern.findall(text)
    if len(emojis_found) > 2:
        # Keep only the first 2 emoji occurrences, strip the rest
        count = 0
        def _maybe_keep(m):
            nonlocal count
            count += 1
            return m.group(0) if count <= 2 else ''
        text = emoji_pattern.sub(_maybe_keep, text)

    # Remove emojis stuck directly at the start of a sentence/line
    # (e.g. "😊 hey" → "hey")  — only if it's the very first char
    text = re.sub(r'^[\U0001F300-\U0001FAFF☀-➿️⃐-⃿\s]+(?=[a-zA-ZäöüÄÖÜа-яА-Яа-ґА-Ґ])', '', text)

    return text.strip()


def _enforce_sentence_limit(text: str, max_sentences: int = 3) -> str:
    """
    Truncate response to at most `max_sentences` sentences.
    Splits on sentence-ending punctuation (. ! ?) followed by whitespace or end-of-string.
    Preserves the original trailing punctuation of the last kept sentence.

    Examples:
        "Hey! How are you? I'm good. What about you?" → (max=2) "Hey! How are you?"
        "okay lol... that's wild" → (max=3) unchanged (1 sentence-ish, no hard break)
    """
    if max_sentences <= 0:
        return text

    # Split on sentence boundaries while keeping the delimiter
    # Pattern: split after . ! ? when followed by whitespace or end-of-string,
    # but NOT after "..." ellipses (keep those as part of the sentence).
    parts = re.split(r'(?<=[^.])[.!?](?=\s|$)', text)

    # re.split drops the delimiter — we need to recover punctuation
    # Use a findall approach instead for accuracy
    sentence_pattern = re.compile(
        r'[^.!?]*'          # sentence body
        r'(?:[.!?](?!\.))'  # single terminator (not part of "...")
        r'|[^.!?]+'         # or a fragment without terminator (last segment)
    )
    sentences = [m.group().strip() for m in sentence_pattern.finditer(text) if m.group().strip()]

    if not sentences:
        return text

    kept = sentences[:max_sentences]
    result = " ".join(kept)

    # If we truncated anything, make sure result ends with proper punctuation
    if len(sentences) > max_sentences and result and result[-1] not in ".!?":
        result += "."

    return result.strip()


# ── Sales intent detection ─────────────────────────────────────────────────────

def _detect_sales_intent(
    text: str,
    packages: list,
    user_extra: dict,
) -> Dict[str, Any]:
    """
    Classify an incoming message into a sales funnel stage.

    Returns:
        {
          "intent": "payment_confirmed" | "asking_details" | "selecting_package"
                    | "ready_to_pay" | "browsing",
          "matched_package": dict | None,   # package referenced in the message
          "package_index": int | None,
        }

    Priority (highest first):
        payment_confirmed → asking_details → selecting_package → ready_to_pay → browsing
    """
    t = text.lower()

    # ── 1. Payment confirmed ───────────────────────────────────────────────────
    if any(kw in t for kw in [
        "habe bezahlt", "hab bezahlt", "ist bezahlt",
        "habe überwiesen", "hab überwiesen",
        "habe gezahlt", "hab gezahlt",
        "i paid", "i have paid", "payment sent",
        "money sent", "just paid", "done paying", "ist raus",
    ]):
        return {"intent": "payment_confirmed", "matched_package": None, "package_index": None}

    # ── Helper: find referenced package ───────────────────────────────────────
    matched_pkg: Optional[dict] = None
    matched_idx: Optional[int] = None
    for i, pkg in enumerate(packages):
        name_lower = (pkg.get("name") or "").lower()
        if name_lower and name_lower in t:
            matched_pkg, matched_idx = pkg, i
            break
        for pat in [f"paket {i+1}", f"package {i+1}", f"option {i+1}", f"nr {i+1}", f"#{i+1}"]:
            if pat in t:
                matched_pkg, matched_idx = pkg, i
                break
    if not matched_pkg:
        _ORDS = [
            ["das erste", "ersten", "first", "1st", "paket eins"],
            ["das zweite", "zweiten", "second", "2nd", "paket zwei"],
            ["das dritte", "dritten", "third", "3rd", "paket drei"],
        ]
        for i, ords in enumerate(_ORDS):
            if i < len(packages) and any(o in t for o in ords):
                matched_pkg, matched_idx = packages[i], i
                break

    # ── 2. Asking for content/preview details ──────────────────────────────────
    if any(kw in t for kw in [
        # German
        "was sehe ich", "was ist drin", "was bekomme ich", "was passiert",
        "was zeigst du", "beschreib", "mehr infos", "was genau",
        "was ist im paket", "was ist in paket", "was hat das paket",
        "zeig mir was", "erzähl mir mehr", "mehr details", "was gibts",
        "was siehst man", "was ist zu sehen",
        # English
        "what do i see", "what's in it", "what's inside", "describe",
        "what will i get", "what do i get", "what exactly", "tell me more",
        "what's in the", "what is in the",
    ]):
        return {"intent": "asking_details", "matched_package": matched_pkg, "package_index": matched_idx}

    # ── 3. Selecting a specific package ───────────────────────────────────────
    if any(kw in t for kw in [
        # German
        "ich nehme", "ich will", "nehme ich", "das nehme", "ich hätte gerne",
        "ich kaufe", "ich bestelle", "ich möchte das",
        # English
        "i'll take", "i want this", "i want that", "i'll go with",
        "give me package", "i'd like this",
    ]):
        return {"intent": "selecting_package", "matched_package": matched_pkg, "package_index": matched_idx}

    # ── 4. Asking how/where to pay ────────────────────────────────────────────
    if any(kw in t for kw in [
        # German
        "paypal", "wie bezahle", "wie bezahl", "zahlung", "bezahlen",
        "kauflink", "zahlungslink", "überweisen", "schick mir den link",
        "wo kann ich zahlen", "klarna", "stripe",
        # English
        "how do i pay", "how to pay", "payment link", "where do i pay",
        "ready to pay",
    ]):
        return {"intent": "ready_to_pay", "matched_package": matched_pkg, "package_index": matched_idx}

    # ── 5. Default ─────────────────────────────────────────────────────────────
    return {"intent": "browsing", "matched_package": matched_pkg, "package_index": matched_idx}


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


# ── Per-user message debouncer ─────────────────────────────────────────────────

class MessageDebouncer:
    """
    Collects rapid consecutive messages from the same user and merges them into
    a single AI call after a quiet window of DEBOUNCE_SECONDS.

    Flow:
      push(msg1) → starts 5 s timer
      push(msg2) → cancels timer, appends msg2, restarts 5 s timer
      ... silence for 5 s ...
      → fires callback("msg1 msg2")  [one AI call, one reply]
    """

    DEBOUNCE_SECONDS: float = 5.0

    def __init__(self) -> None:
        # key: (user_id_str, creator_id) → {"texts": [...], "task": Task|None}
        self._buffers: Dict[tuple, Dict] = {}

    async def push(
        self,
        user_id,                          # UUID
        telegram_id: int,
        text: str,
        creator_id: Optional[str],
        callback,                         # bound method: _generate_and_send_ai_response
    ) -> None:
        key = (str(user_id), creator_id)

        entry = self._buffers.setdefault(key, {"texts": [], "task": None})
        entry["texts"].append(text)

        # Cancel the existing countdown so the window resets
        old: Optional[asyncio.Task] = entry.get("task")
        if old and not old.done():
            old.cancel()

        async def _fire(k=key) -> None:
            try:
                await asyncio.sleep(self.DEBOUNCE_SECONDS)
            except asyncio.CancelledError:
                return  # newer message arrived — a fresh timer will fire instead

            buf = self._buffers.pop(k, None)
            if not buf:
                return

            texts = [t for t in buf.get("texts", []) if t.strip()]
            if not texts:
                return

            combined = " ".join(texts)
            n = len(texts)
            logger.info(
                f"[debounce] merged {n} msg(s) for user={str(user_id)[:8]}… → "
                f"{combined[:80]}{'…' if len(combined) > 80 else ''}"
            )
            try:
                await callback(user_id, telegram_id, combined, creator_id=creator_id)
            except Exception as exc:
                logger.error(f"[debounce] callback error: {exc}", exc_info=True)

        entry["task"] = asyncio.create_task(_fire())


# ── Main processor ─────────────────────────────────────────────────────────────

class MessageProcessor:
    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue()
        self._processor_running = False
        self._stats = {"processed": 0, "failed": 0, "ai_responses": 0}
        self.debouncer = MessageDebouncer()

    async def process_incoming_message(self, event_data: Dict[str, Any]) -> bool:
        try:
            telegram_message: TelegramMessage = event_data["message"]
            sender_id: int = event_data["sender_id"]
            # creator_id is set for non-default creators; None → handled by default client
            creator_id: Optional[str] = event_data.get("creator_id")

            if not sender_id:
                return False

            text = telegram_message.message or ""
            has_media = telegram_message.media is not None

            logger.info(f"Processing incoming message from {sender_id} (creator={creator_id})")

            async with db_manager.get_session() as session:
                user = await self._get_or_create_user(session, sender_id, creator_id=creator_id)
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
                user_creator_id = str(user.creator_id) if user.creator_id else creator_id
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
                # Push into the per-user debounce buffer instead of firing immediately.
                # If the user sends another message within 5 s the timer resets and
                # both texts are merged into one AI call.
                asyncio.create_task(
                    self.debouncer.push(
                        user_id, telegram_id, text, user_creator_id,
                        self._generate_and_send_ai_response,
                    )
                )

            self._stats["processed"] += 1
            return True

        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)
            self._stats["failed"] += 1
            return False

    async def _get_or_create_user(
        self,
        session: AsyncSession,
        telegram_user_id: int,
        creator_id: Optional[str] = None,
    ) -> Optional[User]:
        """
        Look up a user scoped to the creator.
        For the default creator (creator_id=None) we fall back to the first match.
        For non-default creators we enforce the (user_id, creator_id) composite.
        """
        try:
            import uuid as _uuid

            # Resolve real creator UUID (default creator if creator_id is None)
            resolved_creator_id = None
            if creator_id:
                resolved_creator_id = _uuid.UUID(creator_id)
            else:
                # Get default creator id
                from app.db.models import Creator as CreatorModel
                res = await session.execute(
                    select(CreatorModel).where(CreatorModel.is_default == True)
                )
                default_creator = res.scalars().first()
                if default_creator:
                    resolved_creator_id = default_creator.id

            # Lookup by telegram_user_id + creator_id
            from sqlalchemy import and_ as sa_and
            if resolved_creator_id:
                result = await session.execute(
                    select(User).where(
                        sa_and(User.user_id == telegram_user_id, User.creator_id == resolved_creator_id)
                    )
                )
            else:
                result = await session.execute(select(User).where(User.user_id == telegram_user_id))

            user = result.scalars().first()
            if user:
                return user

            # Fetch Telegram profile info — use the creator's client if available
            tg_user = None
            try:
                if creator_id:
                    from app.services.telegram.client import creator_pool
                    pool_client = creator_pool.get_client(creator_id)
                    if pool_client:
                        tg_user = await pool_client.get_user(telegram_user_id)
                if tg_user is None:
                    from app.services.telegram.client import telegram_client
                    tg_user = await telegram_client.get_user(telegram_user_id)
            except Exception:
                pass

            user = User(
                user_id=telegram_user_id,
                creator_id=resolved_creator_id,
                first_name=(getattr(tg_user, "first_name", None) or "Unknown") if tg_user else "Unknown",
                last_name=getattr(tg_user, "last_name", None) if tg_user else None,
                username=getattr(tg_user, "username", None) if tg_user else None,
                is_bot=getattr(tg_user, "bot", False) if tg_user else False,
            )
            session.add(user)
            await session.flush()
            logger.info(f"Created new user {user.id} for Telegram {telegram_user_id} (creator={resolved_creator_id})")
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

    # ── Dynamic package helpers ────────────────────────────────────────────────

    def _extract_topic_keyword(self, text: str) -> str:
        """
        Extract the main content keyword from the user's message.
        Used to pick matching media for dynamic packages.
        Returns lowercase keyword string (may be empty if nothing useful found).
        """
        if not text:
            return ""
        # German + English stopwords to ignore
        STOP = {
            "ich", "du", "er", "sie", "wir", "ihr", "ist", "bin", "hat", "hast",
            "haben", "hatte", "bist", "sind", "war", "wird", "werden", "kann",
            "kannst", "muss", "müssen", "soll", "wollen", "mal", "noch", "auch",
            "aber", "und", "oder", "nicht", "kein", "keine", "schon", "halt",
            "irgendwie", "gerade", "immer", "noch", "bitte", "danke", "okay",
            "nein", "ja", "the", "and", "for", "you", "are", "this", "that",
            "have", "with", "from", "they", "will", "would", "could", "should",
            "send", "show", "give", "what", "when", "how", "your", "our",
            "paket", "pakete", "inhalt", "video", "videos", "bilder", "bild",
            "content", "preis", "kaufen", "mehr", "alles", "heute", "jetzt",
        }
        # Tokenize — lowercase words, min length 4
        words = re.findall(r'\b[a-zA-ZäöüÄÖÜß]{4,}\b', text.lower())
        candidates = [w for w in words if w not in STOP]
        if not candidates:
            return ""
        # Return the longest candidate (most likely to be a specific topic word)
        return max(candidates, key=len)

    async def _load_media_library(self) -> list:
        """Load all media items from config."""
        try:
            async with db_manager.get_session() as session:
                res = await session.execute(select(Config).where(Config.key == "media_library"))
                cfg = res.scalars().first()
                return cfg.value if cfg and isinstance(cfg.value, list) else []
        except Exception as e:
            logger.warning(f"_load_media_library error: {e}")
            return []

    def _pick_files_for_keyword(
        self, media_items: list, keyword: str, n_videos: int, n_images: int
    ) -> list:
        """
        Search media library for items matching `keyword` in name/description/tag.
        Returns a list of file dicts (name, type) up to n_videos + n_images total.
        Falls back to any available files if keyword yields no matches.
        """
        if not keyword:
            matched = media_items
        else:
            kw = keyword.lower()
            matched = [
                m for m in media_items
                if kw in (m.get("name") or "").lower()
                or kw in (m.get("description") or "").lower()
                or kw in (m.get("tag") or "").lower()
                or kw in (m.get("message_to_user") or "").lower()
            ]
            if not matched:
                # No keyword match — use any non-Free content item
                matched = [m for m in media_items if m.get("tag", "Free") != "Free"]
            if not matched:
                matched = media_items  # last resort: anything

        videos = [m for m in matched if str(m.get("type", "")).startswith("video")]
        images = [m for m in matched if str(m.get("type", "")).startswith("image")]

        # Shuffle for variety
        random.shuffle(videos)
        random.shuffle(images)

        picked = videos[:n_videos] + images[:n_images]
        return [{"name": m.get("name", ""), "type": m.get("type", ""), "media_id": m.get("id", "")} for m in picked]

    async def _build_dynamic_package_menu(
        self, packages: list, incoming_text: str, user_id: UUID
    ) -> str:
        """
        Build package menu text. For packages with dynamic=True, picks matching
        media files from the library based on the conversation keyword.
        """
        keyword = self._extract_topic_keyword(incoming_text)
        logger.info(f"[package-menu] keyword='{keyword}' from: {incoming_text[:60]}")

        # Load media library once for dynamic packages
        media_items: list = []
        if any(p.get("dynamic") for p in packages):
            media_items = await self._load_media_library()

        lines = [f"hier sind meine aktuellen angebote 🔥\n"]
        for pkg in packages:
            name   = pkg.get("name", "")
            price  = pkg.get("price", "")
            curr   = pkg.get("currency", "€")
            desc   = pkg.get("description", "") or pkg.get("tagline", "")
            link   = pkg.get("payment_link", "")

            if pkg.get("dynamic"):
                # Dynamic: pick files matching the keyword
                rules = pkg.get("dynamic_rules") or {}
                n_vids = int(rules.get("videos", 0))
                n_imgs = int(rules.get("images", 0))
                files  = self._pick_files_for_keyword(media_items, keyword, n_vids, n_imgs)
            else:
                files = pkg.get("media_files", [])

            # File summary
            file_summary = ""
            if files:
                imgs  = sum(1 for f in files if str(f.get("type","")).startswith("image"))
                vids  = sum(1 for f in files if str(f.get("type","")).startswith("video"))
                parts = []
                if vids: parts.append(f"{vids} video{'s' if vids>1 else ''}")
                if imgs: parts.append(f"{imgs} bild{'er' if imgs>1 else ''}")
                if parts: file_summary = f" ({', '.join(parts)})"

            price_str    = f"{price} {curr}".strip() if price else ""
            preview_desc = (pkg.get("package_preview_description") or "").strip()

            block = f"📦 *{name}*"
            if desc:                              block += f"\n{desc}"
            # Show the admin-configured "what you will see" description if set
            if preview_desc and preview_desc != desc:
                                                  block += f"\n{preview_desc}"
            if file_summary:                      block += f"\ninhalt:{file_summary}"
            if price_str:                         block += f"\n💰 {price_str}"
            if link:                              block += f"\n🔗 {link}"
            lines.append(block)

        lines.append("\nwelches interessiert dich?")
        return "\n\n".join(lines)

    async def _load_packages(self) -> list:
        """Load active packages from config. Returns list of package dicts."""
        try:
            async with db_manager.get_session() as session:
                res = await session.execute(select(Config).where(Config.key == "packages"))
                cfg = res.scalars().first()
                if not cfg:
                    return []
                val = cfg.value
                pkgs = val if isinstance(val, list) else (val.get("packages", []) if isinstance(val, dict) else [])
                return [p for p in pkgs if p.get("active", True) and p.get("name")]
        except Exception as e:
            logger.warning(f"_load_packages error: {e}")
            return []

    def _build_package_menu_text(self, packages: list) -> str:
        """
        Build a clean German package menu message from the real package config.
        Falls back gracefully if fields are missing.
        """
        lines = ["hier sind meine aktuellen angebote 🔥\n"]
        for pkg in packages:
            name   = pkg.get("name", "")
            price  = pkg.get("price", "")
            curr   = pkg.get("currency", "€")
            desc   = pkg.get("description", "") or pkg.get("tagline", "")
            link   = pkg.get("payment_link", "")
            # files summary
            files  = pkg.get("media_files", [])
            file_summary = ""
            if files:
                imgs   = sum(1 for f in files if str(f.get("type","")).startswith("image"))
                vids   = sum(1 for f in files if str(f.get("type","")).startswith("video"))
                parts  = []
                if vids:  parts.append(f"{vids} video{'s' if vids>1 else ''}")
                if imgs:  parts.append(f"{imgs} bild{'er' if imgs>1 else ''}")
                if parts: file_summary = f" ({', '.join(parts)})"

            price_str = f"{price} {curr}".strip() if price else ""

            block = f"📦 *{name}*"
            if desc:
                block += f"\n{desc}"
            if file_summary:
                block += f"\ninhalt:{file_summary}"
            if price_str:
                block += f"\n💰 {price_str}"
            if link:
                block += f"\n🔗 {link}"
            lines.append(block)

        lines.append("\nwelches interessiert dich? 😊")
        return "\n\n".join(lines)

    async def _send_free_teaser(self, user_id: UUID, telegram_id: int, creator_id: Optional[str] = None) -> bool:
        """
        Pick a random 'Free' media item and send it via Telegram as a teaser.
        Respects the no_repeat setting — tracks sent_media in user extra_data.
        Returns True if a teaser was sent.
        """
        try:
            async with db_manager.get_session() as session:
                # Load media library
                media_res = await session.execute(select(Config).where(Config.key == "media_library"))
                media_cfg = media_res.scalars().first()
                all_items = media_cfg.value if media_cfg and isinstance(media_cfg.value, list) else []

                # Load settings
                set_res = await session.execute(select(Config).where(Config.key == "media_settings"))
                set_cfg = set_res.scalars().first()
                media_settings = set_cfg.value if set_cfg and isinstance(set_cfg.value, dict) else {}
                no_repeat = media_settings.get("no_repeat", True)

                # Filter Free items that have a dataUrl
                free_items = [i for i in all_items if i.get("tag") == "Free" and i.get("dataUrl")]
                if not free_items:
                    return False

                # Respect no-repeat
                if no_repeat:
                    user_res = await session.execute(select(User).where(User.id == user_id))
                    user = user_res.scalars().first()
                    sent_ids = (user.extra_data or {}).get("sent_media", []) if user else []
                    unsent = [i for i in free_items if i["id"] not in sent_ids]
                    candidates = unsent if unsent else free_items  # reset cycle if all sent
                else:
                    candidates = free_items

            chosen = random.choice(candidates)
            data_url: str = chosen["dataUrl"]
            if "," in data_url:
                _header, b64 = data_url.split(",", 1)
            else:
                b64 = data_url

            file_bytes = base64.b64decode(b64)
            file_name  = chosen.get("name", "preview.jpg")

            tg_client = self._resolve_tg_client(creator_id)
            await tg_client.client.send_file(
                telegram_id,
                file=file_bytes,
                attributes=[],
                force_document=False,
            )
            logger.info(f"[teaser] sent '{file_name}' to tg_id={telegram_id}")

            # Track sent_media on user
            if no_repeat:
                async with db_manager.get_session() as session:
                    user_res = await session.execute(select(User).where(User.id == user_id))
                    user = user_res.scalars().first()
                    if user:
                        extra = dict(user.extra_data or {})
                        sent = list(extra.get("sent_media", []))
                        if chosen["id"] not in sent:
                            sent.append(chosen["id"])
                        extra["sent_media"] = sent
                        user.extra_data = extra
                        await session.commit()
            return True

        except Exception as e:
            logger.warning(f"[teaser] failed to send free teaser: {e}")
            return False

    async def _save_selected_package(self, user_id: UUID, package_id: str) -> None:
        """Persist the user's chosen package ID to their extra_data."""
        try:
            async with db_manager.get_session() as session:
                user_res = await session.execute(select(User).where(User.id == user_id))
                user = user_res.scalars().first()
                if user:
                    extra = dict(user.extra_data or {})
                    extra["selected_package_id"] = package_id
                    user.extra_data = extra
                    await session.commit()
                    logger.debug(f"[sales-flow] saved selected_package_id={package_id} for user {user_id}")
        except Exception as e:
            logger.warning(f"[sales-flow] _save_selected_package error: {e}")

    def _resolve_tg_client(self, creator_id: Optional[str]):
        """Return the right TelegramClientManager for this creator."""
        if creator_id:
            from app.services.telegram.client import creator_pool
            pool_client = creator_pool.get_client(creator_id)
            if pool_client and pool_client.is_connected:
                return pool_client
        from app.services.telegram.client import telegram_client
        return telegram_client

    async def _generate_and_send_ai_response(
        self,
        user_id: UUID,
        telegram_id: int,
        incoming_text: str,
        creator_id: Optional[str] = None,
    ) -> None:
        """Generate Claude AI response and send it via Telegram with human-like timing."""
        try:
            if not settings.ANTHROPIC_API_KEY:
                logger.warning("ANTHROPIC_API_KEY not set — AI autopilot disabled.")
                return

            # ── Global autopilot switch ─────────────────────────────────────
            try:
                async with db_manager.get_session() as session:
                    g_res = await session.execute(select(Config).where(Config.key == "autopilot_global"))
                    g_cfg = g_res.scalars().first()
                    if g_cfg and isinstance(g_cfg.value, dict):
                        if g_cfg.value.get("enabled") is False:
                            logger.debug("Global autopilot disabled — skipping AI response")
                            return
            except Exception:
                pass  # If we can't read the config, proceed anyway

            # Use the correct Telegram client (creator's client or default)
            tg_client = self._resolve_tg_client(creator_id)

            # ── Auto-reply rules: keyword match → send template, skip Claude ─────
            auto_reply_match = await self._check_auto_reply_rules(incoming_text)
            if auto_reply_match:
                rule_action = auto_reply_match.get("action", "")
                logger.info(f"[auto-reply] rule matched action={rule_action} for tg_id={telegram_id}")

                # ── Package menu: use real package data, not the hardcoded template ──
                if rule_action == "send_package_menu":
                    packages = await self._load_packages()
                    if not packages:
                        # No packages configured → fall through to Claude so it handles naturally
                        logger.info("[auto-reply] send_package_menu: no active packages — falling through to Claude")
                    else:
                        # 1) Send a free teaser FIRST as a preview/hook
                        teaser_sent = await self._send_free_teaser(user_id, telegram_id, creator_id=creator_id)
                        if teaser_sent:
                            await asyncio.sleep(1.5)  # brief pause between teaser and menu

                        # 2) Build and send the real package menu (keyword-aware for dynamic pkgs)
                        menu_text = await self._build_dynamic_package_menu(packages, incoming_text, user_id)
                        try:
                            from telethon.tl.functions.messages import SetTypingRequest
                            from telethon.tl.types import SendMessageTypingAction
                            await tg_client.client(
                                SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                            )
                        except Exception:
                            pass
                        await _human_typing_delay(menu_text, {})
                        tg_msg_id = await tg_client.send_message(telegram_id, menu_text)
                        if tg_msg_id:
                            async with db_manager.get_session() as session:
                                ai_msg = Message(
                                    message_id=tg_msg_id, user_id=user_id, text=menu_text,
                                    direction="outgoing", has_media=False, is_ai_generated=True,
                                    extra_data={"source": "auto_reply", "action": rule_action},
                                    created_at=_naive_utc(),
                                )
                                session.add(ai_msg)
                                # Tag chat as WARM when package menu is sent
                                user_res = await session.execute(select(User).where(User.id == user_id))
                                u = user_res.scalars().first()
                                if u:
                                    extra = dict(u.extra_data or {})
                                    extra["lead_label"] = "WARM"
                                    u.extra_data = extra
                                    logger.info(f"[auto-reply] tagged user {user_id} as WARM")
                                await session.commit()
                            asyncio.create_task(self._update_lead_funnel(user_id, "price_inquiry"))
                            try:
                                import main as _main
                                _main._broadcast_new_message(str(user_id), {
                                    "id": str(tg_msg_id), "text": menu_text,
                                    "direction": "outgoing", "is_ai_generated": True,
                                    "created_at": _naive_utc().isoformat(),
                                })
                            except Exception:
                                pass
                        return  # Package menu handled — no Claude call

                # ── All other auto-reply rules: send the template text as-is ──
                else:
                    auto_reply_text = _clean_response(auto_reply_match["text"])
                    try:
                        from telethon.tl.functions.messages import SetTypingRequest
                        from telethon.tl.types import SendMessageTypingAction
                        await tg_client.client(
                            SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                        )
                    except Exception:
                        pass
                    await _human_typing_delay(auto_reply_text, {})
                    tg_msg_id = await tg_client.send_message(telegram_id, auto_reply_text)
                    if tg_msg_id:
                        async with db_manager.get_session() as session:
                            ai_msg = Message(
                                message_id=tg_msg_id, user_id=user_id, text=auto_reply_text,
                                direction="outgoing", has_media=False, is_ai_generated=True,
                                extra_data={"source": "auto_reply", "action": rule_action},
                                created_at=_naive_utc(),
                            )
                            session.add(ai_msg)
                            await session.commit()
                        asyncio.create_task(self._update_lead_funnel(user_id, "ai_reply"))
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

                # ── Load operator system rules (highest priority) ───────────
                sys_rule_res = await session.execute(
                    select(Config).where(Config.key == "system_prompt")
                )
                sys_rule_cfg = sys_rule_res.scalars().first()
                operator_rules: str = ""
                if sys_rule_cfg:
                    raw_val = sys_rule_cfg.value
                    if isinstance(raw_val, str):
                        operator_rules = raw_val.strip()
                    elif isinstance(raw_val, dict):
                        operator_rules = str(raw_val.get("value", "") or "").strip()

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

                # ── Compose final prompt: operator rules (top) + persona + lang ──
                # Operator system rules are treated as absolute constraints — Claude
                # sees them first and they take precedence over anything in the persona.
                if operator_rules:
                    system_prompt = (
                        "SYSTEM RULES (ABSOLUTE PRIORITY — follow these before everything else):\n"
                        + operator_rules
                        + "\n\n---\n\n"
                        + base_prompt
                        + lang_rule
                    )
                    logger.debug(f"[system_prompt] operator rules prepended ({len(operator_rules)} chars)")
                else:
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

                # ── Load user extra_data for context guards ─────────────────
                user_res = await session.execute(select(User).where(User.id == user_id))
                user_obj = user_res.scalars().first()
                user_extra = dict(user_obj.extra_data or {}) if user_obj else {}

                # ── Load active packages + detect sales intent ──────────────
                _sp_res = await session.execute(
                    select(Config).where(Config.key == "packages")
                )
                _sp_cfg = _sp_res.scalars().first()
                _pkg_raw = _sp_cfg.value if _sp_cfg else []
                _active_pkgs: list = [
                    p for p in (_pkg_raw if isinstance(_pkg_raw, list) else [])
                    if p.get("active", True) and p.get("name")
                ]
                sales_intent = _detect_sales_intent(incoming_text, _active_pkgs, user_extra)

            # ── Sentence-limit rule: inject into prompt so Claude obeys upfront ─
            max_sents_cfg = int(persona_data.get("max_sentences", 3))
            if max_sents_cfg > 0:
                system_prompt += (
                    f"\n\nSENTENCE LIMIT (mandatory): Your response MUST contain at most "
                    f"{max_sents_cfg} sentence{'s' if max_sents_cfg != 1 else ''}. "
                    f"Count carefully. If you are about to write more, stop after sentence {max_sents_cfg}."
                )

            # ── PayPal guard: don't ask again if already asked ──────────────
            if user_extra.get("paypal_asked"):
                system_prompt += (
                    "\n\nPAYMENT RULE (mandatory): You already asked for their payment details "
                    "(PayPal / payment address) in a previous message. Do NOT ask for it again. "
                    "If they haven't provided it, mention the payment link only — do not ask "
                    "for any email or address."
                )

            # ── Recent-replies context: inject last 3 bot messages so Claude ──
            # can self-check and avoid repetition
            recent_bot_replies = [m.text for m in recent if m.direction == "outgoing" and m.text][-3:]
            if len(recent_bot_replies) >= 2:
                snippet = "\n".join(f'- "{r[:120]}"' for r in recent_bot_replies)
                system_prompt += (
                    f"\n\nYOUR LAST {len(recent_bot_replies)} REPLIES (do NOT repeat any phrase, "
                    f"opener, or structure from these):\n{snippet}"
                )

            # ── Sales flow: intercept or inject based on detected intent ─────
            _si        = sales_intent["intent"]
            _si_pkg    = sales_intent.get("matched_package")

            # ── ready_to_pay WITHOUT a selected package → show menu first ───
            # Prevents the bot from jumping straight to payment instructions
            # before the user has chosen what they want to buy.
            if _si == "ready_to_pay" and not user_extra.get("selected_package_id") and _active_pkgs:
                teaser_sent = await self._send_free_teaser(user_id, telegram_id, creator_id=creator_id)
                if teaser_sent:
                    await asyncio.sleep(1.5)
                menu_text = await self._build_dynamic_package_menu(_active_pkgs, incoming_text, user_id)
                try:
                    from telethon.tl.functions.messages import SetTypingRequest
                    from telethon.tl.types import SendMessageTypingAction
                    await tg_client.client(
                        SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                    )
                except Exception:
                    pass
                await _human_typing_delay(menu_text, persona_data)
                _tg_id2 = await tg_client.send_message(telegram_id, menu_text)
                if _tg_id2:
                    async with db_manager.get_session() as _s2:
                        _s2.add(Message(
                            message_id=_tg_id2, user_id=user_id, text=menu_text,
                            direction="outgoing", has_media=False, is_ai_generated=True,
                            extra_data={"source": "sales_flow", "intent": "ready_to_pay_no_selection"},
                            created_at=_naive_utc(),
                        ))
                        await _s2.commit()
                    asyncio.create_task(self._update_lead_funnel(user_id, "price_inquiry"))
                    try:
                        import main as _main
                        _main._broadcast_new_message(str(user_id), {
                            "id": str(_tg_id2), "text": menu_text, "direction": "outgoing",
                            "is_ai_generated": True, "created_at": _naive_utc().isoformat(),
                        })
                    except Exception:
                        pass
                return

            # ── selecting_package → save selection, inject pitch instruction ─
            if _si == "selecting_package" and _si_pkg:
                asyncio.create_task(
                    self._save_selected_package(user_id, str(_si_pkg.get("id", "")))
                )
                p_name  = _si_pkg.get("name", "")
                p_price = f"{_si_pkg.get('price', '')} {_si_pkg.get('currency', '€')}".strip()
                p_link  = _si_pkg.get("payment_link", "")
                p_prev  = (
                    _si_pkg.get("package_preview_description")
                    or _si_pkg.get("description")
                    or ""
                )
                _pkg_injection = (
                    f"\n\nPACKAGE SELECTED — user chose '{p_name}' (MANDATORY):\n"
                    f"1. Confirm their choice of '{p_name}' enthusiastically and in character.\n"
                    f"2. State the price: {p_price}\n"
                    f"3. Include the payment link verbatim: {p_link}\n"
                )
                if p_prev:
                    _pkg_injection += f"4. You may briefly reference: {p_prev}\n"
                _pkg_injection += (
                    "Keep it short. Use your persona tone. Sentence limit applies. "
                    "The payment link MUST appear in the reply."
                )
                system_prompt += _pkg_injection
                logger.info(f"[sales-flow] selecting_package → injecting pitch for '{p_name}'")

            # ── ready_to_pay WITH a selected package → inject payment reminder ─
            elif _si == "ready_to_pay" and user_extra.get("selected_package_id"):
                _sel = next(
                    (p for p in _active_pkgs if p.get("id") == user_extra["selected_package_id"]),
                    _si_pkg or (_active_pkgs[0] if _active_pkgs else None),
                )
                if _sel:
                    system_prompt += (
                        f"\n\nPAYMENT LINK REQUIRED: User wants to pay for '{_sel.get('name', '')}'. "
                        f"MUST include this exact payment link in your reply: {_sel.get('payment_link', '')} "
                        f"Price: {_sel.get('price', '')} {_sel.get('currency', '€')}. Keep it short."
                    )

            # ── asking_details → ground Claude in the configured description ──
            # The bot MUST use only the admin-configured preview description.
            # It must NOT invent details.
            elif _si == "asking_details":
                _desc_pkg = _si_pkg
                if not _desc_pkg and user_extra.get("selected_package_id"):
                    _desc_pkg = next(
                        (p for p in _active_pkgs if p.get("id") == user_extra["selected_package_id"]),
                        None,
                    )
                if not _desc_pkg and _active_pkgs:
                    _desc_pkg = _active_pkgs[0]
                if _desc_pkg:
                    _preview = (
                        _desc_pkg.get("package_preview_description")
                        or _desc_pkg.get("description")
                        or ""
                    )
                    if _preview:
                        system_prompt += (
                            f"\n\nCONTENT QUESTION: User asks what they will see in "
                            f"'{_desc_pkg.get('name', 'the package')}'.\n"
                            f"Answer using ONLY this configured description — DO NOT invent or add "
                            f"any details beyond what is written here:\n"
                            f"\"{_preview}\"\n"
                            f"Keep tone in persona. Sentence limit applies. "
                            f"Do not mention file names or internal keywords."
                        )
                        logger.debug(f"[sales-flow] asking_details → injected preview description")

            # ── payment_confirmed → acknowledge only, delivery is separate ───
            elif _si == "payment_confirmed":
                system_prompt += (
                    "\n\nPAYMENT CONFIRMED: The user says they have paid. "
                    "Acknowledge their payment warmly and in character. "
                    "Tell them you will send their content shortly. "
                    "Do NOT send any files in this message — delivery is handled separately. "
                    "Sentence limit applies."
                )

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

            # ── Post-process: strip dashes + enforce sentence limit ────────
            ai_text = _clean_response(ai_text)

            max_sents = int(persona_data.get("max_sentences", 3))
            if max_sents > 0:
                original_len = len(ai_text)
                ai_text = _enforce_sentence_limit(ai_text, max_sents)
                if len(ai_text) < original_len:
                    logger.debug(
                        f"[sentence-limit] truncated to {max_sents} sentences "
                        f"({original_len} → {len(ai_text)} chars)"
                    )

            logger.info(f"✓ AI response for tg_id={telegram_id}: {ai_text[:120]}")

            # ── Human delay: show typing indicator while waiting ────────────
            try:
                from telethon.tl.functions.messages import SetTypingRequest
                from telethon.tl.types import SendMessageTypingAction
                await tg_client.client(
                    SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                )
            except Exception:
                pass  # typing indicator is best-effort

            await _human_typing_delay(ai_text, persona_data)

            # ── Send via Telegram ───────────────────────────────────────────
            tg_msg_id = await tg_client.send_message(telegram_id, ai_text)
            if tg_msg_id is None:
                logger.error(f"Telegram send failed for tg_id={telegram_id}")
                return

            # ── Store in DB + set PayPal flag if bot just asked ────────────
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

                # Detect PayPal mention → set flag so we never ask again
                ai_lower = ai_text.lower()
                if not user_extra.get("paypal_asked") and any(
                    kw in ai_lower for kw in ["paypal", "pay pal", "zahlung", "payment", "email", "e-mail", "adresse"]
                ):
                    user_res2 = await session.execute(select(User).where(User.id == user_id))
                    u2 = user_res2.scalars().first()
                    if u2:
                        ex2 = dict(u2.extra_data or {})
                        ex2["paypal_asked"] = True
                        u2.extra_data = ex2

                await session.commit()
            asyncio.create_task(self._update_lead_funnel(user_id, "ai_reply"))

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

    async def _update_lead_funnel(self, user_id: UUID, interaction_type: str = "ai_reply") -> None:
        """
        Create or update the Lead record for this user.
        Advances funnel stage based on message count + signals.
        Awards points based on interaction type.

        interaction_type: "ai_reply" | "price_inquiry" | "personal_signal" | "purchase"
        """
        POINTS = {
            "ai_reply":      1,
            "price_inquiry": 15,
            "personal_signal": 20,
            "purchase":      100,
            "fan_message":   3,
        }
        try:
            async with db_manager.get_session() as session:
                from app.db.models import Lead
                from sqlalchemy import select as sa_select
                # Get user message count
                user_res = await session.execute(sa_select(User).where(User.id == user_id))
                user = user_res.scalars().first()
                if not user:
                    return
                msg_count = user.total_messages or 0

                # Determine funnel stage
                extra = user.extra_data or {}
                has_personal = extra.get("has_personal_signal", False)

                if msg_count >= 20 or has_personal:
                    stage = "emotional_connection"
                elif msg_count >= 10:
                    stage = "engagement"
                else:
                    stage = "hook"

                # Monetization override: if price inquiry or package interest
                if interaction_type == "price_inquiry" and msg_count >= 5:
                    stage = "monetization"
                # Stay at monetization once there
                lead_res = await session.execute(sa_select(Lead).where(Lead.user_id == user_id))
                lead = lead_res.scalars().first()
                if lead and lead.funnel_stage == "monetization":
                    stage = "monetization"

                points = POINTS.get(interaction_type, 1)

                if lead:
                    lead.funnel_stage = stage
                    lead.lead_score = min(100.0, (lead.lead_score or 0) + points)
                    lead.total_interactions = (lead.total_interactions or 0) + 1
                    lead.last_activity_at = _naive_utc()
                    score_bd = dict(lead.score_breakdown or {})
                    score_bd[interaction_type] = score_bd.get(interaction_type, 0) + points
                    lead.score_breakdown = score_bd
                    if stage in ("monetization",) and not lead.qualified:
                        lead.qualified = True
                        lead.qualified_at = _naive_utc()
                        lead.qualified_by = "ai"
                else:
                    lead = Lead(
                        user_id=user_id,
                        funnel_stage=stage,
                        lead_score=float(points),
                        total_interactions=1,
                        status="new",
                        score_breakdown={interaction_type: points},
                        last_activity_at=_naive_utc(),
                    )
                    session.add(lead)

                # Also sync lead_score to User table
                user.lead_score = lead.lead_score
                await session.commit()
        except Exception as e:
            logger.warning(f"_update_lead_funnel error: {e}")

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
