"""
app/api/v1/routes.py
All API v1 routes: messages, users, leads, AI, telegram sync, config.
"""

import logging
import asyncio
from typing import Optional, Any, Dict
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy import select, and_, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db, db_manager
from app.db.models import Message, User, Lead, Config
from app.db.schemas import (
    MessageResponse,
    MessageDetailResponse,
    PaginatedResponse,
    UserResponse,
    UserDetailResponse,
    LeadResponse,
)

logger = logging.getLogger(__name__)


# ==================== MESSAGE ROUTES ====================

router = APIRouter(prefix="/messages", tags=["Messages"])


@router.get("")
async def list_messages(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    user_id: Optional[UUID] = None,
    direction: Optional[str] = Query(None, pattern="^(incoming|outgoing)$"),
    is_ai_generated: Optional[bool] = None,
    session: AsyncSession = Depends(get_db),
) -> PaginatedResponse:
    """List messages with filtering and pagination."""
    try:
        filters = []
        if user_id:
            filters.append(Message.user_id == user_id)
        if direction:
            filters.append(Message.direction == direction)
        if is_ai_generated is not None:
            filters.append(Message.is_ai_generated == is_ai_generated)

        where_clause = and_(*filters) if filters else True

        count_result = await session.execute(
            select(func.count(Message.id)).where(where_clause)
        )
        total = count_result.scalar() or 0

        result = await session.execute(
            select(Message).where(where_clause)
            .order_by(Message.created_at.desc())
            .offset(skip).limit(limit)
        )
        messages = result.scalars().all()

        return PaginatedResponse(
            items=[MessageResponse.model_validate(m) for m in messages],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + limit) < total,
        )
    except Exception as e:
        logger.error(f"Error listing messages: {e}")
        raise HTTPException(status_code=500, detail="Failed to list messages")


@router.get("/conversations")
async def list_conversations(
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
    folder: Optional[str] = Query(None, description="Filter by Telegram folder name"),
    session: AsyncSession = Depends(get_db),
):
    """
    Return one row per user — latest message + user info.
    Uses LEFT JOIN so users with NO messages still appear.
    Optional ?folder=Käufer filters by Telegram custom folder.
    """
    try:
        from sqlalchemy.sql import text as sql_text

        folder_clause = ""
        params: dict = {"limit": limit, "skip": skip}
        if folder:
            # JSONB array contains check: metadata->'tg_folders' @> '["FolderName"]'
            folder_clause = "AND u.metadata->'tg_folders' @> :folder_json::jsonb"
            import json
            params["folder_json"] = json.dumps([folder])

        raw = await session.execute(sql_text(f"""
            SELECT
                u.id            AS user_id,
                u.user_id       AS telegram_id,
                u.first_name,
                u.last_name,
                u.username,
                u.lead_score,
                u.total_messages,
                u.ai_enabled,
                u.metadata      AS extra_data,
                u.created_at    AS user_created_at,
                m.text          AS last_message,
                m.direction     AS last_direction,
                m.created_at    AS last_message_at,
                m.is_ai_generated
            FROM users u
            LEFT JOIN (
                SELECT DISTINCT ON (user_id)
                    user_id, text, direction, created_at, is_ai_generated
                FROM messages
                ORDER BY user_id, created_at DESC
            ) m ON m.user_id = u.id
            WHERE (u.is_bot = false OR u.is_bot IS NULL)
            {folder_clause}
            ORDER BY COALESCE(m.created_at, u.created_at) DESC
            LIMIT :limit OFFSET :skip
        """), params)

        rows = raw.fetchall()

        items = []
        for row in rows:
            name = f"{row.first_name or ''} {row.last_name or ''}".strip() or f"User {row.telegram_id}"
            ed = row.extra_data or {}
            items.append({
                "user_id": str(row.user_id),
                "telegram_id": row.telegram_id,
                "name": name,
                "username": row.username,
                "lead_score": row.lead_score or 0,
                "total_messages": row.total_messages or 0,
                "last_message": row.last_message,
                "last_message_direction": row.last_direction or "incoming",
                "last_message_at": row.last_message_at.isoformat() if row.last_message_at else None,
                "ai_enabled": row.ai_enabled,
                "tg_folders": ed.get("tg_folders", []) if isinstance(ed, dict) else [],
                "lead_label": ed.get("lead_label") if isinstance(ed, dict) else None,
            })

        # Total count
        count_params: dict = {}
        count_clause = ""
        if folder:
            count_clause = "AND u.metadata->'tg_folders' @> :folder_json::jsonb"
            count_params["folder_json"] = params["folder_json"]
        count_res = await session.execute(sql_text(f"""
            SELECT COUNT(*) FROM users u
            WHERE (u.is_bot = false OR u.is_bot IS NULL) {count_clause}
        """), count_params)
        total = count_res.scalar() or 0

        return {"items": items, "total": total}
    except Exception as e:
        logger.error(f"Error listing conversations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list conversations")


@router.get("/{message_id}")
async def get_message(
    message_id: UUID,
    session: AsyncSession = Depends(get_db),
) -> MessageDetailResponse:
    try:
        result = await session.execute(select(Message).where(Message.id == message_id))
        message = result.scalars().first()
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
        return MessageDetailResponse.model_validate(message)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting message: {e}")
        raise HTTPException(status_code=500, detail="Failed to get message")


@router.get("/user/{user_id}/history")
async def get_user_history(
    user_id: UUID,
    limit: int = Query(100, ge=1, le=500),
    days: Optional[int] = Query(None, ge=1, le=365),
    since: Optional[str] = Query(None, description="ISO timestamp — return only messages after this"),
    session: AsyncSession = Depends(get_db),
) -> list:
    try:
        query = select(Message).where(Message.user_id == user_id)
        if days:
            cutoff = datetime.utcnow() - timedelta(days=days)
            query = query.where(Message.created_at >= cutoff)
        if since:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00")).replace(tzinfo=None)
            query = query.where(Message.created_at > since_dt)
        query = query.order_by(Message.created_at.asc()).limit(limit)
        result = await session.execute(query)
        messages = result.scalars().all()
        return [MessageDetailResponse.model_validate(m) for m in messages]
    except Exception as e:
        logger.error(f"Error getting history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get history")


@router.post("/send")
async def send_message(
    payload: Dict[str, Any] = Body(...),
    session: AsyncSession = Depends(get_db),
):
    """Send a manual message to a user via Telegram and store it in DB."""
    try:
        user_id = UUID(str(payload.get("user_id", "")))
        text = str(payload.get("text", "")).strip()
        if not text:
            raise HTTPException(status_code=400, detail="text is required")

        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        from app.services.telegram.client import telegram_client
        if not telegram_client.is_connected:
            raise HTTPException(status_code=503, detail="Telegram not connected")

        tg_msg_id = await telegram_client.send_message(user.user_id, text)
        if tg_msg_id is None:
            raise HTTPException(status_code=503, detail="Failed to send via Telegram")

        msg = Message(
            message_id=tg_msg_id,
            user_id=user.id,
            text=text,
            direction="outgoing",
            has_media=False,
            is_ai_generated=False,
            extra_data={},
            created_at=datetime.utcnow(),
        )
        session.add(msg)
        user.total_messages = (user.total_messages or 0) + 1
        await session.commit()
        await session.refresh(msg)
        return MessageDetailResponse.model_validate(msg)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== USER ROUTES ====================

user_router = APIRouter(prefix="/users", tags=["Users"])


@user_router.get("")
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
) -> PaginatedResponse:
    try:
        count_result = await session.execute(select(func.count(User.id)))
        total = count_result.scalar() or 0
        result = await session.execute(
            select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
        )
        users = result.scalars().all()
        return PaginatedResponse(
            items=[UserResponse.model_validate(u) for u in users],
            total=total, skip=skip, limit=limit,
            has_more=(skip + limit) < total,
        )
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        raise HTTPException(status_code=500, detail="Failed to list users")


@user_router.get("/{user_id}")
async def get_user(user_id: UUID, session: AsyncSession = Depends(get_db)):
    try:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return UserDetailResponse.model_validate(user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user: {e}")
        raise HTTPException(status_code=500, detail="Failed to get user")


@user_router.get("/{user_id}/insights")
async def get_user_insights(user_id: UUID, session: AsyncSession = Depends(get_db)):
    """Returns rich insight data for the inbox right panel."""
    try:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Message stats
        total_cnt = (await session.execute(select(func.count(Message.id)).where(Message.user_id == user_id))).scalar() or 0
        ai_cnt    = (await session.execute(select(func.count(Message.id)).where(and_(Message.user_id == user_id, Message.is_ai_generated == True)))).scalar() or 0
        in_cnt    = (await session.execute(select(func.count(Message.id)).where(and_(Message.user_id == user_id, Message.direction == "incoming")))).scalar() or 0
        out_cnt   = total_cnt - in_cnt

        extra = user.extra_data or {}
        return {
            "user_id": str(user.id),
            "telegram_id": user.user_id,
            "name": f"{user.first_name or ''} {user.last_name or ''}".strip(),
            "username": user.username,
            "lead_score": user.lead_score,
            "ai_enabled": user.ai_enabled,
            "conversation_state": user.conversation_state,
            "tags": user.tags or [],
            # Field names used by frontend stats panel
            "message_count": total_cnt,
            "incoming_count": in_cnt,
            "outgoing_count": out_cnt,
            "ai_count": ai_cnt,
            # Legacy aliases (kept for compatibility)
            "total_messages": total_cnt,
            "ai_messages": ai_cnt,
            "incoming_messages": in_cnt,
            "first_message_at": user.first_message_at.isoformat() if user.first_message_at else None,
            "last_message_at": user.last_message_at.isoformat() if user.last_message_at else None,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            # CRM fields from extra_data
            "lead_label": extra.get("lead_label", extra.get("status_label", "")),
            "status_label": extra.get("status_label", "COLD"),
            "interest_tags": extra.get("interest_tags", []),
            "purchase_status": extra.get("purchase_status", "none"),
            "purchased_package": extra.get("purchased_package"),
            "purchase_value": extra.get("purchase_value"),
            "loop_status": extra.get("loop_status", "active"),
            "wishperme_status": extra.get("wishperme_status", "none"),
            "handoff_status": extra.get("handoff_status", "none"),
            "human_notes": extra.get("human_notes", ""),
            "next_best_offer": extra.get("next_best_offer", ""),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting insights: {e}")
        raise HTTPException(status_code=500, detail="Failed to get insights")


@user_router.patch("/{user_id}/insights")
async def update_user_insights(
    user_id: UUID,
    payload: Dict[str, Any] = Body(...),
    session: AsyncSession = Depends(get_db),
):
    """Update CRM insight fields (labels, tags, notes) stored in extra_data."""
    try:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        extra = dict(user.extra_data or {})
        crm_fields = ["lead_label", "status_label", "interest_tags", "purchase_status", "purchased_package",
                      "purchase_value", "loop_status", "wishperme_status", "handoff_status",
                      "human_notes", "next_best_offer"]
        for f in crm_fields:
            if f in payload:
                extra[f] = payload[f]
        user.extra_data = extra

        # Also allow direct ai_enabled toggle
        if "ai_enabled" in payload:
            user.ai_enabled = bool(payload["ai_enabled"])

        await session.commit()
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating insights: {e}")
        raise HTTPException(status_code=500, detail="Failed to update insights")


# ==================== ANALYTICS ====================

analytics_router = APIRouter(prefix="/analytics", tags=["Analytics"])


@analytics_router.get("/summary")
async def analytics_summary(
    days: int = Query(14, ge=1, le=365),
    session: AsyncSession = Depends(get_db),
):
    """Dashboard analytics: totals, funnel, lead distribution."""
    try:
        from sqlalchemy.sql import text as sql_text
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

        raw = await session.execute(sql_text("""
            SELECT
                (SELECT COUNT(*) FROM users WHERE is_bot = false OR is_bot IS NULL) AS total_users,
                (SELECT COUNT(*) FROM messages) AS total_messages,
                (SELECT COUNT(*) FROM messages WHERE direction = 'incoming') AS incoming_messages,
                (SELECT COUNT(*) FROM messages WHERE direction = 'outgoing') AS outgoing_messages,
                (SELECT COUNT(*) FROM messages WHERE is_ai_generated = true) AS ai_messages,
                (SELECT COUNT(*) FROM leads) AS total_leads,
                (SELECT AVG(lead_score) FROM users WHERE lead_score > 0) AS avg_lead_score,
                (SELECT COUNT(*) FROM users WHERE lead_score >= 70) AS hot_leads,
                (SELECT COUNT(*) FROM users WHERE lead_score >= 40 AND lead_score < 70) AS warm_leads,
                (SELECT COUNT(*) FROM users WHERE lead_score < 40 OR lead_score IS NULL) AS cold_leads,
                (SELECT COUNT(*) FROM users WHERE ai_enabled = true) AS ai_enabled_count
        """))
        row = raw.fetchone()

        # Messages per day (dynamic range)
        daily = await session.execute(
            sql_text("""
                SELECT DATE(created_at) as date, COUNT(*) as count
                FROM messages
                WHERE created_at >= :cutoff
                GROUP BY date ORDER BY date
            """),
            {"cutoff": cutoff},
        )
        daily_rows = daily.fetchall()

        # Lead stage distribution (new phases)
        stages = await session.execute(sql_text("""
            SELECT COALESCE(funnel_stage, 'hook') as stage, COUNT(*) as count
            FROM leads GROUP BY stage
            ORDER BY CASE funnel_stage
                WHEN 'hook' THEN 1
                WHEN 'engagement' THEN 2
                WHEN 'emotional_connection' THEN 3
                WHEN 'monetization' THEN 4
                ELSE 5 END
        """))

        # Top users by lead score
        top_users = await session.execute(sql_text("""
            SELECT id, first_name, last_name, username, lead_score, total_messages
            FROM users
            WHERE is_bot = false OR is_bot IS NULL
            ORDER BY lead_score DESC LIMIT 10
        """))

        return {
            "totals": {
                "users": row.total_users or 0,
                "messages": row.total_messages or 0,
                "incoming": row.incoming_messages or 0,
                "outgoing": row.outgoing_messages or 0,
                "ai_sent": row.ai_messages or 0,
                "leads": row.total_leads or 0,
                "avg_lead_score": round(float(row.avg_lead_score or 0), 1),
                "hot_leads": row.hot_leads or 0,
                "warm_leads": row.warm_leads or 0,
                "cold_leads": row.cold_leads or 0,
                "ai_enabled": row.ai_enabled_count or 0,
            },
            "daily_messages": [{"date": str(r.date), "count": r.count} for r in daily_rows],
            "lead_stages": [{"stage": r.stage, "count": r.count} for r in stages.fetchall()],
            "top_users": [
                {"user_id": str(r.id), "name": f"{r.first_name or ''} {r.last_name or ''}".strip() or "—",
                 "username": r.username, "score": r.lead_score or 0, "messages": r.total_messages or 0}
                for r in top_users.fetchall()
            ],
        }
    except Exception as e:
        logger.error(f"Analytics error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to load analytics")


# ==================== LEAD ROUTES ====================

lead_router = APIRouter(prefix="/leads", tags=["Leads"])


@lead_router.get("")
async def list_leads(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    status: Optional[str] = None,
    funnel_stage: Optional[str] = None,
    session: AsyncSession = Depends(get_db),
):
    try:
        filters = []
        if status:
            filters.append(Lead.status == status)
        if funnel_stage:
            filters.append(Lead.funnel_stage == funnel_stage)

        where_clause = and_(*filters) if filters else True
        count_result = await session.execute(select(func.count(Lead.id)).where(where_clause))
        total = count_result.scalar() or 0
        result = await session.execute(
            select(Lead).where(where_clause)
            .order_by(Lead.lead_score.desc())
            .offset(skip).limit(limit)
        )
        leads = result.scalars().all()
        return PaginatedResponse(
            items=[LeadResponse.model_validate(l) for l in leads],
            total=total, skip=skip, limit=limit,
            has_more=(skip + limit) < total,
        )
    except Exception as e:
        logger.error(f"Error listing leads: {e}")
        raise HTTPException(status_code=500, detail="Failed to list leads")


# ==================== TELEGRAM SYNC ====================

telegram_router = APIRouter(prefix="/telegram", tags=["Telegram"])


@telegram_router.post("/sync")
async def sync_telegram_chats(
    limit_per_chat: int = Query(150, ge=1, le=1000),
    max_dialogs: int = Query(0, ge=0, le=100000),
):
    """
    Pull ALL Telegram chat history into the database — main AND archived folders.
    max_dialogs=0 means unlimited (recommended).
    Safe to call multiple times — skips already-stored messages.
    """
    from app.services.telegram.client import telegram_client

    if not telegram_client.is_connected:
        raise HTTPException(
            status_code=503,
            detail="Telegram not connected."
        )

    try:
        import main as app_main
        u, m, total = await app_main._do_sync(telegram_client.client, limit_per_chat, max_dialogs)
        # Also sync folders in background
        asyncio.create_task(app_main._sync_telegram_folders(telegram_client.client))
        return {"status": "ok", "synced_users": u, "synced_messages": m, "total_dialogs": total}
    except Exception as ex:
        logger.error(f"Sync failed: {ex}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(ex))


# ── In-memory broadcast job tracker ──────────────────────────────────────────
_broadcast_jobs: Dict[str, Any] = {}


async def _run_broadcast(job_id: str, text: str, user_rows: list) -> None:
    """
    Background task: sends text to each (tg_id, db_uuid) pair.
    Updates _broadcast_jobs[job_id] in-place so /broadcast/status can poll it.
    """
    from app.services.telegram.client import telegram_client
    from app.db.models import Message as MsgModel
    import uuid as _uuid

    job = _broadcast_jobs[job_id]
    for tg_id, db_id in user_rows:
        if job.get("cancelled"):
            break
        try:
            # Use Telethon client directly — no ensure_connected() retry sleep
            sent_msg = await telegram_client.client.send_message(int(tg_id), text)
            tg_msg_id = sent_msg.id if sent_msg else None
            if tg_msg_id:
                async with db_manager.get_session() as sess:
                    sess.add(MsgModel(
                        message_id=tg_msg_id,
                        user_id=db_id,
                        text=text,
                        direction="outgoing",
                        has_media=False,
                        is_ai_generated=False,
                        extra_data={"broadcast": True, "job_id": job_id},
                        created_at=datetime.utcnow(),
                    ))
                    await sess.commit()
                job["sent"] += 1
            else:
                job["failed"] += 1
        except Exception as e:
            logger.warning(f"Broadcast tg_id={tg_id}: {e}")
            job["failed"] += 1
            job["last_error"] = str(e)
        await asyncio.sleep(0.6)   # Telegram flood guard (100 msgs/min safe rate)

    job["status"] = "done"
    logger.info(f"Broadcast {job_id} done: {job['sent']} sent, {job['failed']} failed")


@telegram_router.post("/broadcast")
async def broadcast_message(
    payload: Dict[str, Any] = Body(...),
):
    """
    Kick off a background broadcast.  Returns immediately with a job_id.
    Poll GET /broadcast/status?job_id=... for live progress.
    Body: { "message": "...", "limit": 500, "folder": null }
    """
    from app.services.telegram.client import telegram_client
    from sqlalchemy.sql import text as sql_text
    import json as _json, uuid as _uuid

    if not telegram_client.is_connected:
        raise HTTPException(status_code=503, detail="Telegram not connected")
    if not telegram_client.client:
        raise HTTPException(status_code=503, detail="Telegram client not initialised")

    text = str(payload.get("message", "")).strip()
    if not text:
        raise HTTPException(status_code=400, detail="message is required")

    limit  = min(int(payload.get("limit", 500)), 5000)
    folder = payload.get("folder")

    # Fetch recipients from DB
    folder_clause = ""
    params: dict = {"limit": limit}
    if folder:
        folder_clause = "AND metadata->'tg_folders' @> :folder_json::jsonb"
        params["folder_json"] = _json.dumps([folder])

    async with db_manager.get_session() as session:
        rows = await session.execute(sql_text(f"""
            SELECT user_id, id FROM users
            WHERE (is_bot = false OR is_bot IS NULL) {folder_clause}
            ORDER BY last_message_at DESC NULLS LAST
            LIMIT :limit
        """), params)
        user_rows = [(r.user_id, r.id) for r in rows.fetchall()]

    if not user_rows:
        return {"status": "ok", "sent": 0, "failed": 0, "total": 0,
                "message": "No users found"}

    job_id = str(_uuid.uuid4())[:8]
    _broadcast_jobs[job_id] = {
        "status": "running", "sent": 0, "failed": 0,
        "total": len(user_rows), "text": text[:80],
    }

    # Fire and forget — HTTP response returns instantly
    asyncio.create_task(_run_broadcast(job_id, text, user_rows))
    logger.info(f"Broadcast {job_id} started: {len(user_rows)} users, '{text[:60]}'")

    return {
        "status": "started",
        "job_id": job_id,
        "total": len(user_rows),
        "eta_seconds": round(len(user_rows) * 0.6),
    }


@telegram_router.get("/broadcast/status")
async def broadcast_status(job_id: str = Query(...)):
    """Poll broadcast progress."""
    job = _broadcast_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@telegram_router.post("/sync-folders")
async def sync_folders():
    """Fetch Telegram custom folders (Käufer, Warm, etc.) and tag users in DB."""
    from app.services.telegram.client import telegram_client
    if not telegram_client.is_connected:
        raise HTTPException(status_code=503, detail="Telegram not connected.")
    try:
        import main as app_main
        folders = await app_main._sync_telegram_folders(telegram_client.client)
        return {"status": "ok", "folders": folders}
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))


@telegram_router.get("/folders")
async def get_folders():
    """Return Telegram folder names — cached config first, user metadata fallback."""
    from sqlalchemy import select
    from sqlalchemy.sql import text as sql_text
    from app.db.models import Config
    try:
        async with db_manager.get_session() as session:
            # 1. Prefer the cached config list (set after sync-folders)
            res = await session.execute(select(Config).where(Config.key == "tg_folders"))
            cfg = res.scalars().first()
            if cfg and cfg.value:
                return {"folders": cfg.value}

            # 2. Fallback: derive unique folder names from user metadata
            result = await session.execute(sql_text("""
                SELECT DISTINCT jsonb_array_elements_text(metadata->'tg_folders') AS folder
                FROM users
                WHERE metadata->'tg_folders' IS NOT NULL
                  AND metadata->'tg_folders' != 'null'::jsonb
                  AND jsonb_array_length(metadata->'tg_folders') > 0
                ORDER BY folder
            """))
            folders = [row.folder for row in result.fetchall()]
            return {"folders": folders}
    except Exception:
        return {"folders": []}


@telegram_router.get("/stream")
async def stream_messages():
    """
    Server-Sent Events endpoint — streams new incoming/outgoing messages to the dashboard in real time.
    Connect with EventSource('/api/v1/telegram/stream').
    Each event: data: {"user_id": "...", "message": {...}}
    """
    import json
    from fastapi.responses import StreamingResponse
    import main as app_main

    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    app_main._sse_queues.append(queue)

    async def event_generator():
        try:
            # Send a ping immediately so the connection is confirmed
            yield "data: {\"type\":\"connected\"}\n\n"
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"data: {json.dumps(item)}\n\n"
                except asyncio.TimeoutError:
                    # Keep-alive ping every 20s
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            try:
                app_main._sse_queues.remove(queue)
            except ValueError:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@telegram_router.post("/reconnect")
async def reconnect_telegram():
    """Attempt to reconnect the Telegram session — re-runs full connect() from scratch."""
    from app.services.telegram.client import telegram_client
    try:
        # Always run the full connect() so it works even when client is None
        success = await telegram_client.connect()
        if success:
            me = await telegram_client.client.get_me()
            name = f"{me.first_name or ''} {me.last_name or ''}".strip()
            return {"status": "reconnected", "account": f"{name} (@{me.username})"}
        return {"status": "failed", "detail": "connect() returned False — check Railway logs for the error"}
    except Exception as e:
        logger.error(f"Reconnect error: {e}", exc_info=True)
        return {"status": "failed", "detail": str(e)}


@telegram_router.get("/status")
async def telegram_status():
    """Check Telegram connection status."""
    from app.services.telegram.client import telegram_client
    connected = telegram_client.is_connected
    me = None
    if connected:
        try:
            tg_me = await telegram_client.client.get_me()
            me = {
                "id": tg_me.id,
                "name": f"{tg_me.first_name or ''} {tg_me.last_name or ''}".strip(),
                "username": tg_me.username,
            }
        except Exception:
            pass
    return {"connected": connected, "account": me}


# ==================== AI / PERSONA ROUTES ====================

ai_router = APIRouter(prefix="/ai", tags=["AI"])


@ai_router.post("/persona")
async def save_persona(payload: Dict[str, Any] = Body(...)):
    """
    Save AI persona config. Accepts ANY JSON shape — will try to normalise
    common field names (persona / system_prompt / prompt / content) but also
    stores the raw payload so nothing is ever lost.
    """
    try:
        # Normalise: accept any string field as the persona prompt
        if "persona" not in payload:
            for alt in ("system_prompt", "prompt", "content", "instructions", "character"):
                if isinstance(payload.get(alt), str):
                    payload["persona"] = payload[alt]
                    break

        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == "persona"))
            cfg = result.scalars().first()
            if cfg:
                # Deep-merge so existing keys are preserved
                merged = {**(cfg.value or {}), **payload}
                cfg.value = merged
                cfg.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            else:
                cfg = Config(key="persona", value=payload, description="AI persona and model settings")
                session.add(cfg)
            await session.commit()
        return {"status": "saved", "key": "persona"}
    except Exception as e:
        logger.error(f"Error saving persona: {e}")
        raise HTTPException(status_code=500, detail="Failed to save persona")


@ai_router.get("/persona")
async def get_persona():
    """Get current AI persona config."""
    try:
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == "persona"))
            cfg = result.scalars().first()
            return cfg.value if cfg else {}
    except Exception as e:
        logger.error(f"Error getting persona: {e}")
        raise HTTPException(status_code=500, detail="Failed to get persona")


@ai_router.post("/toggle/{user_id}")
async def toggle_ai(
    user_id: UUID,
    enabled: bool,
    session: AsyncSession = Depends(get_db),
):
    """Enable/disable AI for a user."""
    try:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.ai_enabled = enabled
        await session.commit()
        return {"user_id": user_id, "ai_enabled": user.ai_enabled}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling AI: {e}")
        raise HTTPException(status_code=500, detail="Failed to toggle AI")


@ai_router.post("/enable-all")
async def enable_ai_for_all(session: AsyncSession = Depends(get_db)):
    """Set ai_enabled=True for every non-bot user."""
    try:
        from sqlalchemy import update as sa_update
        result = await session.execute(
            sa_update(User)
            .where((User.is_bot == False) | (User.is_bot == None))
            .values(ai_enabled=True)
            .returning(User.id)
        )
        count = len(result.fetchall())
        await session.commit()
        logger.info(f"Enabled AI for {count} users")
        return {"status": "ok", "enabled_count": count}
    except Exception as e:
        logger.error(f"Error enabling AI for all: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@ai_router.post("/disable-all")
async def disable_ai_for_all(session: AsyncSession = Depends(get_db)):
    """Set ai_enabled=False for every non-bot user."""
    try:
        from sqlalchemy import update as sa_update
        result = await session.execute(
            sa_update(User)
            .where((User.is_bot == False) | (User.is_bot == None))
            .values(ai_enabled=False)
            .returning(User.id)
        )
        count = len(result.fetchall())
        await session.commit()
        logger.info(f"Disabled AI for {count} users")
        return {"status": "ok", "disabled_count": count}
    except Exception as e:
        logger.error(f"Error disabling AI for all: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@ai_router.get("/status")
async def ai_status():
    """
    Check if AI is fully operational:
    - ANTHROPIC_API_KEY set
    - Persona configured
    - Claude reachable (live ping)
    """
    from app.core.config import settings
    result: Dict[str, Any] = {
        "api_key_set": bool(settings.ANTHROPIC_API_KEY),
        "model": settings.CLAUDE_MODEL,
        "persona_saved": False,
        "claude_reachable": False,
        "test_response": None,
        "error": None,
    }
    try:
        async with db_manager.get_session() as session:
            res = await session.execute(select(Config).where(Config.key == "persona"))
            cfg = res.scalars().first()
            result["persona_saved"] = bool(cfg and cfg.value)
            if cfg and cfg.value:
                result["model"] = cfg.value.get("model", settings.CLAUDE_MODEL)
    except Exception as e:
        result["error"] = f"DB error: {e}"

    if result["api_key_set"]:
        try:
            import anthropic, asyncio as aio
            client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            def _ping():
                return client.messages.create(
                    model=result["model"],
                    max_tokens=30,
                    messages=[{"role": "user", "content": "Say 'AI online' in 3 words max."}],
                )
            resp = await aio.to_thread(_ping)
            result["claude_reachable"] = True
            result["test_response"] = resp.content[0].text.strip()
        except Exception as e:
            result["error"] = str(e)

    return result


# ==================== CONFIG ROUTES (packages, media, rules) ====================

config_router = APIRouter(prefix="/config", tags=["Config"])


@config_router.get("/{key}")
async def get_config(key: str):
    """Get config value by key."""
    try:
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == key))
            cfg = result.scalars().first()
            return {"key": key, "value": cfg.value if cfg else None}
    except Exception as e:
        logger.error(f"Error getting config {key}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get config")


@config_router.post("/{key}")
async def save_config(key: str, payload: Any = Body(...)):
    """
    Save or merge config for a key.
    Accepts any JSON value (dict, list, string, …).
    If payload is a dict containing '__merge': true it deep-merges instead of replacing.
    """
    try:
        merge = False
        if isinstance(payload, dict):
            merge = payload.pop("__merge", False)
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == key))
            cfg = result.scalars().first()
            if cfg:
                if merge and isinstance(cfg.value, dict) and isinstance(payload, dict):
                    merged = {**cfg.value, **payload}
                    cfg.value = merged
                else:
                    cfg.value = payload
                cfg.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            else:
                cfg = Config(key=key, value=payload)
                session.add(cfg)
            await session.commit()
        return {"status": "saved", "key": key}
    except Exception as e:
        logger.error(f"Error saving config {key}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save config")


@config_router.get("")
async def list_config_keys():
    """List all config keys."""
    try:
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config.key, Config.description, Config.updated_at))
            rows = result.all()
            return [{"key": r[0], "description": r[1], "updated_at": str(r[2])} for r in rows]
    except Exception as e:
        logger.error(f"Error listing config: {e}")
        raise HTTPException(status_code=500, detail="Failed to list config")


# ==================== ROUTER AGGREGATION ====================

api_router = APIRouter()
api_router.include_router(router)
api_router.include_router(user_router)
api_router.include_router(lead_router)
api_router.include_router(telegram_router)
api_router.include_router(ai_router)
api_router.include_router(config_router)
api_router.include_router(analytics_router)

__all__ = ["api_router"]
