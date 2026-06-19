import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID   = 34775327
API_HASH = "9117f2b7a4be869e0629980b734d4079"
PHONE    = "+4917624238343"

async def main():
    print("\n✅ Schau in die Telegram Desktop App — der Code kommt dort an\n")
    
    async with TelegramClient(StringSession(), API_ID, API_HASH) as client:
        await client.start(phone=PHONE)
        session = client.session.save()
        me = await client.get_me()

    name = f"{me.first_name or ''} {me.last_name or ''}".strip()
    print(f"\n✅ Eingeloggt als: {name}")
    print("\n" + "="*60)
    print(session)
    print("="*60)

    with open("new_session.txt", "w") as f:
        f.write(session)
    print("\n→ Gespeichert in new_session.txt")
    print("→ In Railway: Variables → TELEGRAM_SESSION_STRING → paste")

asyncio.run(main())
