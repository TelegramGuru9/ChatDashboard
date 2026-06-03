"""
Run this ONCE locally to generate a fresh Telegram session string.
The output is a long string — paste it into Railway as TELEGRAM_SESSION_STRING.

Usage:
  cd backend
  pip install telethon python-dotenv
  python generate_session.py

Requirements: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set
  either in .env or as environment variables.
"""

import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

API_ID   = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
PHONE    = os.getenv("TELEGRAM_PHONE", "")

if not API_ID or not API_HASH:
    print("❌  Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env or environment first.")
    raise SystemExit(1)


async def main():
    from telethon import TelegramClient
    from telethon.sessions import StringSession

    print(f"Using API_ID={API_ID}")
    print(f"Phone: {PHONE or '(will be asked)'}")
    print()

    async with TelegramClient(StringSession(), API_ID, API_HASH) as client:
        await client.start(phone=PHONE or input("Enter your Telegram phone (+49...): "))
        session_string = client.session.save()

    print()
    print("=" * 60)
    print("✅  NEW SESSION STRING (copy the line below):")
    print()
    print(session_string)
    print()
    print("=" * 60)
    print()
    print("→ In Railway:  Variables → TELEGRAM_SESSION_STRING → paste above")
    print("→ Then redeploy / restart the service")
    print()
    print("⚠  Never run this bot locally AND on Railway at the same time.")
    print("   Each deploy must be the sole user of this session.")


asyncio.run(main())
