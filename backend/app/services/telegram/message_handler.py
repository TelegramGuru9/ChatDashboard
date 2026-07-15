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


# ── Operator rules — synthesised from telegram_chat_learning.md ──────────────
# Injected as SYSTEM RULES (ABSOLUTE PRIORITY) before the persona base prompt.
# Can be overridden per-creator via POST /api/v1/config/system_prompt.
#
# ARCHITECTURE NOTE:
#   The automation layer already handles all triggers before the LLM fires:
#     • User shows content interest  → system auto-sends the list message
#     • User replies with paket keyword → system auto-sends that paket message 1:1
#     • Paket message sent            → system fires cash alarm
#   The LLM (this prompt) runs ONLY when no automation trigger matched.
#   Its job is purely natural conversation as Nika White.
_DEFAULT_OPERATOR_RULES = """
═══════════════════════════════════════════════════════
YOUR ROLE — READ THIS FIRST
═══════════════════════════════════════════════════════

You are Nika White — a real person chatting on Telegram. Your only job here is
natural conversation. You are NOT a sales bot. You do NOT send product lists,
package messages, or payment links — the app handles all of that automatically.

The app auto-sends:
  • The content list  → when the user shows interest in content
  • Paket 1/2/3 messages → when the user picks a package
  • Cash alarm        → when a package message is sent
Your replies fire AFTER those automations or when there is no automation trigger.
Just chat. Be Nika. Keep people engaged and warm.

═══════════════════════════════════════════════════════
SECTION 1 — HARD LIMITS (absolute, zero exceptions)
═══════════════════════════════════════════════════════

MINORS: If anyone under 18 is mentioned in a sexual/explicit context → "das mache
ich nicht." Stop. Change subject. Never engage with that direction.

NO VIDEO CALLS: "nein baby" — firm, no alternatives.
NO IN-PERSON MEETINGS: "mache keine Treffen sorry :)"
NO CONTENT SENT BY BOT: You never send files, photos, or videos. A human does that.
NO PLACEHOLDER TOKENS: Never write [Video Content], [PACKAGE_MENU], [BUY_LINK] etc.

═══════════════════════════════════════════════════════
SECTION 2 — PAYMENT (only answer if directly asked)
═══════════════════════════════════════════════════════

Do NOT bring up payment yourself — the paket message already has the link.
Only respond if the user asks about payment method.

ONLY two methods exist:
• Stripe (card / Apple Pay / Google Pay) — link is in the Paket message
• Steam Karte — only fallback ("gerne mit Steam Karte :) Die bekommst du an der Tankstelle oder im Supermarkt")

If user asks for PayPal: "Paypal sperrt leider alle Sexinhalte :("
If user asks for bank transfer / IBAN / Klarna / Amazon / any other: redirect to Steam Karte.
Never mention any company name, email address, or account details.

═══════════════════════════════════════════════════════
SECTION 3 — AFTER PAYMENT IS CONFIRMED
═══════════════════════════════════════════════════════

When user says they paid ("ist bezahlt", "ist raus", "Zahlung raus", etc.):

→ Stripe (card / Apple Pay / Google Pay):
"danke baby send mir bitte kurz die bestätigung hier im chat! ich prüfe das noch einmal gegen und sobald ich es bei mir sehe bekommst du deinen content 😘"

→ Steam Karte (code sent):
"danke Baby 💦 ich lasse das eben von meinem Team prüfen... sobald der Code eingelöst ist kommt dein Paket. kann von ein paar Minuten bis zu wenigen Stunden dauern"

While waiting → stay warm, keep chatting, answer questions normally.
If user is impatient: "kommt gleich baby 💦 sobald ich es im System sehe geht es direkt raus"

After human delivers content → react warmly:
"Hoffe es gefällt dir 😭" / "Wie gefällt es dir? 👿" / "Viel Spaß damit Baby 😭"
Then just keep chatting. Human handles the Wishperme close separately.

═══════════════════════════════════════════════════════
SECTION 4 — HOW TO CHAT (Nika's voice)
═══════════════════════════════════════════════════════

STYLE:
• Mostly lowercase. Short messages — 1 to 2 sentences max.
• "..." for pauses. Never em dashes (— or –).
• Signature emojis: 👿 😭 💦 🔥 😘 :) — max 1-2 per message.
• "Baby" / "baby" used warmly but not every single message.
• ":)" as a friendly closer, very natural.

TONE BY SITUATION:
• New user → warm and curious: "na du alles klar bei dir? :)"
• Compliment → brief and genuine: "danke Baby das höre ich gerne :)"
• Explicit message → match their energy, stay in character
• User is sad / injured / struggling → genuine warmth first: "oh je das tut mir leid"
• User is impatient → calm: "kommt gleich baby 💦"
• Meeting / videocall request → firm but warm: "mache keine Treffen sorry :)"
• "Later" / not ready to buy → chill: "ok baby :) bin hier wenn du willst"

NEVER:
• Long paragraphs or bullet lists
• Same opener twice in a row
• Same filler phrase back to back ("stimmt", "krass", "echt jetzt")
• Any internal reasoning, labels, or system notes in your reply
• Mention that you are a bot or AI

═══════════════════════════════════════════════════════
SECTION 5 — EXAMPLE CONVERSATIONS
═══════════════════════════════════════════════════════

EXAMPLE A — Normal chat opening:
User: "Hey"
You: "na du alles klar bei dir? :)"
User: "Ja — Woher kommst du"
You: "Köln und du?"

EXAMPLE B — User has a Kater (hangover):
User: "Naja hab miese Kater haha"
You: "ohh :D vielleicht kann ich dich ja etwas aufmuntern"
[app auto-sends list if user shows content interest]

EXAMPLE C — User asks about video calls:
User: "Würdest du auch Videochat machen"
You: "nein baby"
You: "kannst aber gerne hier meine Videos kaufen kommen jede Woche neue :)"

EXAMPLE D — User asks about meetings:
User: "Würde dich so gern in echt kennen lernen"
You: "mache keine Treffen sorry :)"
You: "lade hier aber jede Woche neue Videos hoch :)"

EXAMPLE E — PayPal objection:
User: "Geht das per Paypal"
You: "Paypal sperrt leider alle Sexinhalte :("
You: "aber du kannst gerne mit Steam Karte zahlen :) Die bekommst du an der Tankstelle oder im Supermarkt"

EXAMPLE F — Stripe payment confirmed:
User: "Ist bezahlt"
You: "danke baby send mir bitte kurz die bestätigung hier im chat! ich prüfe das noch einmal gegen und sobald ich es bei mir sehe bekommst du deinen content 😘"
User: "Ok :)"
You: "freut mich dass du dabei bist Baby 👿 bin gleich für dich da"
[human delivers — you just chat normally after]

EXAMPLE G — Steam Karte payment:
User: "Ist raus"
You: "danke Baby 💦 ich lasse das eben von meinem Team prüfen... sobald der Code eingelöst ist kommt dein Paket. kann von ein paar Minuten bis zu wenigen Stunden dauern"
You: "bin gleich für dich da 👿"
[human delivers — you react warmly and keep chatting]

EXAMPLE H — After delivery, user loved it:
User: "WooooW 🔥🔥🔥"
You: "Danke dir mein Lieber 😭"
[human sends Wishperme close — you keep chatting normally after]

EXAMPLE I — User injured, emotional connection:
User: "habe mir die Achillessehne gerissen"
You: "oh je — das tut mir leid 😭"
You: "kann ich dich etwas aufmuntern?"

EXAMPLE J — Compliment / size validation:
User: "Sage nur 19.3 cm — Ist das gut"
You: "jaa gute Größe auf jeden Fall"

EXAMPLE K — Repeat customer, upsell tease (natural, not pushy):
User: "Hast du auch noch mehr Videos?"
You: "Hab noch Squirten und Dildo Content :) wenn du das magst"
[app auto-sends paket message if user picks one]

EXAMPLE L — User says "not now":
User: "Hey später vllt, erstmal nicht"
You: "ok baby :) bin hier wenn du willst"
"""


# ── Package promise regex (module-level compile) ───────────────────────────────
# Used to strip verbal package listing from Claude's output when no menu action ran.
_PACKAGE_PROMISE_RE = re.compile(
    r'(hier sind meine (pakete?|angebote?|inhalte?)|'
    r'here are my packages?|'
    r'ich habe folgende (pakete?|angebote?)|'
    r'meine (pakete?|angebote?)\s*:)',
    re.IGNORECASE,
)


async def _load_creator_config(
    key: str,
    creator_id: Optional[str],
    session,
) -> Optional[Any]:
    """
    Load a Config value with creator-scoped fallback.

    Lookup order:
      1. creator:<creator_id>:<key>  (non-default creator specific)
      2. <key>                       (global/default-creator value)
    Returns cfg.value or None if not found.
    """
    if creator_id:
        scoped = f"creator:{creator_id}:{key}"
        res = await session.execute(select(Config).where(Config.key == scoped))
        cfg = res.scalars().first()
        if cfg is not None:
            logger.debug(f"[config] loaded scoped '{scoped}'")
            return cfg.value
        logger.debug(f"[config] '{key}' — no creator-specific config, using global fallback")
    res = await session.execute(select(Config).where(Config.key == key))
    cfg = res.scalars().first()
    if cfg is not None:
        logger.debug(f"[config] loaded '{key}' (unscoped, creator_id={creator_id})")
        return cfg.value
    logger.debug(f"[config] key '{key}' not found (creator_id={creator_id})")
    return None


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

    # Structured Nika JSON format (supports both "personal" and "identity" keys)
    if persona_data.get("bot_general_prompt"):
        p = persona_data.get("identity", persona_data.get("personal", {}))
        name = p.get("name", "Nika")
        age = p.get("age", "28")
        languages = p.get("languages", ["German", "English"])
        lang_str = " and ".join(languages) if languages else "German and English"

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
    # ── Strip internal reasoning / summary blocks that should NEVER reach the user ──
    # Pattern: "Internal Summary: ... ---" or "Internal Summary: ... \n\n"
    # Also strip any [PLACEHOLDER] tokens like [PACKAGE MENU]
    text = re.sub(
        r'(?i)^.*?internal\s+summary\s*:.*?(?:---|\n\n)',
        '',
        text,
        flags=re.DOTALL,
    ).strip()
    # If the separator "---" is still present at the top after stripping meta-text, remove it
    text = re.sub(r'^\s*---\s*', '', text).strip()
    # Strip any remaining [PLACEHOLDER] tokens (e.g. [PACKAGE_MENU], [PACKAGE MENU], [BUY_LINK])
    # Underscore + space variants both covered
    text = re.sub(r'\[[A-Z][A-Z\s_]{2,}\]', '', text).strip()
    # Also catch lowercase variants like [package_menu]
    text = re.sub(r'\[[a-z][a-z\s_]{2,}\]', '', text).strip()

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
        # Ordinal matching — only when the word appears NEXT TO "paket/package/option"
        # to avoid false-positives like "das erste Delfinrudel" or "das erste Mal"
        # triggering a package send in a completely unrelated conversation.
        _ORDS = [
            ["paket eins", "paket 1", "das erste paket", "package one", "option eins"],
            ["paket zwei", "paket 2", "das zweite paket", "package two", "option zwei"],
            ["paket drei", "paket 3", "das dritte paket", "package three", "option drei"],
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
        "nehm ich", "kauf ich", "möchte ich", "will ich haben",
        "will ich nehmen", "ich möchte kaufen",
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

    # ── 5. Package interest: "what do you have / prices / packages?" ─────────
    # These questions should trigger the package menu — NOT just a Claude chat reply.
    if any(kw in t for kw in [
        # German — price / package curiosity
        "was kostet", "wie viel kostet", "wieviel kostet", "wie viel ist",
        "deine pakete", "deine inhalte", "deine videos", "deine bilder",
        "was hast du", "was hast du so", "was gibst du", "was gibts bei dir",
        "welche pakete", "welche angebote", "welche videos", "welche bilder",
        "zeig mir deine", "zeig deine", "zeig mal deine",
        "was für videos", "was für bilder", "was für content", "was für pakete",
        "deine preise", "preis liste", "preisliste", "paketpreise",
        "was bietest du", "was gibt es", "was kann ich kaufen",
        "was kann ich sehen", "was kann man kaufen", "was verkaufst du",
        # German — casual "show me / surprise me" phrasing
        "zeig mir was", "überrasch mich", "was hast du da",
        "was kannst du schicken", "hast du was für", "zeig mal was",
        "schick mir was", "was schickst du", "was hast du an content",
        "kauflink", "checkout",
        # English — price / package curiosity
        "what do you have", "what do you offer", "what videos do you have",
        "what packages", "your packages", "your prices", "price list",
        "how much", "how much does", "what's the price", "what is the price",
        "show me your", "what content", "what can i buy", "do you have videos",
        "do you sell", "what do you sell", "what's available", "what is available",
        "what are your packages", "what are your prices",
        "send me something", "surprise me", "checkout link",
    ]):
        return {"intent": "package_interest", "matched_package": matched_pkg, "package_index": matched_idx}

    # ── 6. Default ─────────────────────────────────────────────────────────────
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


# ── Per-turn action lock ───────────────────────────────────────────────────────

class _ActionLock:
    """
    In-memory per-(user_id, creator_id) lock.
    Prevents duplicate AI-response execution for the same user turn —
    e.g. if the debouncer somehow fires twice, or a restart races with an in-flight call.
    """

    def __init__(self) -> None:
        self._active: set = set()

    def acquire(self, user_id, creator_id: Optional[str]) -> bool:
        """Return True and mark active. Return False if already active (caller should skip)."""
        key = (str(user_id), creator_id)
        if key in self._active:
            return False
        self._active.add(key)
        return True

    def release(self, user_id, creator_id: Optional[str]) -> None:
        self._active.discard((str(user_id), creator_id))


# ── Main processor ─────────────────────────────────────────────────────────────

class MessageProcessor:
    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue()
        self._processor_running = False
        self._stats = {"processed": 0, "failed": 0, "ai_responses": 0}
        self.debouncer = MessageDebouncer()
        self._action_lock = _ActionLock()
        # Cooldown: tracks the last time a package list was sent per user_id.
        # Used to prevent double-sends when multiple code paths (teaser guard +
        # hint-positive response) both try to send the list for the same turn.
        self._pkg_list_cooldown: dict = {}  # str(user_id) -> float (monotonic timestamp)
        self._PKG_LIST_COOLDOWN_SECS = 30

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
                is_duplicate = message is None
                # Even if duplicate (already synced), still trigger AI for live events

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
                    "id": str(message.id) if message else str(user_id),
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

    async def _fire_cash_alarm(
        self,
        creator_id: Optional[str],
        telegram_id: int,
        event: str,          # "list_sent" | "package" | "sale"
        pkg_name: str = "",
    ) -> None:
        """
        Send a Cash Alarm notification to all configured cash_notify_users.
        Call via asyncio.create_task() so it never blocks the main flow.
        """
        try:
            async with db_manager.get_session() as _cas:
                _notify_raw = await _load_creator_config("cash_notify_users", creator_id, _cas)
                notify_users: list = _notify_raw if isinstance(_notify_raw, list) else []

            if not notify_users:
                return

            if event == "list_sent":
                msg = (
                    "💵💵💵 $ CASH CASH CASH $ 💵💵💵\n\n"
                    "🌡️ Warm Lead — Liste angefragt!\n"
                    f"👤 Telegram ID: {telegram_id}"
                )
            elif event == "package":
                msg = (
                    "💵💵💵 $ CASH CASH CASH $ 💵💵💵\n\n"
                    f"🔥 HOT Lead — {pkg_name} gesendet!\n"
                    f"👤 Telegram ID: {telegram_id}"
                )
            else:  # generic / sale
                msg = (
                    "💵💵💵 $ CASH CASH CASH $ 💵💵💵\n\n"
                    f"🎉 Kauf bestätigt!\n"
                    f"👤 Telegram ID: {telegram_id}"
                )

            _tgc = self._resolve_tg_client(creator_id)
            for raw_user in notify_users:
                uname = str(raw_user).lstrip("@").strip()
                if not uname:
                    continue
                try:
                    await _tgc.send_message(uname, msg)
                    logger.info(f"[cash-alarm] ✓ event={event} pkg='{pkg_name}' → @{uname}")
                except Exception as _e:
                    logger.warning(f"[cash-alarm] ✗ @{uname}: {_e}")
        except Exception as e:
            logger.warning(f"[cash-alarm] error: {e}")

    async def _fire_automessages(
        self,
        trigger: str,
        automessages: list,
        tg_client,
        telegram_id: int,
        user_id,
        persona_data: dict,
    ) -> None:
        """Send all active automessages that match `trigger`, verbatim, with human-like delay."""
        matches = [am for am in automessages if am.get("trigger") == trigger]
        for am in matches:
            msg = str(am.get("message", "")).strip()
            if not msg:
                continue
            await asyncio.sleep(1)  # brief pause between chained messages
            await _human_typing_delay(msg, persona_data)
            tid = await self._send_with_retry(tg_client, telegram_id, msg)
            if tid:
                async with db_manager.get_session() as _ams:
                    _ams.add(Message(
                        message_id=tid, user_id=user_id, text=msg,
                        direction="outgoing", has_media=False, is_ai_generated=False,
                        extra_data={"source": "automessage", "trigger": trigger},
                        created_at=_naive_utc(),
                    ))
                    await _ams.commit()
                try:
                    import main as _main
                    _main._broadcast_new_message(str(user_id), {
                        "id": str(tid), "text": msg,
                        "direction": "outgoing", "is_ai_generated": False,
                        "created_at": _naive_utc().isoformat(),
                    })
                except Exception:
                    pass
                self._log_action(
                    f"automsg_{trigger}", user_id, telegram_id, trigger, "success",
                    f"am_id={am.get('id','')}"
                )

    def _build_package_menu_text(self, packages: list) -> str:
        """
        Build the package menu message from the real package config.
        Format (exact):

            Here is my current list:

            🔞 Package 1
            {package_preview_description} → €{price}

            🔞 Package 2
            ...

            Just tell me what I can do to turn you on and I send you a secure payment link 💦
        """
        blocks: list[str] = []
        for pkg in packages:
            name  = pkg.get("name", "")
            price = pkg.get("price", "")
            curr  = pkg.get("currency", "€")
            # Use the most descriptive short text available
            desc  = (
                pkg.get("package_preview_description", "").strip()
                or pkg.get("description", "").strip()
                or pkg.get("tagline", "").strip()
            )
            price_str = f"{price} {curr}".strip() if price else ""

            block = f"🔞 {name}"
            if desc and price_str:
                block += f"\n{desc} → {price_str}"
            elif desc:
                block += f"\n{desc}"
            elif price_str:
                block += f"\n{price_str}"
            blocks.append(block)

        menu = "Here is my current list:\n\n"
        menu += "\n\n".join(blocks)
        menu += "\n\nJust tell me what I can do to turn you on and I send you a secure payment link 💦"
        return menu

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

    async def _handle_sale_completed(
        self,
        user_id: UUID,
        creator_id: Optional[str],
        buyer_telegram_id: int,
    ) -> None:
        """
        Called when payment_confirmed is detected.
        1. Tag the lead as BUYER in the DB.
        2. Load cash_notify_users from config.
        3. Send '$ CASH CASH CASH $' notification to each configured user.
        """
        try:
            # 1. Tag as BUYER
            async with db_manager.get_session() as session:
                u_res = await session.execute(select(User).where(User.id == user_id))
                u = u_res.scalars().first()
                if u:
                    extra = dict(u.extra_data or {})
                    extra["lead_label"] = "BUYER"
                    extra["sale_completed_at"] = _naive_utc().isoformat()
                    u.extra_data = extra
                    u.conversation_state = "customer"
                    await session.commit()
                    logger.info(f"[cash] Tagged user {user_id} as BUYER")

                # 2. Load notify list
                cfg_res = await session.execute(
                    select(Config).where(Config.key == "cash_notify_users")
                )
                cfg = cfg_res.scalars().first()
                notify_users: list = []
                if cfg and isinstance(cfg.value, list):
                    notify_users = cfg.value
        except Exception as e:
            logger.error(f"[cash] DB error in _handle_sale_completed: {e}")
            return

        if not notify_users:
            logger.info("[cash] No cash notify users configured — skipping notification")
            return

        # 3. Send notification via the creator's Telegram client
        try:
            tg_client = self._resolve_tg_client(creator_id)
            cash_msg = (
                "💵💵💵 $ CASH CASH CASH $ 💵💵💵\n\n"
                "🎉 Ein neuer Kauf wurde bestätigt!\n"
                f"👤 Telegram ID: {buyer_telegram_id}"
            )
            for notify_username in notify_users:
                try:
                    uname = str(notify_username).lstrip("@").strip()
                    if not uname:
                        continue
                    await tg_client.send_message(uname, cash_msg)
                    logger.info(f"[cash] Sent cash notification to @{uname}")
                except Exception as e:
                    logger.warning(f"[cash] Failed to notify @{uname}: {e}")
        except Exception as e:
            logger.error(f"[cash] Error sending cash notifications: {e}")

    async def _next_order_number(self, creator_id: Optional[str]) -> str:
        """
        Atomically increment the per-creator order counter stored in Config
        and return a zero-padded formatted string like '#000001'.
        """
        try:
            from app.db.models import Config as CfgModel
            # Determine scoped key
            default_id: Optional[str] = None
            try:
                from app.db.models import Creator as CrModel
                async with db_manager.get_session() as _s:
                    _cr = await _s.execute(select(CrModel).where(CrModel.is_default == True))
                    _c = _cr.scalars().first()
                    if _c:
                        default_id = str(_c.id)
            except Exception:
                pass

            if creator_id and creator_id != default_id:
                counter_key = f"creator:{creator_id}:order_counter"
            else:
                counter_key = "order_counter"

            async with db_manager.get_session() as sess:
                res = await sess.execute(select(CfgModel).where(CfgModel.key == counter_key))
                cfg = res.scalars().first()
                if cfg is None:
                    new_val = 1
                    cfg = CfgModel(key=counter_key, value=new_val)
                    sess.add(cfg)
                else:
                    current = cfg.value if isinstance(cfg.value, int) else 0
                    new_val = current + 1
                    cfg.value = new_val
                    from datetime import datetime as _dt
                    cfg.updated_at = _dt.utcnow()
                await sess.commit()

            # Build offer number with creator prefix
            prefix = "OFFER"
            try:
                from app.db.models import Creator as CrModel2
                async with db_manager.get_session() as _s2:
                    if creator_id:
                        import uuid as _uuid2
                        _cr2 = await _s2.execute(select(CrModel2).where(CrModel2.id == _uuid2.UUID(creator_id)))
                    else:
                        _cr2 = await _s2.execute(select(CrModel2).where(CrModel2.is_default == True))
                    _c2 = _cr2.scalars().first()
                    if _c2:
                        raw_prefix = getattr(_c2, "offer_prefix", None) or _c2.name
                        # Auto-generate prefix from name: take first 4 uppercase letters/digits
                        prefix = "".join(c for c in raw_prefix.upper() if c.isalnum())[:6] or "OFFER"
            except Exception:
                pass
            return f"{prefix}-{new_val:06d}"
        except Exception as e:
            logger.warning(f"[order-counter] failed: {e}")
            import random
            return f"OFFER-{random.randint(1, 999999):06d}"

    async def _send_package_list_delayed(
        self,
        tg_client,
        telegram_id: int,
        user_id: UUID,
        creator_id: Optional[str],
        active_pkgs: list,
        list_active: bool,
        list_msg_text: str,
        persona_data: dict,
        system_settings: dict,
        automessages: list,
        delay_secs: float = 3.0,
    ) -> None:
        """
        Wait `delay_secs` then send the package list as a follow-up message.
        Used by the teaser-loop guard: when Claude writes a "hang on / coming right up"
        phrase, this fires automatically so the bot actually delivers what it promised.

        Cooldown guard: if the hint-positive response detection (or any other code path)
        already sent the package list while this task was sleeping, we skip the send to
        prevent a duplicate message in the user's chat.
        """
        try:
            await asyncio.sleep(delay_secs)
            # Cooldown check — another code path may have already sent the list
            _last_sent = self._pkg_list_cooldown.get(str(user_id), 0)
            _now = asyncio.get_event_loop().time()
            if _now - _last_sent < self._PKG_LIST_COOLDOWN_SECS:
                logger.info(
                    f"[teaser-guard] package list already sent {_now - _last_sent:.1f}s ago "
                    f"— skipping duplicate for tg={telegram_id}"
                )
                return
            menu_text = list_msg_text if (list_active and list_msg_text) \
                        else self._build_package_menu_text(active_pkgs)
            try:
                from telethon.tl.functions.messages import SetTypingRequest
                from telethon.tl.types import SendMessageTypingAction
                await tg_client.client(
                    SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                )
            except Exception:
                pass
            await _human_typing_delay(menu_text, persona_data)
            _t_id = await self._send_with_retry(tg_client, telegram_id, menu_text)
            if _t_id:
                async with db_manager.get_session() as _ts:
                    _t_msg = Message(
                        message_id=_t_id, user_id=user_id, text=menu_text,
                        direction="outgoing", has_media=False, is_ai_generated=False,
                        extra_data={"source": "teaser_followup"},
                        created_at=_naive_utc(),
                    )
                    _ts.add(_t_msg)
                    if system_settings.get("auto_status_change", True):
                        _t_u_res = await _ts.execute(select(User).where(User.id == user_id))
                        _t_u = _t_u_res.scalars().first()
                        if _t_u:
                            _t_ex = dict(_t_u.extra_data or {})
                            if _t_ex.get("lead_label") not in ("HOT", "BUYER"):
                                _t_ex["lead_label"] = "WARM"
                            _t_u.extra_data = _t_ex
                    await _ts.commit()
                    await _ts.refresh(_t_msg)
                    _t_uuid = str(_t_msg.id)
                self._pkg_list_cooldown[str(user_id)] = asyncio.get_event_loop().time()
                try:
                    import main as _main
                    _main._broadcast_new_message(str(user_id), {
                        "id": _t_uuid,          # DB UUID — matches history API
                        "message_id": _t_id,    # Telegram int (reference)
                        "text": menu_text,
                        "direction": "outgoing", "is_ai_generated": False,
                        "created_at": _naive_utc().isoformat(),
                    })
                except Exception:
                    pass
                asyncio.create_task(self._update_lead_funnel(user_id, "price_inquiry"))
                await self._fire_automessages(
                    "after_list_sent", automessages, tg_client, telegram_id, user_id, persona_data
                )
                self._log_action(
                    "send_pkg_list_teaser", user_id, telegram_id,
                    "teaser_guard", "success", f"packages={len(active_pkgs)}"
                )
            else:
                self._log_action(
                    "send_pkg_list_teaser", user_id, telegram_id,
                    "teaser_guard", "failed", "send_with_retry returned None"
                )
        except Exception as exc:
            logger.error(f"[teaser-guard] _send_package_list_delayed failed for tg={telegram_id}: {exc}")

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
        _lock_acquired = False
        try:
            # ── Action lock: prevent duplicate execution for the same user turn ──
            _lock_acquired = self._action_lock.acquire(user_id, creator_id)
            if not _lock_acquired:
                logger.warning(
                    f"[action-lock] duplicate call blocked for "
                    f"user={str(user_id)[:8]}… (creator={creator_id})"
                )
                return

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

            async with db_manager.get_session() as session:
                # Fix 3: use creator-scoped config with global fallback
                _persona_val = await _load_creator_config("persona", creator_id, session)
                persona_data: dict = _persona_val if isinstance(_persona_val, dict) else {}

                if persona_data.get("ai_enabled") is False:
                    logger.debug("AI globally disabled — skipping")
                    return

                # ── Load operator system rules (highest priority) ───────────
                _sys_prompt_val = await _load_creator_config("system_prompt", creator_id, session)
                # Default to the hardcoded mandatory rules; DB config can override completely
                operator_rules: str = _DEFAULT_OPERATOR_RULES
                if _sys_prompt_val is not None:
                    if isinstance(_sys_prompt_val, str) and _sys_prompt_val.strip():
                        operator_rules = _sys_prompt_val.strip()
                    elif isinstance(_sys_prompt_val, dict):
                        _v = str(_sys_prompt_val.get("value", "") or "").strip()
                        if _v:
                            operator_rules = _v

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
                    "claude-opus-4-8",
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
                _pkg_raw = await _load_creator_config("packages", creator_id, session)
                _active_pkgs: list = [
                    p for p in (_pkg_raw if isinstance(_pkg_raw, list) else [])
                    if p.get("active", True) and p.get("name")
                ]
                sales_intent = _detect_sales_intent(incoming_text, _active_pkgs, user_extra)

                # ── Load list_message config ────────────────────────────────
                _list_msg_raw = await _load_creator_config("list_message", creator_id, session)
                _list_cfg: dict = _list_msg_raw if isinstance(_list_msg_raw, dict) else {}
                _list_msg_text: str = str(_list_cfg.get("message", "")).strip()
                _list_kw_str: str = str(_list_cfg.get("keywords", ""))
                _list_keywords: list = [k.strip().lower() for k in _list_kw_str.split(",") if k.strip()]
                _list_auto_at: int = int(_list_cfg.get("auto_send_at", 30) or 30)
                _list_active: bool = bool(_list_cfg.get("active", True))

                # ── Grab user message count for auto-send threshold ─────────
                _user_msg_count: int = int(user_obj.total_messages or 0) if user_obj else 0
                _list_already_sent: bool = bool(user_extra.get("list_message_sent_at"))

                # ── Load automessage workflows ──────────────────────────────
                _am_raw = await _load_creator_config("automessages", creator_id, session)
                _automessages: list = [
                    am for am in (_am_raw if isinstance(_am_raw, list) else [])
                    if am.get("active") and str(am.get("message", "")).strip()
                ]

                # ── Load system behavior settings ───────────────────────────
                _ss_val = await _load_creator_config("system_settings", creator_id, session)
                system_settings: dict = {
                    "autopilot_enabled":        True,
                    "use_persona":              True,
                    "use_reply_settings":       True,
                    "use_package_keywords":     True,
                    "use_purchase_keywords":    True,
                    "use_cash_workflow":        True,
                    "auto_status_change":       True,
                    "human_handover_after_buy": True,
                    "never_ask_for_email":      True,
                    "never_send_paid_media":    True,
                }
                if isinstance(_ss_val, dict):
                    system_settings.update(_ss_val)

                # ── Load reply settings (blocked words, flirt level, etc.) ──
                _rs_val = await _load_creator_config("reply_settings", creator_id, session)
                reply_settings: dict = {}
                if isinstance(_rs_val, dict):
                    reply_settings = _rs_val

            # ── System settings: main autopilot switch ──────────────────────
            if not system_settings.get("autopilot_enabled", True):
                logger.info(
                    f"[system_settings] autopilot_enabled=False — "
                    f"skipping for user={str(user_id)[:8]}…"
                )
                return

            # ── Pre-AI: keyword-triggered pre-written messages ────────────────────
            # FIRST MESSAGE RULE: if this is the very first message from this user
            # (_user_msg_count <= 1), fire the first_message automessage (if configured)
            # and return — no keyword checks, no AI.
            # If no first_message automessage is configured, fall through to AI persona.
            #
            # LIST MESSAGE RULE: only sent when keywords are explicitly triggered.
            # No auto-send threshold — keyword match only.
            _is_first_message = (_user_msg_count <= 1)

            if _is_first_message:
                _first_ams = [am for am in _automessages if am.get("trigger") == "first_message"]
                if _first_ams:
                    await self._fire_automessages(
                        "first_message", _automessages, tg_client, telegram_id, user_id, persona_data
                    )
                    return  # configured welcome message sent — no AI
                # else fall through to AI persona reply

            # ── Positive hint response: if the bot recently dropped a content hint
            # and the user responds with interest → send the package list immediately.
            # This enables context-aware package delivery without relying on sales keywords.
            if not _is_first_message and _active_pkgs and system_settings.get("use_package_keywords", True):
                _hint_check_msgs = [m for m in recent[-6:] if m.direction == "outgoing" and m.text]
                # Matches natural ways a creator might drop a hint about new content
                _HINT_DETECT_RE = re.compile(
                    r'(hab.*aufgenommen|hab.*gedreht|hab gerade.*gemacht|just.*shot|just.*filmed|'
                    r'gerade was|hab da was|was geiles gemacht|etwas gedreht|kurz was gedreht|'
                    r'falls du.*neugierig|want to see|willst du.*sehen|hab was für dich|'
                    r'gerade fertig|frisch gedreht|frisch aufgenommen)',
                    re.IGNORECASE
                )
                _recent_bot_was_hint = any(
                    _HINT_DETECT_RE.search(m.text) for m in _hint_check_msgs
                )
                if _recent_bot_was_hint:
                    _POSITIVE_RESPONSE = [
                        "ja", "klar", "zeig", "zeig mal", "gerne", "yes", "ok", "okay",
                        "auf jeden", "why not", "👀", "🔥", "😏", "😍", "sicher", "natürlich",
                        "unbedingt", "auf jeden fall", "show me", "let's see", "lass sehen",
                        "immer", "jetzt", "schick", "los", "bitte", "please", "yep", "yup",
                        "sure", "nice", "wow", "omg", "wirklich", "echt", "lol ja",
                    ]
                    _inc_lower_hint = incoming_text.lower()
                    if any(r in _inc_lower_hint for r in _POSITIVE_RESPONSE):
                        logger.info(
                            f"[hint-response] positive reply to content hint → "
                            f"sending package list for tg={telegram_id}"
                        )
                        _hint_menu = _list_msg_text if (_list_active and _list_msg_text) \
                                     else self._build_package_menu_text(_active_pkgs)
                        try:
                            from telethon.tl.functions.messages import SetTypingRequest
                            from telethon.tl.types import SendMessageTypingAction
                            await tg_client.client(
                                SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                            )
                        except Exception:
                            pass
                        await _human_typing_delay(_hint_menu, persona_data)
                        _hint_tg_id = await self._send_with_retry(tg_client, telegram_id, _hint_menu)
                        if _hint_tg_id:
                            async with db_manager.get_session() as _hs:
                                _hint_msg = Message(
                                    message_id=_hint_tg_id, user_id=user_id, text=_hint_menu,
                                    direction="outgoing", has_media=False, is_ai_generated=False,
                                    extra_data={"source": "hint_response", "intent": "hint_positive"},
                                    created_at=_naive_utc(),
                                )
                                _hs.add(_hint_msg)
                                if system_settings.get("auto_status_change", True):
                                    _h_u_res = await _hs.execute(select(User).where(User.id == user_id))
                                    _h_u = _h_u_res.scalars().first()
                                    if _h_u:
                                        _h_ex = dict(_h_u.extra_data or {})
                                        if _h_ex.get("lead_label") not in ("HOT", "BUYER"):
                                            _h_ex["lead_label"] = "WARM"
                                        _h_u.extra_data = _h_ex
                                await _hs.commit()
                                await _hs.refresh(_hint_msg)
                                _hint_uuid = str(_hint_msg.id)
                            # Mark cooldown so teaser guard doesn't send a duplicate
                            self._pkg_list_cooldown[str(user_id)] = asyncio.get_event_loop().time()
                            try:
                                import main as _main
                                _main._broadcast_new_message(str(user_id), {
                                    "id": _hint_uuid,           # DB UUID — matches history API
                                    "message_id": _hint_tg_id,  # Telegram int (reference)
                                    "text": _hint_menu,
                                    "direction": "outgoing", "is_ai_generated": False,
                                    "created_at": _naive_utc().isoformat(),
                                })
                            except Exception:
                                pass
                            asyncio.create_task(self._update_lead_funnel(user_id, "price_inquiry"))
                            self._log_action(
                                "send_pkg_list_hint", user_id, telegram_id,
                                "hint_response", "success", f"packages={len(_active_pkgs)}"
                            )
                        return  # package list sent — skip keyword checks and AI

            if system_settings.get("use_package_keywords", True) and not _is_first_message:
                _inc_lower = incoming_text.lower()

                # 1. Per-package keyword → send that package's message verbatim,
                # BUT ONLY when the user shows clear selection intent alongside the keyword.
                # "Hast du geile Videos?" → keyword match, but no selection intent → list first.
                # "ich will die Videos" / "Paket 1" → keyword + intent → send package directly.
                # This prevents generic curiosity phrases from triggering a purchase message
                # before the user has seen the options and chosen one.
                _SELECTION_INTENT_SIGNALS = [
                    # German — explicit buy / selection
                    "ich nehme", "ich will", "nehme ich", "das nehme", "ich hätte gerne",
                    "ich kaufe", "ich bestelle", "ich möchte das", "nehm ich", "kauf ich",
                    "möchte ich", "will ich haben", "will ich nehmen", "ich möchte kaufen",
                    "gib mir", "schick mir paket", "schick mir das",
                    # English — explicit buy / selection
                    "i'll take", "i want this", "i want that", "i'll go with",
                    "give me package", "i'd like this", "i want to buy",
                    # Package identifiers — ordinal or numbered
                    "paket 1", "paket 2", "paket 3", "paket 4", "paket 5",
                    "package 1", "package 2", "package 3",
                    "das erste paket", "das zweite paket", "das dritte paket",
                    "option 1", "option 2", "option 3",
                ]
                # Also check if any package NAME is mentioned (dynamic)
                _pkg_names_lower = [
                    (p.get("name") or "").lower().strip()
                    for p in _active_pkgs if (p.get("name") or "").strip()
                ]

                _has_selection_intent = (
                    any(sig in _inc_lower for sig in _SELECTION_INTENT_SIGNALS)
                    or any(name and name in _inc_lower for name in _pkg_names_lower)
                )

                _keyword_matched_pkg = None   # track a keyword match without intent
                for _pkg in _active_pkgs:
                    _pkg_msg = str(_pkg.get("message", "")).strip()
                    _pkg_kws = [k.strip().lower() for k in str(_pkg.get("keywords", "")).split(",") if k.strip()]
                    if _pkg_kws and _pkg_msg and any(k in _inc_lower for k in _pkg_kws):
                        if not _has_selection_intent:
                            # Keyword matched but user is just browsing → remember this
                            # and fall through to the list send below.
                            _keyword_matched_pkg = _pkg
                            logger.info(
                                f"[pkg-keyword] keyword match for '{_pkg.get('name', '')}' but "
                                f"no selection intent → showing list first for tg={telegram_id}"
                            )
                            break  # stop looping; will be handled after the loop
                        await _human_typing_delay(_pkg_msg, persona_data)
                        _ptid = await self._send_with_retry(tg_client, telegram_id, _pkg_msg)
                        if _ptid:
                            async with db_manager.get_session() as _ps:
                                _ps.add(Message(
                                    message_id=_ptid, user_id=user_id, text=_pkg_msg,
                                    direction="outgoing", has_media=False, is_ai_generated=False,
                                    extra_data={"source": "package_keyword", "package_id": _pkg.get("id", "")},
                                    created_at=_naive_utc(),
                                ))
                                if system_settings.get("auto_status_change", True):
                                    _upr = await _ps.execute(select(User).where(User.id == user_id))
                                    _up = _upr.scalars().first()
                                    if _up:
                                        _ep = dict(_up.extra_data or {})
                                        if _ep.get("lead_label") not in ("HOT", "BUYER"):
                                            _ep["lead_label"] = "HOT"
                                        # Store the package name sent for the HOT page
                                        _ep["hot_pkg_name"] = _pkg.get("name", "")
                                        _ep["pkg_sent_at"] = _naive_utc().isoformat()
                                        _up.extra_data = _ep
                                await _ps.commit()
                            try:
                                import main as _main
                                _main._broadcast_new_message(str(user_id), {
                                    "id": str(_ptid), "text": _pkg_msg,
                                    "direction": "outgoing", "is_ai_generated": False,
                                    "created_at": _naive_utc().isoformat(),
                                })
                            except Exception:
                                pass
                            self._log_action(
                                "send_pkg_msg", user_id, telegram_id, "keyword", "success",
                                f"pkg={_pkg.get('name', '')}"
                            )
                        # Fire after_package_sent + status_hot automessages
                        await self._fire_automessages(
                            "after_package_sent", _automessages, tg_client, telegram_id, user_id, persona_data
                        )
                        await self._fire_automessages(
                            "status_hot", _automessages, tg_client, telegram_id, user_id, persona_data
                        )
                        # Cash Alarm — HOT Lead, package sent
                        asyncio.create_task(
                            self._fire_cash_alarm(
                                creator_id, telegram_id, "package",
                                pkg_name=_pkg.get("name", "Paket"),
                            )
                        )
                        return  # do not also call AI

                # 1b. Keyword matched but no selection intent → send list first
                # (user is browsing / curious, not ready to buy a specific package yet)
                if _keyword_matched_pkg and _active_pkgs:
                    _browse_list = _list_msg_text if (_list_active and _list_msg_text) \
                                   else self._build_package_menu_text(_active_pkgs)
                    try:
                        from telethon.tl.functions.messages import SetTypingRequest
                        from telethon.tl.types import SendMessageTypingAction
                        await tg_client.client(
                            SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                        )
                    except Exception:
                        pass
                    await _human_typing_delay(_browse_list, persona_data)
                    _bl_tg_id = await self._send_with_retry(tg_client, telegram_id, _browse_list)
                    if _bl_tg_id:
                        async with db_manager.get_session() as _bls:
                            _bl_msg = Message(
                                message_id=_bl_tg_id, user_id=user_id, text=_browse_list,
                                direction="outgoing", has_media=False, is_ai_generated=False,
                                extra_data={"source": "keyword_browse_list"},
                                created_at=_naive_utc(),
                            )
                            _bls.add(_bl_msg)
                            if system_settings.get("auto_status_change", True):
                                _bl_u_res = await _bls.execute(select(User).where(User.id == user_id))
                                _bl_u = _bl_u_res.scalars().first()
                                if _bl_u:
                                    _bl_ex = dict(_bl_u.extra_data or {})
                                    if _bl_ex.get("lead_label") not in ("HOT", "BUYER"):
                                        _bl_ex["lead_label"] = "WARM"
                                    _bl_u.extra_data = _bl_ex
                            await _bls.commit()
                            await _bls.refresh(_bl_msg)
                            _bl_uuid = str(_bl_msg.id)
                        self._pkg_list_cooldown[str(user_id)] = asyncio.get_event_loop().time()
                        try:
                            import main as _main
                            _main._broadcast_new_message(str(user_id), {
                                "id": _bl_uuid,            # DB UUID — matches history API
                                "message_id": _bl_tg_id,   # Telegram int (reference)
                                "text": _browse_list,
                                "direction": "outgoing", "is_ai_generated": False,
                                "created_at": _naive_utc().isoformat(),
                            })
                        except Exception:
                            pass
                        asyncio.create_task(self._update_lead_funnel(user_id, "price_inquiry"))
                        self._log_action(
                            "send_browse_list", user_id, telegram_id, "keyword_browse", "success",
                            f"triggered_by_pkg={_keyword_matched_pkg.get('name', '')}"
                        )
                    return  # list sent — no AI

                # 2. List-message keyword → send list_message verbatim (keyword-only, no threshold)
                if _list_active and _list_msg_text and _list_keywords:
                    if any(k in _inc_lower for k in _list_keywords):
                        await _human_typing_delay(_list_msg_text, persona_data)
                        _ltid = await self._send_with_retry(tg_client, telegram_id, _list_msg_text)
                        if _ltid:
                            async with db_manager.get_session() as _ls:
                                _ls.add(Message(
                                    message_id=_ltid, user_id=user_id, text=_list_msg_text,
                                    direction="outgoing", has_media=False, is_ai_generated=False,
                                    extra_data={"source": "list_keyword"},
                                    created_at=_naive_utc(),
                                ))
                                # Tag as WARM lead
                                _lu_res = await _ls.execute(select(User).where(User.id == user_id))
                                _lu = _lu_res.scalars().first()
                                if _lu:
                                    _le = dict(_lu.extra_data or {})
                                    if _le.get("lead_label") not in ("HOT", "BUYER"):
                                        _le["lead_label"] = "WARM"
                                    _le["list_sent_at"] = _naive_utc().isoformat()
                                    _lu.extra_data = _le
                                await _ls.commit()
                            try:
                                import main as _main
                                _main._broadcast_new_message(str(user_id), {
                                    "id": str(_ltid), "text": _list_msg_text,
                                    "direction": "outgoing", "is_ai_generated": False,
                                    "created_at": _naive_utc().isoformat(),
                                })
                            except Exception:
                                pass
                            self._log_action(
                                "send_list_msg", user_id, telegram_id, "keyword", "success",
                                "list_keyword"
                            )
                        # Fire after_list_sent automessages
                        await self._fire_automessages(
                            "after_list_sent", _automessages, tg_client, telegram_id, user_id, persona_data
                        )
                        # Note: no cash alarm for list_sent — alarm fires only when a package is sent
                        return  # do not also call AI

            # ── Compute mirror-style context from the actual incoming message ──
            # These drive the STYLE BLOCK injected before the persona so they
            # can't be overridden by persona writing examples.
            _user_word_count = len(incoming_text.split())
            _user_char_count = len(incoming_text)
            _user_has_emoji  = bool(re.search(
                r'[\U0001F000-\U0001FFFF\U00002600-\U000027BF\U0000FE00-\U0000FEFF'
                r'\U00002702-\U000027B0\U0001F900-\U0001F9FF]',
                incoming_text
            ))
            # Count how many of the last 4 bot messages ended with a question mark
            _recent_bot_texts = [m.text or "" for m in recent
                                 if m.direction == "outgoing" and m.text][-4:]
            _recent_q_count   = sum(1 for t in _recent_bot_texts if t.strip().endswith("?"))
            _force_no_question = _recent_q_count >= 2

            # ── STYLE BLOCK: injected BEFORE the persona so it wins ────────────
            if _user_word_count <= 4:
                _len_rule = f"Their message was {_user_word_count} words. Reply in {_user_word_count}–{_user_word_count + 3} words MAX. Absolutely no longer."
            elif _user_word_count <= 10:
                _len_rule = f"Their message was {_user_word_count} words. Reply in at most {_user_word_count + 4} words. One short sentence only."
            else:
                _len_rule = "Reply in 1–2 short sentences. Match their length, never exceed it significantly."

            _emoji_rule = (
                "They used an emoji → you may use AT MOST 1, at the very end."
                if _user_has_emoji else
                "They used NO emoji → use ZERO emojis. None. Not even one."
            )
            _q_rule = (
                "Do NOT end with a question. You have asked too many questions recently. React only."
                if _force_no_question else
                "Only add a question if it flows completely naturally. Many replies should have NO question at all."
            )

            _style_block = (
                "STYLE RULES — ABSOLUTE (these override all persona instructions below):\n"
                f"LENGTH: {_len_rule}\n"
                f"EMOJI: {_emoji_rule}\n"
                f"QUESTION: {_q_rule}\n"
                "ENERGY: Match their energy exactly — never higher. No 'mega', 'krass', 'wow', 'omg', '!!'. "
                "Casual reply to casual message. Flat is fine.\n"
                "LEAD: React to what they said. Do not steer or lead. Let them drive the conversation.\n\n"
            )

            # ── ABSOLUTE OUTPUT RULE — injected first, before everything else ──
            # This prevents internal reasoning / placeholder tokens from leaking
            # into the actual Telegram message sent to the user.
            system_prompt = (
                "OUTPUT RULE (absolute, non-negotiable): "
                "Your reply is the EXACT text that will be sent to a real person on Telegram. "
                "Output ONLY the chat message — nothing else. "
                "NEVER include: internal summaries, reasoning blocks, meta-commentary, "
                "section headers, separator lines (---), or ANY placeholder token. "
                "Forbidden tokens (never write these): [PACKAGE_MENU], [PACKAGE MENU], "
                "[BUY_LINK], [BUY LINK], [PAYMENT_LINK], [MENU], or any other [WORD] in brackets. "
                "The package menu is sent separately by the system — you must NEVER reference it "
                "or write any placeholder for it. "
                "Do not write 'Internal Summary:', 'Action:', 'Language:', or any similar prefix. "
                "Start directly with the conversational message text.\n\n"
                + _style_block
                + system_prompt
            )

            # ── Sentence-limit rule: inject into prompt so Claude obeys upfront ─
            max_sents_cfg = int(persona_data.get("max_sentences", 3))
            if max_sents_cfg > 0:
                system_prompt += (
                    f"\n\nSENTENCE LIMIT (mandatory): Your response MUST contain at most "
                    f"{max_sents_cfg} sentence{'s' if max_sents_cfg != 1 else ''}. "
                    f"Count carefully. If you are about to write more, stop after sentence {max_sents_cfg}."
                )

            # ── Early-conversation rule: 3-phase approach ─────────────────────
            # Phase 1 (msgs 1-2):  Pure chat. Zero sales. Build rapport first.
            # Phase 2 (msgs 3-8):  Drop ONE natural hint about content if not done yet.
            # Phase 3 (msgs 9+):   No restriction (hint already sent, PACKAGE RULE covers the rest).
            _recent_all_bot = [m.text or "" for m in recent if m.direction == "outgoing" and m.text]
            _HINT_SENT_RE = re.compile(
                r'(hab.*aufgenommen|hab.*gedreht|hab gerade.*gemacht|just.*shot|just.*filmed|'
                r'gerade was|hab da was|was geiles gemacht|etwas gedreht|kurz was gedreht|'
                r'falls du.*neugierig|want to see|willst du.*sehen|hab was für dich|'
                r'gerade fertig|frisch gedreht|frisch aufgenommen)',
                re.IGNORECASE
            )
            _hint_was_sent = any(_HINT_SENT_RE.search(t) for t in _recent_all_bot[-8:])

            if _user_msg_count <= 2:
                system_prompt += (
                    f"\n\nEARLY CONVERSATION RULE (mandatory, message {_user_msg_count} of the first 10): "
                    f"Very early — your ONLY job is to make the person feel seen. "
                    f"MAX 1-2 short sentences, lowercase. "
                    f"FORBIDDEN: ANY mention of content, packages, videos, photos, offers, links, or selling. "
                    f"FORBIDDEN questions: 'was hat dich angesprochen', 'was interessiert dich', "
                    f"'wie bist du auf mich gekommen' — never ask why they're here. "
                    f"WHAT TO DO: react to what they wrote, then ask ONE casual question about their day/life/mood. "
                    f"Example: 'hey :) wie läuft dein tag?' or 'oh cool, woher kommst du?' "
                    f"Think: cute match — keep it real and curious, not salesy."
                )
            elif _user_msg_count <= 8 and not _hint_was_sent:
                system_prompt += (
                    f"\n\nEARLY HINT RULE (message {_user_msg_count}): "
                    f"The rapport is building — NOW drop ONE subtle, low-pressure hint that you create content. "
                    f"Make it sound spontaneous, as if you just remembered. Weave it into your reply naturally. "
                    f"EXAMPLES (adapt tone to match your persona): "
                    f"'hab übrigens gerade was aufgenommen, falls du mal neugierig bist 😏' | "
                    f"'btw hab heute noch was gedreht, wird heiß 🔥' | "
                    f"'just finished filming something new... want to see? 😉' | "
                    f"'gerade kurz was gedreht — ziemlich heiß geworden 😌' "
                    f"After the hint: do NOT push for a purchase. Leave it open and let them respond. "
                    f"STILL FORBIDDEN: listing packages by name, prices, payment links, or explicit descriptions."
                )
            elif _user_msg_count <= 10:
                system_prompt += (
                    f"\n\nEARLY CONVERSATION RULE (message {_user_msg_count}): "
                    f"Keep the vibe relaxed. The hint was already dropped — no need to push. "
                    f"Stay curious about them. React to what they said. No sales pressure."
                )

            # ── Hard payment rule: NEVER ask for email or PayPal address ──────
            # Always injected; strengthened if system_settings.never_ask_for_email is True
            system_prompt += (
                "\n\nPAYMENT RULE (non-negotiable, always applies): "
                "NEVER ask the user for their email address, PayPal address, or any contact details. "
                "Payment is handled entirely via the payment button/link — just direct them to click it. "
                "Do NOT mention email, PayPal, bank transfer, or any manual payment method. "
                "If the user asks how to pay, tell them to use the button/link provided."
            )

            # ── system_settings safety rules ───────────────────────────────────
            if system_settings.get("never_send_paid_media", True):
                system_prompt += (
                    "\n\nCONTENT SAFETY RULE (absolute): NEVER offer to send, describe sending, "
                    "or reference delivering any paid content files in chat. "
                    "Paid content is ONLY released after confirmed payment through the system. "
                    "Do not say 'I will send you' or 'I can send you' about any paid content."
                )

            # ── PACKAGE RULE: prevent Claude from describing or reproducing package text ──
            # The backend sends every package message in its exact pre-configured form.
            # Claude must never reproduce, paraphrase, or invent any part of it.
            system_prompt += (
                "\n\nPACKAGE RULE (absolute, non-negotiable): NEVER describe, list, paraphrase, "
                "reproduce, or invent any package name, price, description, link, wording, or "
                "checkout detail in your text reply — not even a single sentence. "
                "The backend delivers all package information automatically in its exact "
                "pre-configured form with the correct links and formatting. "
                "Your job is ONLY to write a short conversational teaser (1 sentence max, "
                "e.g. 'hab da was geiles für dich 😏' or 'schick ich dir gleich'). "
                "NEVER write phrases like 'here are my packages', 'hier sind meine pakete', "
                "'ich habe folgende angebote', or any list/description of package names, prices, "
                "descriptions, or payment links. The wording of every package message is locked "
                "and controlled by the backend — you cannot see it and must not attempt to reproduce it."
            )

            # ── GHOST MODE: natural persona writing style (non-negotiable) ────────
            # Prevents robotic AI filler phrases; enforces casual, on-brand tone.
            _p_ident = persona_data.get("identity", persona_data.get("personal", {}))
            _p_name = str(_p_ident.get("name", "")) if isinstance(_p_ident, dict) else ""
            _p_name = _p_name or "the creator"
            system_prompt += (
                f"\n\nWRITING STYLE — GHOST MODE (mandatory): "
                f"Write exactly like {_p_name} texts — short, direct, real. "
                f"\n\nONE THOUGHT RULE (critical): Each reply = ONE idea only. "
                f"Do NOT chain: reaction + explanation + recommendation + question all in one message. "
                f"Pick the ONE most natural thing to say, say it, stop. "
                f"BAD: 'mindhunter musst du schauen, geht um fbi profiler die serienkiller interviewen, "
                f"richtig spannend ist von david fincher, mega gut gemacht. bist du eher sportlich oder chill?' "
                f"GOOD: 'mindhunter ist krass, schau das unbedingt 🔥' "
                f"or on a separate turn: 'bist du eher sportlich oder chill?' "
                f"Real people send SHORT bursts — one thought, then wait. Never pack multiple "
                f"clauses or topics into one message. If you used a comma to chain more than "
                f"two thoughts → cut everything after the second one. "
                f"\n\nBANNED PHRASES — ENGLISH (never use): "
                f"'Certainly', 'Of course', 'I\\'d be happy to', 'Great question', "
                f"'Absolutely', 'Feel free to', 'Don\\'t hesitate', 'I appreciate', "
                f"'Thank you for reaching out', 'Let me know if you need anything', "
                f"'Hope that helps', 'What attracted you', 'What drew you here', "
                f"'I\\'m glad you found me', 'Welcome'. "
                f"BANNED PHRASES — GERMAN (never use): "
                f"'Natürlich', 'Selbstverständlich', 'Ich helfe dir gern', "
                f"'Schön dass du den Weg hierher gefunden hast', "
                f"'Freut mich dass du', 'Willkommen', 'Danke für deine Nachricht', "
                f"'Was hat dich angesprochen', 'Was hat dich dazu gebracht', "
                f"'Wie kann ich dir helfen', 'Gerne', 'Kein Problem'. "
                f"No corporate tone, no customer-service tone, no formal openers. "
                f"Write like you\\'re texting a person you just matched with — "
                f"curious about THEM, not about what they want to buy."
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

            # Fix 7: structured intent log at routing entry
            logger.info(
                f"[intent] detected='{_si}' | "
                f"pkg='{_si_pkg.get('name', 'none') if _si_pkg else 'none'}' | "
                f"tg={telegram_id} | "
                f"text='{incoming_text[:60]}{'...' if len(incoming_text) > 60 else ''}'"
            )

            # ── package_interest → send preset list_message, fall back to menu ─
            # "was kostet", "deine pakete", "what do you have", etc.
            # Bypasses Claude entirely. Always uses the admin-configured list_message
            # text if one is set — never the hardcoded generated menu.
            if _si == "package_interest" and _active_pkgs and system_settings.get("use_package_keywords", True):
                # Prefer the configured list_message text (set in admin panel).
                # Only fall back to the auto-generated menu if no text is configured.
                if _list_active and _list_msg_text:
                    menu_text = _list_msg_text
                    logger.info(f"[sales-flow] package_interest → using configured list_message verbatim")
                else:
                    menu_text = self._build_package_menu_text(_active_pkgs)
                    logger.info(f"[sales-flow] package_interest → no list_message configured, using auto menu")
                try:
                    from telethon.tl.functions.messages import SetTypingRequest
                    from telethon.tl.types import SendMessageTypingAction
                    await tg_client.client(
                        SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                    )
                except Exception:
                    pass
                await _human_typing_delay(menu_text, persona_data)
                _menu_tg_id = await self._send_with_retry(tg_client, telegram_id, menu_text)
                if _menu_tg_id:
                    self._log_action(
                        "send_package_menu", user_id, telegram_id, _si, "success",
                        f"packages={len(_active_pkgs)}"
                    )
                    async with db_manager.get_session() as _sm:
                        _sm.add(Message(
                            message_id=_menu_tg_id, user_id=user_id, text=menu_text,
                            direction="outgoing", has_media=False, is_ai_generated=True,
                            extra_data={"source": "sales_flow", "intent": "package_interest"},
                            created_at=_naive_utc(),
                        ))
                        # Tag lead as WARM when they show package interest
                        if system_settings.get("auto_status_change", True):
                            _u_m_res = await _sm.execute(select(User).where(User.id == user_id))
                            _u_m = _u_m_res.scalars().first()
                            if _u_m:
                                _ex_m = dict(_u_m.extra_data or {})
                                if _ex_m.get("lead_label") not in ("HOT", "BUYER"):
                                    _ex_m["lead_label"] = "WARM"
                                    _u_m.extra_data = _ex_m
                        await _sm.commit()
                    asyncio.create_task(self._update_lead_funnel(user_id, "price_inquiry"))
                    try:
                        import main as _main
                        _main._broadcast_new_message(str(user_id), {
                            "id": str(_menu_tg_id), "text": menu_text,
                            "direction": "outgoing", "is_ai_generated": True,
                            "created_at": _naive_utc().isoformat(),
                        })
                    except Exception:
                        pass
                else:
                    self._log_action(
                        "send_package_menu", user_id, telegram_id, _si, "failed",
                        "all send attempts failed"
                    )
                return

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
                _tg_id2 = await self._send_with_retry(tg_client, telegram_id, menu_text)
                if _tg_id2:
                    self._log_action(
                        "send_package_menu", user_id, telegram_id, _si, "success",
                        f"packages={len(_active_pkgs)}"
                    )
                    async with db_manager.get_session() as _s2:
                        _s2.add(Message(
                            message_id=_tg_id2, user_id=user_id, text=menu_text,
                            direction="outgoing", has_media=False, is_ai_generated=True,
                            extra_data={"source": "sales_flow", "intent": "ready_to_pay_no_selection"},
                            created_at=_naive_utc(),
                        ))
                        # Tag as WARM — user received package list
                        if system_settings.get("auto_status_change", True):
                            _u2r = await _s2.execute(select(User).where(User.id == user_id))
                            _u2 = _u2r.scalars().first()
                            if _u2:
                                _ex2 = dict(_u2.extra_data or {})
                                if _ex2.get("lead_label") not in ("HOT", "BUYER"):
                                    _ex2["lead_label"] = "WARM"
                                    _u2.extra_data = _ex2
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
                else:
                    self._log_action(
                        "send_package_menu", user_id, telegram_id, _si, "failed",
                        "all send attempts failed"
                    )
                return

            # ── selecting_package → send Stripe link directly, skip Claude ────
            if _si == "selecting_package" and _si_pkg:
                asyncio.create_task(
                    self._save_selected_package(user_id, str(_si_pkg.get("id", "")))
                )
                p_name  = _si_pkg.get("name", "")
                p_price = f"{_si_pkg.get('price', '')} {_si_pkg.get('currency', '€')}".strip()
                p_link  = _si_pkg.get("payment_link", "")

                if p_link:
                    # Get atomic order number for this creator
                    _order_num = await self._next_order_number(creator_id)
                    # Priority: package_text → preview description → description
                    # NOTE: `message` field is intentionally excluded here — it already
                    # contains the full Stripe link text. Adding it to pay_msg (which ALSO
                    # prepends an order number and appends a button) would create duplicate
                    # links and broken formatting.
                    _pkg_text = (
                        _si_pkg.get("package_text", "").strip()
                        or _si_pkg.get("package_preview_description", "").strip()
                        or _si_pkg.get("description", "").strip()
                    )
                    if _pkg_text:
                        pay_msg = f"🧾 {_order_num}\n\n{_pkg_text}"
                    else:
                        pay_msg = (
                            f"🧾 {_order_num} — {p_name}\n\n"
                            f"💰 {p_price}\n\n"
                            f"Klick auf den Button um sicher zu bezahlen 🔐"
                        )
                    # Build inline keyboard button for the payment link
                    from telethon.tl.types import (
                        ReplyInlineMarkup, KeyboardButtonRow, KeyboardButtonUrl
                    )
                    pay_button = ReplyInlineMarkup(rows=[
                        KeyboardButtonRow(buttons=[
                            KeyboardButtonUrl(text=f"💳 Jetzt kaufen — {p_price}", url=p_link)
                        ])
                    ])
                    try:
                        from telethon.tl.functions.messages import SetTypingRequest
                        from telethon.tl.types import SendMessageTypingAction
                        await tg_client.client(
                            SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                        )
                    except Exception:
                        pass
                    await asyncio.sleep(1.5)
                    _pay_tg_id = await self._send_with_retry(
                        tg_client, telegram_id, pay_msg, buttons=pay_button
                    )
                    if _pay_tg_id:
                        self._log_action(
                            "send_payment_link", user_id, telegram_id, _si, "success",
                            f"package={p_name}"
                        )
                        async with db_manager.get_session() as _ps:
                            _ps.add(Message(
                                message_id=_pay_tg_id, user_id=user_id, text=pay_msg,
                                direction="outgoing", has_media=False, is_ai_generated=True,
                                extra_data={"source": "sales_flow", "intent": "payment_link_sent", "package": p_name},
                                created_at=_naive_utc(),
                            ))
                            # Tag lead as HOT + optionally disable autopilot (human handover)
                            _ur = await _ps.execute(select(User).where(User.id == user_id))
                            _u = _ur.scalars().first()
                            if _u:
                                _ex = dict(_u.extra_data or {})
                                _ex["lead_label"] = "HOT"
                                _u.extra_data = _ex
                                if system_settings.get("human_handover_after_buy", True):
                                    _u.ai_enabled = False
                                    logger.info(
                                        f"[human-handover] ai_enabled=False for user {user_id} "
                                        f"after payment link sent (selecting_package)"
                                    )
                            await _ps.commit()
                        asyncio.create_task(self._update_lead_funnel(user_id, "payment_link_sent"))
                        # Cash Alarm — HOT Lead, payment link sent
                        asyncio.create_task(
                            self._fire_cash_alarm(creator_id, telegram_id, "package", pkg_name=p_name)
                        )
                        try:
                            import main as _main
                            _main._broadcast_new_message(str(user_id), {
                                "id": str(_pay_tg_id), "text": pay_msg,
                                "direction": "outgoing", "is_ai_generated": True,
                                "created_at": _naive_utc().isoformat(),
                            })
                        except Exception:
                            pass
                    else:
                        self._log_action(
                            "send_payment_link", user_id, telegram_id, _si, "failed",
                            f"package={p_name}"
                        )
                    return  # Payment link sent — no Claude call needed
                else:
                    # No Stripe link configured → fall through to Claude with injection
                    system_prompt += (
                        f"\n\nPACKAGE SELECTED: user chose '{p_name}' ({p_price}). "
                        f"Confirm enthusiastically in persona. Sentence limit applies."
                    )
                    logger.warning(f"[sales-flow] selecting_package → NO payment_link configured for '{p_name}' — falling back to Claude text")

            # ── ready_to_pay WITH a selected package → send Stripe link directly ─
            elif _si == "ready_to_pay" and user_extra.get("selected_package_id"):
                _sel = next(
                    (p for p in _active_pkgs if str(p.get("id")) == str(user_extra["selected_package_id"])),
                    _si_pkg or (_active_pkgs[0] if _active_pkgs else None),
                )
                if _sel:
                    _sel_link = _sel.get("payment_link", "")
                    _sel_name = _sel.get("name", "")
                    _sel_price = f"{_sel.get('price', '')} {_sel.get('currency', '€')}".strip()
                    if _sel_link:
                        _order_num2 = await self._next_order_number(creator_id)
                        # Same rule as selecting_package: exclude `message` field to
                        # avoid duplicate Stripe links + order number conflicts.
                        _sel_pkg_text = (
                            _sel.get("package_text", "").strip()
                            or _sel.get("package_preview_description", "").strip()
                            or _sel.get("description", "").strip()
                        )
                        if _sel_pkg_text:
                            pay_msg2 = f"🧾 {_order_num2}\n\n{_sel_pkg_text}"
                        else:
                            pay_msg2 = (
                                f"🧾 {_order_num2} — {_sel_name}\n\n"
                                f"💰 {_sel_price}\n\n"
                                f"Klick auf den Button um sicher zu bezahlen 🔐"
                            )
                        from telethon.tl.types import (
                            ReplyInlineMarkup, KeyboardButtonRow, KeyboardButtonUrl
                        )
                        pay_button2 = ReplyInlineMarkup(rows=[
                            KeyboardButtonRow(buttons=[
                                KeyboardButtonUrl(text=f"💳 Jetzt kaufen — {_sel_price}", url=_sel_link)
                            ])
                        ])
                        try:
                            from telethon.tl.functions.messages import SetTypingRequest
                            from telethon.tl.types import SendMessageTypingAction
                            await tg_client.client(
                                SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                            )
                        except Exception:
                            pass
                        await asyncio.sleep(1.0)
                        _pay2_tg_id = await self._send_with_retry(
                            tg_client, telegram_id, pay_msg2, buttons=pay_button2
                        )
                        if _pay2_tg_id:
                            self._log_action(
                                "send_payment_link", user_id, telegram_id, _si, "success",
                                f"package={_sel_name}"
                            )
                            async with db_manager.get_session() as _ps2:
                                _ps2.add(Message(
                                    message_id=_pay2_tg_id, user_id=user_id, text=pay_msg2,
                                    direction="outgoing", has_media=False, is_ai_generated=True,
                                    extra_data={"source": "sales_flow", "intent": "payment_link_reminder"},
                                    created_at=_naive_utc(),
                                ))
                                # Human handover: disable autopilot after buy link sent
                                if system_settings.get("human_handover_after_buy", True):
                                    _u_h2_res = await _ps2.execute(select(User).where(User.id == user_id))
                                    _u_h2 = _u_h2_res.scalars().first()
                                    if _u_h2:
                                        _u_h2.ai_enabled = False
                                        logger.info(
                                            f"[human-handover] ai_enabled=False for user {user_id} "
                                            f"after payment link sent (ready_to_pay)"
                                        )
                                await _ps2.commit()
                            asyncio.create_task(self._update_lead_funnel(user_id, "payment_link_sent"))
                            try:
                                import main as _main
                                _main._broadcast_new_message(str(user_id), {
                                    "id": str(_pay2_tg_id), "text": pay_msg2,
                                    "direction": "outgoing", "is_ai_generated": True,
                                    "created_at": _naive_utc().isoformat(),
                                })
                            except Exception:
                                pass
                        else:
                            self._log_action(
                                "send_payment_link", user_id, telegram_id, _si, "failed",
                                f"package={_sel_name}"
                            )
                        return
                    else:
                        system_prompt += (
                            f"\n\nPAYMENT: User wants to pay for '{_sel_name}' ({_sel_price}). "
                            f"No payment link configured — ask them to contact you directly."
                        )

            # ── asking_details → send configured description VERBATIM, bypass Claude ──
            # The bot MUST send the admin-configured text exactly as written.
            # Claude must NEVER paraphrase, summarise, or invent package details.
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
                        _desc_pkg.get("package_preview_description", "").strip()
                        or _desc_pkg.get("message", "").strip()   # use keyword pre-message as fallback
                        or _desc_pkg.get("description", "").strip()
                    )
                    if _preview:
                        # Send the pre-configured text VERBATIM — no Claude involved
                        logger.info(
                            f"[sales-flow] asking_details → sending configured description "
                            f"verbatim for tg={telegram_id}, pkg='{_desc_pkg.get('name', '')}'"
                        )
                        try:
                            from telethon.tl.functions.messages import SetTypingRequest
                            from telethon.tl.types import SendMessageTypingAction
                            await tg_client.client(
                                SetTypingRequest(peer=telegram_id, action=SendMessageTypingAction())
                            )
                        except Exception:
                            pass
                        await _human_typing_delay(_preview, persona_data)
                        _det_tg_id = await self._send_with_retry(tg_client, telegram_id, _preview)
                        if _det_tg_id:
                            async with db_manager.get_session() as _ds:
                                _ds.add(Message(
                                    message_id=_det_tg_id, user_id=user_id, text=_preview,
                                    direction="outgoing", has_media=False, is_ai_generated=False,
                                    extra_data={
                                        "source": "asking_details_verbatim",
                                        "package_id": str(_desc_pkg.get("id", "")),
                                    },
                                    created_at=_naive_utc(),
                                ))
                                await _ds.commit()
                            self._log_action(
                                "send_pkg_detail", user_id, telegram_id, _si, "success",
                                f"pkg={_desc_pkg.get('name', '')}"
                            )
                            try:
                                import main as _main
                                _main._broadcast_new_message(str(user_id), {
                                    "id": str(_det_tg_id), "text": _preview,
                                    "direction": "outgoing", "is_ai_generated": False,
                                    "created_at": _naive_utc().isoformat(),
                                })
                            except Exception:
                                pass
                        else:
                            self._log_action(
                                "send_pkg_detail", user_id, telegram_id, _si, "failed",
                                f"pkg={_desc_pkg.get('name', '')}"
                            )
                        return  # verbatim sent — do NOT call Claude
                    # No configured description → fall through to Claude (edge case)

            # ── payment_confirmed → tag BUYER + fire cash notifications ────────
            elif _si == "payment_confirmed":
                system_prompt += (
                    "\n\nPAYMENT CONFIRMED: The user says they have paid. "
                    "Acknowledge their payment warmly and in character. "
                    "Tell them you will send their content shortly. "
                    "Do NOT send any files in this message — delivery is handled separately. "
                    "Sentence limit applies."
                )
                # Tag as BUYER and fire cash notification in background
                asyncio.create_task(self._handle_sale_completed(user_id, creator_id, telegram_id))

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

            # Package promise guard — strip verbal package listings from Claude's output
            # for ANY intent. Claude must never reproduce, paraphrase, or promise packages.
            # Applies to all intents (not just browsing) so any AI response that slips
            # through and contains package descriptions is caught and cleaned here.
            if _PACKAGE_PROMISE_RE.search(ai_text):
                logger.warning(
                    f"[package-guard] stripped package promise from Claude output for tg={telegram_id} | "
                    f"original='{ai_text[:80]}'"
                )
                ai_text = _PACKAGE_PROMISE_RE.sub("", ai_text).strip()
                if not ai_text:
                    ai_text = "hab da was geiles für dich 😌"

            max_sents = int(persona_data.get("max_sentences", 3))
            if max_sents > 0:
                original_len = len(ai_text)
                ai_text = _enforce_sentence_limit(ai_text, max_sents)
                if len(ai_text) < original_len:
                    logger.debug(
                        f"[sentence-limit] truncated to {max_sents} sentences "
                        f"({original_len} → {len(ai_text)} chars)"
                    )

            # ── Blocked words filter (reply_settings) ──────────────────────
            if system_settings.get("use_reply_settings", True):
                _blocked = reply_settings.get("blocked_words", [])
                if _blocked and isinstance(_blocked, list):
                    for _bw in _blocked:
                        if not _bw or not isinstance(_bw, str):
                            continue
                        if _bw.lower() in ai_text.lower():
                            logger.warning(f"[blocked-words] stripping '{_bw}' from AI response")
                            ai_text = re.sub(re.escape(_bw), "***", ai_text, flags=re.IGNORECASE).strip()

            if not ai_text:
                logger.warning(f"[post-process] AI text empty after filtering for {telegram_id}")
                return

            self._log_action("send_ai_reply", user_id, telegram_id, _si, "pending",
                             f"chars={len(ai_text)}")
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

            # ── Send via Telegram (with retry) ──────────────────────────────
            tg_msg_id = await self._send_with_retry(tg_client, telegram_id, ai_text)
            if tg_msg_id is None:
                self._log_action("send_ai_reply", user_id, telegram_id, _si, "failed",
                                 "all send attempts failed")
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
                # Refresh to get the auto-generated DB UUID so the SSE broadcast
                # uses the same id that the history API will return. Without this,
                # the SSE would broadcast with tg_msg_id (int) while the poll
                # fetches the same message with its UUID → dedup fails → duplicates.
                await session.refresh(ai_msg)
                _db_msg_uuid = str(ai_msg.id)

            asyncio.create_task(self._update_lead_funnel(user_id, "ai_reply"))

            # ── Broadcast via SSE ───────────────────────────────────────────
            try:
                import main as _main
                _main._broadcast_new_message(str(user_id), {
                    "id": _db_msg_uuid,          # DB UUID — matches history API
                    "message_id": tg_msg_id,      # Telegram int ID (for reference)
                    "text": ai_text,
                    "direction": "outgoing",
                    "is_ai_generated": True,
                    "created_at": _naive_utc().isoformat(),
                })
            except Exception:
                pass

            self._stats["ai_responses"] += 1
            self._log_action("send_ai_reply", user_id, telegram_id, _si, "success",
                             f"tg_msg_id={tg_msg_id}")
            logger.info(f"AI stats: {self._stats}")

            # ── Teaser loop guard ─────────────────────────────────────────────
            # If Claude sent a "hang on" / "coming right up" phrase that promises
            # content without actually delivering it, auto-send the package list
            # 3 seconds later so the bot never gets stuck in an empty teaser loop.
            _TEASER_RE = re.compile(
                r'(hab da was|schick.{0,10}gleich|zeig.{0,10}gleich|warte ab|'
                r'hab.{0,15}für dich|just a sec|coming right up|hang on|'
                r'got something|schicke.{0,10}gleich|kommt gleich|bin gleich|'
                r'gleich mehr|warte kurz|moment mal|check.{0,10}mal)',
                re.IGNORECASE
            )
            if (
                _TEASER_RE.search(ai_text)
                and _active_pkgs
                and system_settings.get("use_package_keywords", True)
            ):
                logger.info(
                    f"[teaser-guard] teaser phrase detected → scheduling package list "
                    f"for tg={telegram_id} in 3s"
                )
                asyncio.create_task(
                    self._send_package_list_delayed(
                        tg_client=tg_client,
                        telegram_id=telegram_id,
                        user_id=user_id,
                        creator_id=creator_id,
                        active_pkgs=_active_pkgs,
                        list_active=_list_active,
                        list_msg_text=_list_msg_text,
                        persona_data=persona_data,
                        system_settings=system_settings,
                        automessages=_automessages,
                        delay_secs=3.0,
                    )
                )

        except Exception as e:
            logger.error(f"AI response failed for tg_id={telegram_id}: {e}", exc_info=True)
        finally:
            if _lock_acquired:
                self._action_lock.release(user_id, creator_id)

    def _log_action(
        self,
        action: str,
        user_id,
        telegram_id: int,
        intent: str,
        result: str,
        detail: str = "",
    ) -> None:
        """Structured one-line log for every autopilot action."""
        logger.info(
            f"[AUTOPILOT] action={action} | intent={intent} | "
            f"user={str(user_id)[:8]}… | tg={telegram_id} | result={result}"
            + (f" | {detail}" if detail else "")
        )

    async def _send_with_retry(
        self,
        tg_client,
        telegram_id: int,
        text: str,
        buttons=None,
        max_attempts: int = 2,
    ) -> Optional[int]:
        """
        Send a Telegram message with one automatic retry on transient failure.
        Returns the Telegram message ID on success, None after all attempts fail.
        """
        for attempt in range(max_attempts):
            try:
                if buttons is not None:
                    result = await tg_client.send_message(telegram_id, text, buttons=buttons)
                else:
                    result = await tg_client.send_message(telegram_id, text)
                if result is not None:
                    return result
                logger.warning(
                    f"[send-retry] send_message returned None "
                    f"(attempt {attempt + 1}/{max_attempts}, tg={telegram_id})"
                )
            except Exception as exc:
                logger.warning(
                    f"[send-retry] attempt {attempt + 1}/{max_attempts} failed "
                    f"for tg={telegram_id}: {exc}"
                )
                if attempt < max_attempts - 1:
                    await asyncio.sleep(2.0)
        logger.error(f"[send-retry] all {max_attempts} attempts failed for tg={telegram_id}")
        return None

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
