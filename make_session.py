"""
make_session.py — generates a fresh Telethon StringSession.
Run: python3 make_session.py
The code arrives in the Telegram app on your phone (NOT via SMS).
"""
import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID   = 34775327
API_HASH = "9117f2b7a4be869e0629980b734d4079"
PHONE    = "+4917624238343"


async def main():
    print("\n📱 Starting session generation for", PHONE)
    print("   → The login code will appear in your Telegram app (NOT SMS)\n")

    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.connect()

    # Request the login code
    await client.send_code_request(PHONE)
    print("✅ Code sent! Open Telegram on your phone.")
    print("   You'll get a notification or a message from 'Telegram' with a 5-digit code.\n")

    code = input("Enter the 5-digit code from Telegram: ").strip()
    await client.sign_in(PHONE, code)

    me = await client.get_me()
    session_str = client.session.save()
    await client.disconnect()

    name = f"{me.first_name or ''} {me.last_name or ''}".strip()
    print(f"\n✅ Logged in as: {name} (@{me.username})")
    print("\n" + "=" * 70)
    print(session_str)
    print("=" * 70)

    with open("new_session.txt", "w") as f:
        f.write(session_str)

    print("\n→ Also saved to: new_session.txt")
    print("→ Now go to: Railway → Variables → TELEGRAM_SESSION_STRING → paste → Save")
    print("→ Railway will redeploy and connect automatically.\n")


asyncio.run(main())
