#!/bin/bash
set -e

# Restore Telegram session from env var if present
mkdir -p sessions
if [ -n "$TELEGRAM_SESSION_BASE64" ]; then
    echo "$TELEGRAM_SESSION_BASE64" | base64 -d > sessions/telegram_session.session
    echo "Telegram session restored from env var"
fi

exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
