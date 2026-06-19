"""
Session generator using client.start() — handles all auth automatically.
Shows exact errors including FloodWait.
"""
import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import FloodWaitError, PhoneCodeExpiredError, PhoneCodeInvalidError

API_ID   = 34775327
API_HASH = "9117f2b7a4be869e0629980b734d4079"

async def main():
    phone = input("Telefonnummer (+4917...): ").strip() or "+4917624238343"

    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.connect()

    print(f"\n📤 Sende Code-Anfrage für {phone}...")
    try:
        sent = await client.send_code_request(phone)
        print(f"✅ Code gesendet!")
        print(f"   Typ      : {type(sent.type).__name__}")
        print(f"   Next-Typ : {type(sent.next_type).__name__ if sent.next_type else 'keiner'}")
    except FloodWaitError as e:
        print(f"\n🚫 FLOOD WAIT — musst {e.seconds} Sekunden warten ({e.seconds//60} Minuten {e.seconds%60} Sek)")
        print(f"   Versuche es um {__import__('datetime').datetime.now() + __import__('datetime').timedelta(seconds=e.seconds)} Uhr nochmal.")
        await client.disconnect()
        return
    except Exception as e:
        print(f"\n❌ Fehler beim Senden: {type(e).__name__}: {e}")
        await client.disconnect()
        return

    print()
    print(">>> Öffne web.telegram.org → 'Telegram' Chat (Service Notifications) <<<")
    print(">>> Warte auf neue Nachricht mit dem Login-Code <<<")
    print()

    code = input("Code eingeben: ").strip()

    try:
        await client.sign_in(phone, code, phone_code_hash=sent.phone_code_hash)
    except PhoneCodeInvalidError:
        print("❌ Falscher Code!")
        await client.disconnect()
        return
    except PhoneCodeExpiredError:
        print("❌ Code abgelaufen — Skript nochmal starten")
        await client.disconnect()
        return
    except Exception as e:
        print(f"❌ Fehler: {type(e).__name__}: {e}")
        await client.disconnect()
        return

    session_str = client.session.save()
    me = await client.get_me()
    name = f"{me.first_name or ''} {me.last_name or ''}".strip() or me.username
    await client.disconnect()

    with open("new_session.txt", "w") as f:
        f.write(session_str)

    print(f"\n✅ Eingeloggt als: {name}")
    print("\n" + "="*60)
    print("SESSION STRING — in Railway als TELEGRAM_SESSION_STRING eintragen:")
    print()
    print(session_str)
    print("="*60)
    print("\n(Auch gespeichert in: new_session.txt)")

asyncio.run(main())
