import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = 34775327
API_HASH = "9117f2b7a4be869e0629980b734d4079"

async def main():
    print("\n" + "="*60)
    print("Telegram Session Generator")
    print("="*60)
    
    phone = input("\nTelefonnummer eingeben (+4917...): ").strip()
    if not phone:
        phone = "+4917624238343"
    
    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.connect()

    print(f"\n📤 Sende Code an {phone}...")
    sent = await client.send_code_request(phone)
    code_type = type(sent.type).__name__
    print(f"✅ Code gesendet! Typ: {code_type}")
    
    print()
    print("╔══════════════════════════════════════════════╗")
    print("║  Öffne web.telegram.org                      ║")
    print("║  → Chat 'Telegram' (Service Notifications)   ║")
    print("║  → Neueste Nachricht mit Login Code          ║")
    print("║  → Code kann z.B. so aussehen: gsKPM6fm6HE  ║")
    print("╚══════════════════════════════════════════════╝")
    print()
    print("Du hast 2 Minuten Zeit. Warte auf den Code...")
    print()

    code = input("Code hier eingeben: ").strip()

    try:
        await client.sign_in(phone, code, phone_code_hash=sent.phone_code_hash)
        session_str = client.session.save()
        print("\n" + "="*60)
        print("✅ ERFOLGREICH!\n")
        print("SESSION STRING — in Railway als TELEGRAM_SESSION_STRING eintragen:\n")
        print(session_str)
        print("\n" + "="*60)
        # Also save to file
        with open("new_session.txt", "w") as f:
            f.write(session_str)
        print("(Auch gespeichert in: new_session.txt)")
    except Exception as e:
        print(f"\n❌ Fehler: {e}")
        print("\nMögliche Ursachen:")
        print("- Falscher Code")
        print("- Code abgelaufen (zu spät eingegeben)")
        print("- Skript nochmal starten und schneller sein")

    await client.disconnect()

asyncio.run(main())
