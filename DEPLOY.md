# Deploy: Railway (Backend) + Vercel (Frontend)

Complete step-by-step guide to get your AI Telegram CRM live.

---

## Before You Start — Get Your API Keys

### 1. Telegram API Credentials
1. Go to https://my.telegram.org and log in with your phone number
2. Click **"API development tools"**
3. Fill in any app name (e.g. "MyCRM") → click **Create application**
4. Save your **`api_id`** (number) and **`api_hash`** (long string)

### 2. Anthropic (Claude) API Key
1. Go to https://console.anthropic.com → sign up / log in
2. Go to **Settings → API Keys → Create Key**
3. Copy the key (starts with `sk-ant-`)

### 3. Generate a Secret Key
Run this in your terminal:
```bash
openssl rand -base64 32
```
Save the output — this is your `SECRET_KEY`.

---

## Step 1 — Push to GitHub

```bash
cd ai-telegram-crm

# Initialize git repo
git init
git add .
git commit -m "Initial commit: AI Telegram CRM"

# Create repo on GitHub (github.com → New repository)
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/ai-telegram-crm.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Deploy Backend on Railway

1. Go to https://railway.app → **New Project**
2. Click **"Deploy from GitHub repo"** → select `ai-telegram-crm`
3. Railway detects the `railway.toml` and builds from `backend/Dockerfile`

### Add PostgreSQL
- In your Railway project → click **"+ New"** → **Database → PostgreSQL**
- Railway auto-sets `DATABASE_URL` in your backend service ✅

### Add Redis
- Click **"+ New"** → **Database → Redis**
- Railway auto-sets `REDIS_URL` in your backend service ✅

### Set Environment Variables
In Railway → your backend service → **Variables** tab, add:

| Variable | Value |
|---|---|
| `TELEGRAM_API_ID` | Your api_id number |
| `TELEGRAM_API_HASH` | Your api_hash string |
| `TELEGRAM_PHONE` | Your phone e.g. `+491701234567` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `SECRET_KEY` | Your generated 32-char key |
| `CORS_ORIGINS` | `https://your-app.vercel.app` (update after Vercel deploy) |
| `ENVIRONMENT` | `production` |
| `DEBUG` | `false` |

> Railway auto-provides `DATABASE_URL`, `REDIS_URL`, and `PORT`.

4. Click **Deploy** — wait ~3 minutes for build
5. Copy your backend URL: e.g. `https://ai-telegram-crm-production.up.railway.app`

### First-time Telegram Login
The Telegram bot needs a one-time login to authorize your phone number.
After deploy, run in Railway shell (your service → **Shell** tab):
```bash
python -c "
from telethon.sync import TelegramClient
import os
client = TelegramClient('sessions/telegram_session',
    int(os.environ['TELEGRAM_API_ID']),
    os.environ['TELEGRAM_API_HASH'])
client.start(phone=os.environ['TELEGRAM_PHONE'])
print('Logged in!')
client.disconnect()
"
```
Enter the code Telegram sends to your phone. This only needs to be done once.

---

## Step 3 — Deploy Frontend on Vercel

1. Go to https://vercel.com → **Add New → Project**
2. Import your `ai-telegram-crm` GitHub repo
3. Set **Root Directory** to `frontend`
4. Vercel auto-detects Next.js ✅

### Set Environment Variables in Vercel
In Vercel → your project → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-backend.up.railway.app/api/v1` |
| `NEXT_PUBLIC_WS_URL` | `wss://your-backend.up.railway.app` |

5. Click **Deploy** — done in ~2 minutes
6. Your frontend URL: e.g. `https://ai-telegram-crm.vercel.app`

### Update CORS on Railway
Go back to Railway → Variables → update:
```
CORS_ORIGINS=https://ai-telegram-crm.vercel.app,http://localhost:3000
```
Redeploy the backend.

---

## Step 4 — Verify Everything Works

1. Open your Vercel URL → you should see the dashboard
2. Check backend health: `https://your-backend.up.railway.app/health`
3. Send a Telegram message to your account → it should appear in the inbox within seconds

---

## Architecture Summary

```
Your Phone (Telegram)
        ↓
Railway Backend (FastAPI + Telethon)
        ↓                    ↓
PostgreSQL (Railway)    Redis (Railway)
        ↓
Vercel Frontend (Next.js)
```

---

## Troubleshooting

**Backend won't start?**
→ Check Railway logs: your service → **Logs** tab
→ Verify all env variables are set

**Telegram connection fails?**
→ Make sure you completed the one-time phone login step
→ Check `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_PHONE` are correct

**Frontend can't reach backend?**
→ Check `NEXT_PUBLIC_API_URL` in Vercel env vars
→ Make sure `CORS_ORIGINS` in Railway includes your Vercel URL

**Database errors?**
→ PostgreSQL plugin must be added in Railway
→ `DATABASE_URL` must start with `postgresql+asyncpg://`
