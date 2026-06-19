import asyncio, subprocess, sys

try:
    import opentele
except ImportError:
    print("📦 Installiere opentele...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "opentele", "-q"])

import os
from pathlib import Path

TDATA = Path.home() / "Library" / "Application Support" / "Telegram Desktop" / "tdata"

async def main():
    if not TDATA.exists():
        print(f"❌ Nicht gefunden: {TDATA}")
        return

    print(f"✅ tdata gefunden")
    print("📤 Konvertiere Session...\n")

    from opentele.td import TDesktop
    from opentele.api import UseCurrentSession

    tdesk = TDesktop(str(TDATA))
    assert tdesk.isLoaded(), "TDesktop konnte nicht geladen werden"

    client = await tdesk.ToTelethon(flag=UseCurrentSession)
    await client.connect()

    me = await client.get_me()
    name = f"{me.first_name or ''} {me.last_name or ''}".strip()

    from telethon.sessions import StringSession
    ss = StringSession.save(client.session)
    await client.disconnect()

    print(f"✅ Eingeloggt als: {name} (@{me.username})")
    print("\n" + "="*60)
    print(ss)
    print("="*60)

    with open("new_session.txt", "w") as f:
        f.write(ss)
    print("\n→ Gespeichert in: new_session.txt")

asyncio.run(main())
