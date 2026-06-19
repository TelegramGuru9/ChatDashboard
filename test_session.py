import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = 34775327
API_HASH = "9117f2b7a4be869e0629980b734d4079"
SESSION = "1ApWapzMBuya8-4YwXiUV5XT2n0L23MlRSWwLvNljpZbnFd-lWAK2aebF1yDRcIBaeN9IUV5SwituyrP6OHil5_WBzlxTkQk4GQWHB4wDO2TeeQJV1zRbkH4oI0djTRLFQCyRgAetQyH57Rgi1kLG-6Sfzn7-oHo8LrBRmGKIP1IixMv-iC_gnHNtfq61zZBK15Ty3ADzdk56Nw4MdsCqjyfYILDHR_wZn7rxQurlY4uc62RxLGKbKy-lbicBp0JNv9HDSeBO8DtBL1SjTW4QQT0RJvavGBFkczlz26EqZWwyh7veJOsZAhbEbi1ZhfYDyvE_iWlDC6QqtziVqER-2qoGWQ54aaI="

async def main():
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)
    try:
        await client.connect()
        authorized = await client.is_user_authorized()
        print(f"Connected: True")
        print(f"Authorized: {authorized}")
        if authorized:
            me = await client.get_me()
            print(f"Account: {me.first_name} (@{me.username})")
            print(f"\n✅ Session is VALID!")
        else:
            print(f"\n❌ Session is NOT authorized (revoked by Telegram)")
    except Exception as e:
        print(f"Error: {type(e).__name__}: {e}")
    finally:
        await client.disconnect()

asyncio.run(main())
