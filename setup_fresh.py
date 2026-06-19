"""
Complete fresh setup — no extra dependencies needed (uses stdlib urllib).
"""
import asyncio
import urllib.request
import json

from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID   = 34775327
API_HASH = "9117f2b7a4be869e0629980b734d4079"
RAILWAY_URL = "https://chatdashboard-production.up.railway.app"

def api(method, path, body=None):
    url = RAILWAY_URL + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method,
          headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

async def main():
    print("\n" + "="*60)
    print("  COMPLETE FRESH SETUP")
    print("="*60)

    # ── Step 1: Generate session string ──────────────────────────
    print("\n[1/3] Telegram Session generieren")
    print("-"*40)
    phone = input("Telefonnummer (+4917...): ").strip() or "+4917624238343"

    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.connect()

    print(f"\n📤 Sende Code an {phone}...")
    sent = await client.send_code_request(phone)
    print(f"✅ Typ: {type(sent.type).__name__}")
    print()
    print(">>> Öffne web.telegram.org → 'Telegram' Chat → neuester Code <<<")
    print()
    code = input("Code eingeben: ").strip()

    try:
        await client.sign_in(phone, code, phone_code_hash=sent.phone_code_hash)
    except Exception as e:
        print(f"❌ Sign-in Fehler: {e}")
        await client.disconnect()
        return

    session_str = client.session.save()
    me = await client.get_me()
    account_name = f"{me.first_name or ''} {me.last_name or ''}".strip() or me.username
    print(f"\n✅ Eingeloggt als: {account_name}")
    await client.disconnect()

    with open("new_session.txt", "w") as f:
        f.write(session_str)
    print("   Session gespeichert in: new_session.txt")

    # ── Step 2: Get creator list ───────────────────────────────────
    print(f"\n[2/3] Creator laden...")
    print("-"*40)
    status, creators = api("GET", "/api/v1/creators/")
    print(f"   Status: {status}, Anzahl: {len(creators)}")

    if not creators:
        print("   ❌ Keine Creator — führe erst reset-all aus:")
        print(f"   curl -X POST {RAILWAY_URL}/api/v1/creators/reset-all")
        return

    creator = next((c for c in creators if c.get("is_default")), creators[0])
    cid = creator["id"]
    print(f"   Default Creator ID: {cid}")

    # ── Step 3: Connect ────────────────────────────────────────────
    print(f"\n[3/3] Verbinden...")
    print("-"*40)
    status, result = api("POST", f"/api/v1/creators/{cid}/connect",
                         {"session_string": session_str})
    print(f"   Status: {status}")
    print(f"   Result: {json.dumps(result, indent=2)[:300]}")

    print("\n" + "="*60)
    if status == 200:
        print(f"✅ FERTIG! Verbunden als: {account_name}")
    else:
        print("⚠️  Verbindung fehlgeschlagen.")
    print(f"\nTRAGE DIESEN SESSION STRING IN RAILWAY EIN:")
    print(f"(Railway → Variables → TELEGRAM_SESSION_STRING)\n")
    print(session_str)
    print("="*60)

asyncio.run(main())
