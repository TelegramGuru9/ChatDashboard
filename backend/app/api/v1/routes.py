"""
app/api/v1/routes.py
All API v1 routes: messages, users, leads, AI, telegram sync, config.
"""

import logging
import asyncio
from typing import Optional, Any, Dict
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Body, UploadFile, File, Form
from sqlalchemy import select, and_, or_, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db, db_manager
from app.db.models import Message, User, Lead, Config, Memory, Conversation
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
    creator_id: Optional[str] = Query(None),
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
        creator_clause = ""
        params: dict = {"limit": limit, "skip": skip}
        if folder:
            folder_clause = "AND u.metadata->'tg_folders' @> :folder_json::jsonb"
            import json
            params["folder_json"] = json.dumps([folder])
        if creator_id:
            creator_clause = "AND u.creator_id = :creator_id::uuid"
            params["creator_id"] = creator_id

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
            {creator_clause}
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
        count_creator_clause = ""
        if folder:
            count_clause = "AND u.metadata->'tg_folders' @> :folder_json::jsonb"
            count_params["folder_json"] = params["folder_json"]
        if creator_id:
            count_creator_clause = "AND u.creator_id = :creator_id::uuid"
            count_params["creator_id"] = creator_id
        count_res = await session.execute(sql_text(f"""
            SELECT COUNT(*) FROM users u
            WHERE (u.is_bot = false OR u.is_bot IS NULL) {count_clause} {count_creator_clause}
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


@router.post("/send-file")
async def send_file(
    user_id: str = Form(...),
    file: UploadFile = File(...),
    caption: str = Form(default=""),
    session: AsyncSession = Depends(get_db),
):
    """Upload a file and send it to a user via Telegram."""
    try:
        uid = UUID(user_id)
        result = await session.execute(select(User).where(User.id == uid))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        from app.services.telegram.client import telegram_client
        if not telegram_client.is_connected:
            raise HTTPException(status_code=503, detail="Telegram not connected")

        file_bytes = await file.read()
        tg_msg_id = await telegram_client.send_file(
            user.user_id, file_bytes,
            caption=caption.strip(),
            file_name=file.filename or "file",
        )
        if tg_msg_id is None:
            raise HTTPException(status_code=503, detail="Failed to send file via Telegram")

        msg = Message(
            message_id=tg_msg_id,
            user_id=user.id,
            text=caption.strip() or None,
            direction="outgoing",
            has_media=True,
            media_type=file.content_type or "file",
            is_ai_generated=False,
            extra_data={"file_name": file.filename or "file"},
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
        logger.error(f"Error sending file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send-package")
async def send_package_manual(
    payload: Dict[str, Any] = Body(...),
    session: AsyncSession = Depends(get_db),
):
    """Send a configured package message manually from the inbox."""
    try:
        user_id = UUID(str(payload.get("user_id", "")))
        pkg_index = int(payload.get("pkg_index", 0))

        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Load packages from config
        cfg_result = await session.execute(select(Config).where(Config.key == "packages"))
        cfg = cfg_result.scalars().first()
        packages = cfg.value if cfg and isinstance(cfg.value, list) else []
        if pkg_index < 0 or pkg_index >= len(packages):
            raise HTTPException(status_code=400, detail="Package not found")

        pkg = packages[pkg_index]
        pkg_message = pkg.get("message", "")
        pkg_name = pkg.get("name", f"Paket {pkg_index + 1}")
        if not pkg_message:
            raise HTTPException(status_code=400, detail="Package has no message configured")

        from app.services.telegram.client import telegram_client
        if not telegram_client.is_connected:
            raise HTTPException(status_code=503, detail="Telegram not connected")

        tg_msg_id = await telegram_client.send_message(user.user_id, pkg_message)
        if tg_msg_id is None:
            raise HTTPException(status_code=503, detail="Failed to send via Telegram")

        msg = Message(
            message_id=tg_msg_id,
            user_id=user.id,
            text=pkg_message,
            direction="outgoing",
            has_media=False,
            is_ai_generated=False,
            extra_data={"pkg_name": pkg_name, "pkg_index": pkg_index},
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
        logger.error(f"Error sending package: {e}", exc_info=True)
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


@user_router.post("/generate-memories")
async def generate_all_memories(
    creator_id: Optional[str] = Query(None),
):
    """
    Deep memory sync: for every user, generate a Claude AI summary of their
    full chat history and store it in extra_data["ai_summary"].
    Runs in the background and returns immediately with a job confirmation.
    """
    import asyncio
    try:
        import main as app_main
        asyncio.create_task(app_main._run_deep_memory_sync(creator_id=creator_id))
        return {
            "status": "started",
            "message": "Memory generation running in background. Check Railway logs for progress.",
        }
    except Exception as e:
        logger.error(f"generate_all_memories error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@user_router.post("/{user_id}/reset")
async def reset_user_conversation(
    user_id: UUID,
    session: AsyncSession = Depends(get_db),
):
    """
    Hard-delete the user and ALL related data so the bot treats the next
    incoming message as if it is the very first contact.

    Deleted in order (FK-safe):
      1. Memory  (embeddings / AI memory)
      2. Message (full chat history)
      3. Conversation (state record)
      4. Lead    (CRM funnel data)
      5. User    (the row itself — recreated automatically on next Telegram message)
    """
    try:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        from sqlalchemy import delete as sa_delete

        # Delete child rows first to satisfy FK constraints
        await session.execute(sa_delete(Memory).where(Memory.user_id == user_id))
        await session.execute(sa_delete(Message).where(Message.user_id == user_id))
        await session.execute(sa_delete(Conversation).where(Conversation.user_id == user_id))
        await session.execute(sa_delete(Lead).where(Lead.user_id == user_id))

        # Delete the user row itself — Telethon will recreate it on the next message
        await session.delete(user)

        await session.commit()
        logger.info(f"[reset] Hard-deleted user {user_id} and all related data")
        return {"status": "deleted", "user_id": str(user_id)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete user")


@user_router.get("/{user_id}/photo")
async def get_user_photo(user_id: UUID, session: AsyncSession = Depends(get_db)):
    """Fetch Telegram profile photo for a user and return as base64 data URL."""
    try:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Check cached photo URL in extra_data
        extra = user.extra_data or {}
        cached = extra.get("tg_photo_url")
        if cached:
            return {"photo_url": cached}

        from app.services.telegram.client import telegram_client
        if not telegram_client.is_connected or not user.user_id:
            return {"photo_url": None}

        try:
            import io, base64
            # Force-resolve the entity so Telethon caches the access hash.
            # Priority: username (always resolvable) > cached user_id > raw int fallback.
            # New sessions have an empty entity cache, so raw integer IDs fail without
            # a prior sync or live message from the user.
            entity = user.user_id  # final fallback
            if user.username:
                try:
                    entity = await telegram_client.client.get_entity(f"@{user.username}")
                except Exception:
                    pass
            else:
                try:
                    entity = await telegram_client.client.get_entity(user.user_id)
                except Exception:
                    pass  # will fail for un-cached users without username
            bio = io.BytesIO()
            path = await telegram_client.client.download_profile_photo(entity, file=bio)
            if path is None:
                return {"photo_url": None}
            bio.seek(0)
            b64 = base64.b64encode(bio.read()).decode()
            data_url = f"data:image/jpeg;base64,{b64}"
            # Cache in extra_data so it survives future restarts
            new_extra = dict(extra)
            new_extra["tg_photo_url"] = data_url
            user.extra_data = new_extra
            await session.commit()
            return {"photo_url": data_url}
        except Exception:
            return {"photo_url": None}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching photo for {user_id}: {e}")
        return {"photo_url": None}


@user_router.get("/hot/list")
async def list_hot_users(
    creator_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
):
    """
    Return leads bucketed into WARM / HOT / SALE for the HOT inbox pipeline.
    WARM  = lead_label WARM  (list message sent)
    HOT   = lead_label HOT   (package message sent)
    SALE  = lead_label BUYER (payment confirmed)
    """
    try:
        import uuid as _uuid
        q = select(User).where(
            or_(
                User.extra_data["lead_label"].astext == "WARM",
                User.extra_data["lead_label"].astext == "HOT",
                User.extra_data["lead_label"].astext == "BUYER",
                User.conversation_state.in_(["hot", "lead_hot", "customer"]),
            )
        )
        if creator_id:
            try:
                q = q.where(User.creator_id == _uuid.UUID(creator_id))
            except Exception:
                pass
        q = q.order_by(User.last_message_at.desc().nullslast()).offset(skip).limit(limit)
        res = await session.execute(q)
        users = res.scalars().all()

        warm, hot, sale = [], [], []
        for u in users:
            extra = u.extra_data or {}
            label = str(extra.get("lead_label") or "").strip().upper()
            # conversation_state fallback
            if not label:
                cs = u.conversation_state or ""
                if cs == "customer":          label = "BUYER"
                elif "hot" in cs.lower():     label = "HOT"
                else:                         label = "WARM"

            row = {
                "id":              str(u.id),
                "telegram_id":     u.user_id,
                "name":            f"{u.first_name or ''} {u.last_name or ''}".strip() or "Unknown",
                "username":        u.username,
                "lead_label":      label,
                "last_message_at": u.last_message_at.isoformat() if u.last_message_at else None,
                "message_count":   u.total_messages or 0,
                "ai_enabled":      u.ai_enabled,
                # WARM specific
                "list_sent_at":    extra.get("list_sent_at"),
                # HOT specific
                "hot_pkg_name":    extra.get("hot_pkg_name", ""),
                "pkg_sent_at":     extra.get("pkg_sent_at"),
                # SALE specific
                "sale_completed_at": extra.get("sale_completed_at"),
            }
            if label == "BUYER":
                sale.append(row)
            elif label == "HOT":
                hot.append(row)
            else:  # WARM or fallback
                warm.append(row)

        return {
            "warm": warm,
            "hot":  hot,
            "sale": sale,
            "total": len(warm) + len(hot) + len(sale),
        }
    except Exception as e:
        logger.error(f"list_hot_users error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ANALYTICS ====================

analytics_router = APIRouter(prefix="/analytics", tags=["Analytics"])


@analytics_router.get("/summary")
async def analytics_summary(
    days: int = Query(14, ge=1, le=365),
    creator_id: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_db),
):
    """Dashboard analytics: totals, funnel, lead distribution."""
    try:
        from sqlalchemy.sql import text as sql_text
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

        cfilter = "AND creator_id = :cid::uuid" if creator_id else ""
        cparams = {"cid": creator_id} if creator_id else {}

        raw = await session.execute(sql_text(f"""
            SELECT
                (SELECT COUNT(*) FROM users WHERE (is_bot = false OR is_bot IS NULL) {cfilter}) AS total_users,
                (SELECT COUNT(*) FROM messages WHERE user_id IN
                    (SELECT id FROM users WHERE (is_bot = false OR is_bot IS NULL) {cfilter})) AS total_messages,
                (SELECT COUNT(*) FROM messages WHERE direction = 'incoming' AND user_id IN
                    (SELECT id FROM users WHERE (is_bot = false OR is_bot IS NULL) {cfilter})) AS incoming_messages,
                (SELECT COUNT(*) FROM messages WHERE direction = 'outgoing' AND user_id IN
                    (SELECT id FROM users WHERE (is_bot = false OR is_bot IS NULL) {cfilter})) AS outgoing_messages,
                (SELECT COUNT(*) FROM messages WHERE is_ai_generated = true AND user_id IN
                    (SELECT id FROM users WHERE (is_bot = false OR is_bot IS NULL) {cfilter})) AS ai_messages,
                (SELECT COUNT(*) FROM users
                    WHERE (is_bot = false OR is_bot IS NULL)
                      AND COALESCE(total_messages, 0) > 0 {cfilter}) AS total_leads,
                (SELECT AVG(lead_score) FROM users WHERE lead_score > 0 {cfilter}) AS avg_lead_score,
                (SELECT COUNT(*) FROM users WHERE lead_score >= 70 {cfilter}) AS hot_leads,
                (SELECT COUNT(*) FROM users WHERE lead_score >= 40 AND lead_score < 70 {cfilter}) AS warm_leads,
                (SELECT COUNT(*) FROM users WHERE (lead_score < 40 OR lead_score IS NULL) {cfilter}) AS cold_leads,
                (SELECT COUNT(*) FROM users WHERE ai_enabled = true {cfilter}) AS ai_enabled_count,
                (SELECT COUNT(*) FROM users WHERE (is_bot = false OR is_bot IS NULL)
                    AND metadata->>'lead_label' = 'HOT' {cfilter}) AS hot_label_count
        """), cparams)
        row = raw.fetchone()

        # Messages per day (dynamic range)
        daily_cfilter = "AND user_id IN (SELECT id FROM users WHERE creator_id = :cid::uuid)" if creator_id else ""
        daily_params = {"cutoff": cutoff, **cparams}
        daily = await session.execute(sql_text(f"""
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM messages
            WHERE created_at >= :cutoff {daily_cfilter}
            GROUP BY date ORDER BY date
        """), daily_params)
        daily_rows = daily.fetchall()

        # Lead stage distribution
        ucfilter = "AND u.creator_id = :cid::uuid" if creator_id else ""
        lcfilter = "AND l.user_id IN (SELECT id FROM users WHERE creator_id = :cid::uuid)" if creator_id else ""
        try:
            stages_res = await session.execute(sql_text(f"""
                SELECT stage, SUM(cnt) AS count
                FROM (
                    SELECT
                        CASE l.funnel_stage
                            WHEN 'hook'                 THEN 'hook'
                            WHEN 'engagement'           THEN 'engagement'
                            WHEN 'emotional_connection' THEN 'emotional_connection'
                            WHEN 'monetization'         THEN 'monetization'
                            ELSE 'hook'
                        END AS stage, COUNT(*) AS cnt
                    FROM leads l
                    WHERE 1=1 {lcfilter}
                    GROUP BY 1
                    UNION ALL
                    SELECT
                        CASE
                            WHEN COALESCE(u.total_messages,0) >= 20 THEN 'emotional_connection'
                            WHEN COALESCE(u.total_messages,0) >= 10 THEN 'engagement'
                            ELSE 'hook'
                        END AS stage, COUNT(*) AS cnt
                    FROM users u
                    WHERE (u.is_bot = false OR u.is_bot IS NULL)
                      AND COALESCE(u.total_messages,0) > 0
                      AND NOT EXISTS (SELECT 1 FROM leads l2 WHERE l2.user_id = u.id)
                      {ucfilter}
                    GROUP BY 1
                ) combined
                GROUP BY stage
                ORDER BY CASE stage
                    WHEN 'hook' THEN 1 WHEN 'engagement' THEN 2
                    WHEN 'emotional_connection' THEN 3 WHEN 'monetization' THEN 4 ELSE 5
                END
            """), cparams)
            stage_rows = stages_res.fetchall()
        except Exception as e:
            logger.warning(f"lead_stages query failed: {e}")
            stage_rows = []

        try:
            top_res = await session.execute(sql_text(f"""
                SELECT id, first_name, last_name, username,
                       COALESCE(lead_score, 0) AS lead_score,
                       COALESCE(total_messages, 0) AS total_messages
                FROM users
                WHERE (is_bot = false OR is_bot IS NULL)
                  AND COALESCE(total_messages, 0) > 0
                  {ucfilter}
                ORDER BY lead_score DESC NULLS LAST, total_messages DESC NULLS LAST
                LIMIT 10
            """), cparams)
            top_rows = top_res.fetchall()
        except Exception as e:
            logger.warning(f"top_users query failed: {e}")
            top_rows = []

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
                "hot_label_count": row.hot_label_count or 0,
            },
            "daily_messages": [{"date": str(r.date), "count": r.count} for r in daily_rows],
            "lead_stages": [{"stage": r.stage, "count": r.count} for r in stage_rows],
            "top_users": [
                {
                    "user_id": str(r.id),
                    "name": f"{r.first_name or ''} {r.last_name or ''}".strip() or "—",
                    "username": r.username or "",
                    "score": r.lead_score or 0,
                    "messages": r.total_messages or 0,
                }
                for r in top_rows
            ],
        }
    except Exception as e:
        logger.error(f"Analytics error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load analytics: {e}")


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
    creator_id: Optional[str] = Query(None),
):
    """
    Pull ALL Telegram chat history into the database — main AND archived folders.
    max_dialogs=0 means unlimited (recommended).
    Safe to call multiple times — skips already-stored messages.
    When creator_id is provided, uses that creator's pool client and scopes users to that creator.
    """
    from app.services.telegram.client import telegram_client, creator_pool

    # Resolve the right Telethon client + creator scope
    tg_client = None
    resolved_creator_id = None

    if creator_id:
        mgr = creator_pool.get_client(creator_id)
        if mgr and mgr.is_connected:
            tg_client = mgr.client
            resolved_creator_id = creator_id
        else:
            raise HTTPException(
                status_code=503,
                detail=f"Creator not connected — connect it first on the Creators page.",
            )
    else:
        if not telegram_client.is_connected:
            raise HTTPException(status_code=503, detail="Telegram not connected.")
        tg_client = telegram_client.client

    try:
        import main as app_main

        async def _run_sync_bg():
            try:
                u, m, total = await app_main._do_sync(
                    tg_client, limit_per_chat, max_dialogs, creator_id=resolved_creator_id
                )
                logger.info(f"Background sync complete: {total} dialogs, {u} new users, {m} new messages")
                asyncio.create_task(app_main._sync_telegram_folders(tg_client))
            except Exception as _ex:
                logger.error(f"Background sync failed: {_ex}", exc_info=True)

        asyncio.create_task(_run_sync_bg())
        return {
            "status": "started",
            "message": "Sync running in background — check Railway logs for progress",
        }
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


@telegram_router.post("/test-cash-alarm")
async def test_cash_alarm(
    payload: Dict[str, Any] = Body(default={}),
    creator_id: Optional[str] = Query(None),
):
    """
    Simulate a sale — send the Cash Alarm message to all configured cash_notify_users.
    Used for testing the workflow from the dashboard.
    """
    from app.services.telegram.client import telegram_client
    from app.services.telegram.client import creator_pool as creator_client_pool

    amount       = str(payload.get("amount", "")).strip()
    package_name = str(payload.get("package_name", "")).strip()
    event_type   = str(payload.get("event_type", "sale")).strip()

    # Build the notification message based on event type
    if event_type == "list_sent":
        cash_msg = (
            "💵💵💵 $ CASH CASH CASH $ 💵💵💵\n\n"
            "🌡️ TEST — Warm Lead — Liste angefragt!"
        )
    elif event_type.startswith("package"):
        pkg_label = package_name or event_type.replace("_", " ").title()
        cash_msg = (
            "💵💵💵 $ CASH CASH CASH $ 💵💵💵\n\n"
            f"🔥 TEST — HOT Lead — {pkg_label} gesendet!"
        )
    else:
        cash_msg = "💵💵💵 $ CASH CASH CASH $ 💵💵💵\n\n🎉 TEST — Kauf simuliert!"
        if package_name:
            cash_msg += f"\n📦 Paket: {package_name}"
        if amount:
            cash_msg += f"\n💰 Betrag: €{amount}"

    # Load notify users from DB (scoped to creator if provided)
    notify_users: list = []
    try:
        async with db_manager.get_session() as session:
            from sqlalchemy import select as sa_select
            q = sa_select(Config).where(Config.key == "cash_notify_users")
            if creator_id:
                q = q.where(Config.creator_id == creator_id)
            cfg_res = await session.execute(q)
            cfg = cfg_res.scalars().first()
            if cfg and isinstance(cfg.value, list):
                notify_users = cfg.value
    except Exception as e:
        logger.error(f"[test-cash] DB error loading notify users: {e}")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    if not notify_users:
        raise HTTPException(
            status_code=400,
            detail="No cash_notify_users configured — add users in the Cash Alarm page first.",
        )

    # Resolve Telegram client (creator-scoped or global fallback)
    tg = None
    if creator_id:
        try:
            mgr = creator_client_pool.get_client(creator_id)
            if mgr and mgr.is_connected:
                tg = mgr.client
        except Exception:
            pass
    if tg is None:
        if not telegram_client.is_connected:
            raise HTTPException(status_code=503, detail="Telegram not connected.")
        tg = telegram_client.client

    sent, failed, errors = 0, 0, []
    for raw_user in notify_users:
        uname = str(raw_user).lstrip("@").strip()
        if not uname:
            continue
        try:
            await tg.send_message(uname, cash_msg)
            sent += 1
            logger.info(f"[test-cash] ✓ Sent to @{uname}")
        except Exception as e:
            failed += 1
            errors.append(f"@{uname}: {e}")
            logger.warning(f"[test-cash] ✗ Failed @{uname}: {e}")

    if sent == 0:
        raise HTTPException(
            status_code=500,
            detail=f"All sends failed. Errors: {'; '.join(errors)}",
        )

    return {
        "status": "ok",
        "sent_to": sent,
        "failed": failed,
        "errors": errors,
    }


@telegram_router.post("/test-send-message")
async def test_send_message(
    payload: Dict[str, Any] = Body(...),
    creator_id: Optional[str] = Query(None),
):
    """
    Send an arbitrary text message to all configured cash_notify_users.
    Used by the Packages page to preview a package message.
    """
    from app.services.telegram.client import telegram_client
    from app.services.telegram.client import creator_pool as creator_client_pool

    text = str(payload.get("text", "")).strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    # Load notify users
    notify_users: list = []
    try:
        async with db_manager.get_session() as session:
            from sqlalchemy import select as sa_select
            q = sa_select(Config).where(Config.key == "cash_notify_users")
            if creator_id:
                q = q.where(Config.creator_id == creator_id)
            cfg_res = await session.execute(q)
            cfg = cfg_res.scalars().first()
            if cfg and isinstance(cfg.value, list):
                notify_users = cfg.value
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    if not notify_users:
        raise HTTPException(status_code=400, detail="No cash_notify_users configured — add users in the Cash Alarm page first.")

    # Resolve client
    tg = None
    if creator_id:
        try:
            mgr = creator_client_pool.get_client(creator_id)
            if mgr and mgr.is_connected:
                tg = mgr.client
        except Exception:
            pass
    if tg is None:
        if not telegram_client.is_connected:
            raise HTTPException(status_code=503, detail="Telegram not connected.")
        tg = telegram_client.client

    sent, failed, errors = 0, 0, []
    for raw_user in notify_users:
        uname = str(raw_user).lstrip("@").strip()
        if not uname:
            continue
        try:
            await tg.send_message(uname, text)
            sent += 1
        except Exception as e:
            failed += 1
            errors.append(f"@{uname}: {e}")

    if sent == 0:
        raise HTTPException(status_code=500, detail=f"All sends failed: {'; '.join(errors)}")

    return {"status": "ok", "sent_to": sent, "failed": failed, "errors": errors}


@telegram_router.post("/test-ai-reply")
async def test_ai_reply(payload: Dict[str, Any] = Body(...)):
    """
    Manually trigger AI response for a telegram_user_id.
    Use to debug why AI is not replying.
    Returns the generated text or the error.
    """
    import traceback
    from app.services.telegram.message_handler import message_processor
    from app.db.database import db_manager
    from app.db.models import User
    from sqlalchemy import select as sa_select

    tg_id = int(payload.get("telegram_id", 0))
    text  = str(payload.get("text", "test")).strip()
    if not tg_id:
        raise HTTPException(status_code=400, detail="telegram_id required")

    # Find user in DB
    async with db_manager.get_session() as session:
        res = await session.execute(sa_select(User).where(User.user_id == tg_id))
        user = res.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail=f"User with telegram_id {tg_id} not found in DB")
        user_id     = user.id
        creator_id  = str(user.creator_id) if user.creator_id else None

    # Also test direct send
    from app.services.telegram.client import telegram_client
    send_error = None
    try:
        msg_id = await telegram_client.send_message(tg_id, "🤖 TEST DIRECT SEND")
        if msg_id is None:
            # Try resolving entity first
            try:
                entity = await telegram_client.client.get_input_entity(tg_id)
                msg_id = await telegram_client.send_message(tg_id, "🤖 TEST DIRECT SEND 2")
            except Exception as e2:
                send_error = f"Entity resolve failed: {e2}"
    except Exception as e:
        send_error = str(e)

    try:
        await message_processor._generate_and_send_ai_response(
            user_id, tg_id, text, creator_id
        )
        return {
            "status": "ok",
            "message": f"AI response triggered for tg_id={tg_id}",
            "direct_send_error": send_error,
            "telegram_connected": telegram_client.is_connected,
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "trace": traceback.format_exc(), "direct_send_error": send_error}


@telegram_router.post("/reconnect")
async def reconnect_telegram():
    """Attempt to reconnect the Telegram session — skips if already connected."""
    from app.services.telegram.client import telegram_client
    try:
        # Already connected — don't disconnect/reconnect unnecessarily
        if telegram_client.is_connected:
            me = await telegram_client.client.get_me()
            name = f"{getattr(me,'first_name','') or ''} {getattr(me,'last_name','') or ''}".strip()
            return {"status": "connected", "account": f"{name} (@{me.username})"}
        success = await telegram_client.connect()
        if success:
            me = await telegram_client.client.get_me()
            name = f"{me.first_name or ''} {me.last_name or ''}".strip()
            return {"status": "reconnected", "account": f"{name} (@{me.username})"}
        # Surface the actual error reason stored by connect()
        reason = getattr(telegram_client, "_last_error", "") or "Unknown error — check Railway logs"
        return {"status": "failed", "detail": reason}
    except Exception as e:
        logger.error(f"Reconnect error: {e}", exc_info=True)
        return {"status": "failed", "detail": str(e)}


@telegram_router.get("/status")
async def telegram_status():
    """Check Telegram connection status + surface env-var diagnostic info."""
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

    # Diagnostic: surface config issues even before reconnect attempt
    diag: dict = {}
    if not connected:
        from app.core.config import settings
        has_api_id    = bool(settings.TELEGRAM_API_ID)
        has_api_hash  = bool(settings.TELEGRAM_API_HASH)
        has_session   = bool(settings.TELEGRAM_SESSION_STRING)
        last_err      = getattr(telegram_client, "_last_error", "")
        if not has_api_id or not has_api_hash:
            diag["config_error"] = "TELEGRAM_API_ID or TELEGRAM_API_HASH missing in Railway env vars"
        elif not has_session:
            diag["config_error"] = "TELEGRAM_SESSION_STRING missing in Railway env vars"
        elif last_err:
            diag["last_error"] = last_err
        diag["env_check"] = {
            "api_id_set": has_api_id,
            "api_hash_set": has_api_hash,
            "session_string_set": has_session,
        }

    return {"connected": connected, "account": me, **diag}


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


def _scoped_key(key: str, creator_id: Optional[str], default_id: Optional[str]) -> str:
    """Return creator-scoped config key. Default creator uses plain keys."""
    if not creator_id or creator_id == default_id:
        return key
    return f"creator:{creator_id}:{key}"


async def _get_default_creator_id() -> Optional[str]:
    """Return the UUID string of the default creator, or None."""
    try:
        from app.db.models import Creator as CreatorModel
        async with db_manager.get_session() as session:
            res = await session.execute(select(CreatorModel).where(CreatorModel.is_default == True))
            c = res.scalars().first()
            return str(c.id) if c else None
    except Exception:
        return None


@config_router.get("/{key}")
async def get_config(key: str, creator_id: Optional[str] = Query(None)):
    """Get config value by key, scoped to creator."""
    try:
        default_id = await _get_default_creator_id()
        scoped = _scoped_key(key, creator_id, default_id)
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == scoped))
            cfg = result.scalars().first()
            # Fallback: if non-default creator has no config yet, return the default creator's config
            if cfg is None and scoped != key:
                result2 = await session.execute(select(Config).where(Config.key == key))
                cfg = result2.scalars().first()
            return {"key": key, "value": cfg.value if cfg else None}
    except Exception as e:
        logger.error(f"Error getting config {key}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get config")


@config_router.post("/{key}")
async def save_config(key: str, creator_id: Optional[str] = Query(None), payload: Any = Body(...)):
    """Save or merge config for a key, scoped to creator."""
    try:
        default_id = await _get_default_creator_id()
        scoped = _scoped_key(key, creator_id, default_id)
        merge = False
        if isinstance(payload, dict):
            merge = payload.pop("__merge", False)
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == scoped))
            cfg = result.scalars().first()
            if cfg:
                if merge and isinstance(cfg.value, dict) and isinstance(payload, dict):
                    cfg.value = {**cfg.value, **payload}
                else:
                    cfg.value = payload
                cfg.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            else:
                cfg = Config(key=scoped, value=payload)
                session.add(cfg)
            await session.commit()
        return {"status": "saved", "key": key}
    except Exception as e:
        logger.error(f"Error saving config {key}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save config")


@config_router.post("/order_counter/increment")
async def increment_order_counter(creator_id: Optional[str] = Query(None)):
    """
    Atomically increment and return the per-creator order counter.
    Returns the NEW counter value as an integer (e.g. 1, 2, 3 …).
    """
    try:
        default_id = await _get_default_creator_id()
        scoped = _scoped_key("order_counter", creator_id, default_id)
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == scoped))
            cfg = result.scalars().first()
            if cfg is None:
                new_val = 1
                cfg = Config(key=scoped, value=new_val)
                session.add(cfg)
            else:
                current = cfg.value if isinstance(cfg.value, int) else 0
                new_val = current + 1
                cfg.value = new_val
                cfg.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await session.commit()
        return {"counter": new_val, "formatted": f"#{new_val:06d}"}
    except Exception as e:
        logger.error(f"increment_order_counter error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


# ==================== CREATOR ROUTES ====================

from app.db.models import Creator as CreatorModel

creators_router = APIRouter(prefix="/creators", tags=["Creators"])


@creators_router.post("/reset-all")
async def reset_all_creators():
    """
    Full clean slate:
    - Wipe ALL chat data: users, messages, memories, leads, analytics, conversations
    - Wipe ALL creators + disconnect pool clients
    - Keep config intact (persona, packages, system prompt, reply settings)
    - Reseed one fresh default creator
    """
    import uuid as _uuid
    from app.services.telegram.client import telegram_client, creator_pool
    from sqlalchemy import text as _text

    try:
        # 1. Disconnect every pool client
        for cid in list(creator_pool._clients.keys()):
            try:
                await creator_pool.disconnect_creator(cid)
            except Exception:
                pass

        # 2. Disconnect default singleton
        try:
            await telegram_client.disconnect()
        except Exception:
            pass

        async with db_manager.get_session() as session:
            # 3. Wipe all chat data (order matters for FK constraints)
            await session.execute(_text("DELETE FROM analytics"))
            await session.execute(_text("DELETE FROM leads"))
            await session.execute(_text("DELETE FROM memories"))
            await session.execute(_text("DELETE FROM conversations"))
            await session.execute(_text("DELETE FROM messages"))
            await session.execute(_text("DELETE FROM users"))
            # 4. Wipe creators
            await session.execute(_text("DELETE FROM creators"))

            # 5. Fresh default creator
            new_creator = CreatorModel(
                id=_uuid.uuid4(),
                name="default",
                display_name="Creator",
                color="#465fff",
                emoji="🎭",
                is_active=True,
                is_default=True,
            )
            session.add(new_creator)
            await session.commit()
            await session.refresh(new_creator)

            return {
                "status": "ok",
                "message": "Clean slate. All chat data wiped. Config (persona/packages) kept intact.",
                "creator_id": str(new_creator.id),
                "clear_storage_script": f"localStorage.setItem('selectedCreatorId','{new_creator.id}'); location.reload();",
                "next_step": "Run clear_storage_script in browser console, then go to /dashboard/creators and click Auth",
            }

    except Exception as e:
        logger.error(f"reset_all_creators failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@creators_router.get("")
async def list_creators():
    """List all creators with live connection status."""
    try:
        from app.services.telegram.client import telegram_client, creator_pool
        async with db_manager.get_session() as session:
            res = await session.execute(
                select(CreatorModel).order_by(CreatorModel.is_default.desc(), CreatorModel.created_at)
            )
            rows = res.scalars().all()
            result = []
            for r in rows:
                cid = str(r.id)
                if r.is_default:
                    is_connected = telegram_client.is_connected
                    account = {}
                    if is_connected:
                        try:
                            me = await telegram_client.client.get_me()
                            name = f"{getattr(me,'first_name','') or ''} {getattr(me,'last_name','') or ''}".strip()
                            account = {"name": name or getattr(me,"username",""), "username": getattr(me,"username",None)}
                        except Exception:
                            pass
                else:
                    is_connected = creator_pool.is_connected(cid)
                    account = creator_pool.get_account(cid) or {}

                result.append({
                    "id": cid,
                    "name": r.name,
                    "display_name": r.display_name or r.name,
                    "color": r.color or "#0a84ff",
                    "emoji": r.emoji or "🎭",
                    "telegram_phone": r.telegram_phone,
                    "has_session": bool(r.telegram_session),
                    "has_bot_token": bool(getattr(r, "telegram_bot_token", None)),
                    "offer_prefix": getattr(r, "offer_prefix", None),
                    "is_active": r.is_active,
                    "is_default": r.is_default,
                    "is_connected": is_connected,
                    "account_name": account.get("name") or account.get("username"),
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                })
            return result
    except Exception as e:
        logger.error(f"list_creators error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@creators_router.post("")
async def create_creator(payload: Dict[str, Any] = Body(...)):
    """Create a new creator."""
    try:
        import uuid as _uuid
        async with db_manager.get_session() as session:
            c = CreatorModel(
                id=_uuid.uuid4(),
                name=payload.get("name", "Creator"),
                display_name=payload.get("display_name") or payload.get("name"),
                color=payload.get("color", "#0a84ff"),
                emoji=payload.get("emoji", "🎭"),
                telegram_phone=payload.get("telegram_phone"),
                telegram_session=payload.get("telegram_session"),
                is_active=payload.get("is_active", True),
                is_default=False,
            )
            session.add(c)
            await session.commit()
            return {
                "id": str(c.id), "name": c.name, "display_name": c.display_name,
                "color": c.color, "emoji": c.emoji, "is_active": c.is_active,
                "is_default": c.is_default, "has_session": bool(c.telegram_session),
            }
    except Exception as e:
        logger.error(f"create_creator error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@creators_router.put("/{cid}")
async def update_creator(cid: str, payload: Dict[str, Any] = Body(...)):
    """Update creator fields."""
    try:
        import uuid as _uuid
        async with db_manager.get_session() as session:
            res = await session.execute(
                select(CreatorModel).where(CreatorModel.id == _uuid.UUID(cid))
            )
            c = res.scalars().first()
            if not c:
                raise HTTPException(status_code=404, detail="Creator not found")
            for field in ("name", "display_name", "color", "emoji", "telegram_phone", "is_active", "offer_prefix"):
                if field in payload:
                    setattr(c, field, payload[field])
            # Only update session/token if explicitly provided and non-empty
            if payload.get("telegram_session"):
                c.telegram_session = payload["telegram_session"]
            if payload.get("telegram_bot_token") is not None:
                c.telegram_bot_token = payload["telegram_bot_token"] or None
            await session.commit()
            return {"status": "updated", "id": str(c.id)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_creator error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@creators_router.delete("/{cid}")
async def delete_creator(cid: str):
    """Delete a creator (cannot delete the default creator)."""
    try:
        import uuid as _uuid
        async with db_manager.get_session() as session:
            res = await session.execute(
                select(CreatorModel).where(CreatorModel.id == _uuid.UUID(cid))
            )
            c = res.scalars().first()
            if not c:
                raise HTTPException(status_code=404, detail="Creator not found")
            if c.is_default:
                raise HTTPException(status_code=400, detail="Cannot delete the default creator")
            await session.delete(c)
            await session.commit()
            return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_creator error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@creators_router.post("/{cid}/connect")
async def connect_creator(cid: str, payload: Dict[str, Any] = Body(default={})):
    """
    Connect a creator's Telegram account.
    For the default creator: uses env-var session (reconnect flow).
    For non-default creators: uses the session string stored in DB
      (or one supplied in the request body as 'session_string').
    Also updates creator.display_name from the Telegram account name.
    """
    try:
        import uuid as _uuid
        from app.services.telegram.client import telegram_client, creator_pool

        async with db_manager.get_session() as session:
            res = await session.execute(
                select(CreatorModel).where(CreatorModel.id == _uuid.UUID(cid))
            )
            c = res.scalars().first()
            if not c:
                raise HTTPException(status_code=404, detail="Creator not found")

            # Allow session_string override from payload
            session_str = payload.get("session_string") or c.telegram_session
            if payload.get("session_string"):
                c.telegram_session = payload["session_string"]
                await session.commit()

            if c.is_default:
                # Single-creator setup: session is static in Railway env vars.
                # This endpoint only reports status — use POST /telegram/reconnect to reconnect.
                if telegram_client.is_connected:
                    me = await telegram_client.client.get_me()
                    name = f"{getattr(me,'first_name','') or ''} {getattr(me,'last_name','') or ''}".strip()
                    account_name = name or getattr(me, "username", "") or c.name
                    return {"status": "connected", "account_name": account_name, "creator_id": cid}
                return {"status": "not_connected", "detail": "Use POST /api/v1/telegram/reconnect to connect"}

            # Non-default creator — use pool
            api_id  = int(getattr(__import__("app.core.config", fromlist=["settings"]), "settings").TELEGRAM_API_ID or 0)
            api_hash = getattr(__import__("app.core.config", fromlist=["settings"]), "settings").TELEGRAM_API_HASH or ""

            if not session_str:
                raise HTTPException(status_code=400, detail="No session string stored for this creator. Save a session string first.")

            ok, account = await creator_pool.connect_creator(cid, session_str, api_id, api_hash)
            if not ok:
                raise HTTPException(status_code=400, detail="Connection failed — check session string and API credentials")

            # Update display_name and phone in DB
            account_name = account.get("name") or account.get("username") or c.name
            c.display_name = account_name
            if account.get("phone"):
                c.telegram_phone = account["phone"]
            await session.commit()

            return {"status": "connected", "account_name": account_name, "creator_id": cid}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"connect_creator {cid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@creators_router.post("/{cid}/disconnect")
async def disconnect_creator_endpoint(cid: str):
    """Disconnect a creator's Telegram client."""
    try:
        import uuid as _uuid
        from app.services.telegram.client import telegram_client, creator_pool

        async with db_manager.get_session() as session:
            res = await session.execute(
                select(CreatorModel).where(CreatorModel.id == _uuid.UUID(cid))
            )
            c = res.scalars().first()
            if not c:
                raise HTTPException(status_code=404, detail="Creator not found")

            if c.is_default:
                await telegram_client.disconnect()
            else:
                await creator_pool.disconnect_creator(cid)

            return {"status": "disconnected", "creator_id": cid}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"disconnect_creator {cid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@creators_router.get("/{cid}/status")
async def creator_status(cid: str):
    """Get connection status + account info for a creator."""
    try:
        import uuid as _uuid
        from app.services.telegram.client import telegram_client, creator_pool

        async with db_manager.get_session() as session:
            res = await session.execute(
                select(CreatorModel).where(CreatorModel.id == _uuid.UUID(cid))
            )
            c = res.scalars().first()
            if not c:
                raise HTTPException(status_code=404, detail="Creator not found")

        if c.is_default:
            # Default creator uses the singleton, never the pool
            connected = telegram_client.is_connected
            account = {}
            if connected:
                try:
                    me = await telegram_client.client.get_me()
                    name = f"{getattr(me,'first_name','') or ''} {getattr(me,'last_name','') or ''}".strip()
                    account = {"name": name or getattr(me,"username",""), "username": getattr(me,"username",None), "phone": getattr(me,"phone",None)}
                except Exception:
                    pass
        else:
            connected = creator_pool.is_connected(cid)
            account = creator_pool.get_account(cid) or {}

        return {
            "creator_id": cid,
            "connected": connected,
            "has_session": bool(c.telegram_session),
            "account": account,
            "display_name": c.display_name or c.name,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"creator_status {cid}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── In-memory store for pending phone auth sessions ──────────────────────────
# Keyed by creator_id string. Holds the TelegramClient + phone_code_hash while
# the user is entering the SMS code. Expires naturally after ~5 minutes (Telegram
# invalidates the code anyway). A Railway restart clears this, which is fine.
_pending_auth: dict = {}   # cid -> {"client": TelegramClient, "phone": str, "phone_code_hash": str}


@creators_router.post("/{cid}/request-code")
async def creator_request_code(cid: str, payload: Dict[str, Any] = Body(...)):
    """
    Step 1 of fresh-auth flow.
    Creates a new Telethon client and sends an SMS/Telegram code to the phone.
    Returns {"status": "code_sent"} on success.
    """
    try:
        import uuid as _uuid
        from telethon import TelegramClient as _TC
        from telethon.sessions import StringSession as _SS
        from telethon.network import ConnectionTcpAbridged as _Abr

        phone: str = (payload.get("phone") or "").strip()
        if not phone:
            raise HTTPException(status_code=400, detail="phone is required")

        async with db_manager.get_session() as session:
            res = await session.execute(
                select(CreatorModel).where(CreatorModel.id == _uuid.UUID(cid))
            )
            c = res.scalars().first()
            if not c:
                raise HTTPException(status_code=404, detail="Creator not found")

        api_id  = int(getattr(__import__("app.core.config", fromlist=["settings"]), "settings").TELEGRAM_API_ID or 0)
        api_hash = getattr(__import__("app.core.config", fromlist=["settings"]), "settings").TELEGRAM_API_HASH or ""
        if not api_id or not api_hash:
            raise HTTPException(status_code=500, detail="TELEGRAM_API_ID / TELEGRAM_API_HASH not configured")

        # Clean up any previous pending auth for this creator
        if cid in _pending_auth:
            try:
                await _pending_auth[cid]["client"].disconnect()
            except Exception:
                pass
            del _pending_auth[cid]

        client = _TC(session=_SS(), api_id=api_id, api_hash=api_hash,
                     connection=_Abr, auto_reconnect=False)
        await client.connect()

        result = await client.send_code_request(phone)
        _pending_auth[cid] = {
            "client": client,
            "phone": phone,
            "phone_code_hash": result.phone_code_hash,
        }
        logger.info(f"Creator {cid}: code sent to {phone}")
        return {"status": "code_sent", "phone": phone}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"creator_request_code {cid}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@creators_router.post("/{cid}/submit-code")
async def creator_submit_code(cid: str, payload: Dict[str, Any] = Body(...)):
    """
    Step 2 of fresh-auth flow.
    Validates the SMS code (and optional 2FA password), saves the resulting
    session string to the DB, and connects the creator into the live pool.
    Returns {"status": "connected", "account_name": "...", "session_string": "..."}.
    """
    try:
        import uuid as _uuid
        from telethon.errors import SessionPasswordNeededError as _2FA
        from telethon.sessions import StringSession as _SS

        code: str     = (payload.get("code") or "").strip()
        password: str = (payload.get("password") or "").strip()

        if cid not in _pending_auth:
            raise HTTPException(
                status_code=400,
                detail="No pending auth for this creator — click 'Code anfordern' first"
            )

        pending = _pending_auth[cid]
        client  = pending["client"]
        phone   = pending["phone"]
        ph_hash = pending["phone_code_hash"]

        try:
            await client.sign_in(phone=phone, code=code, phone_code_hash=ph_hash)
        except _2FA:
            if not password:
                raise HTTPException(status_code=400, detail="2FA password required — fill the 2FA field and try again")
            await client.sign_in(password=password)

        me = await client.get_me()
        first = getattr(me, "first_name", "") or ""
        last  = getattr(me, "last_name",  "") or ""
        account_name = f"{first} {last}".strip() or getattr(me, "username", "") or phone
        new_session = client.session.save()

        # Persist session string + display_name + phone to DB
        async with db_manager.get_session() as session:
            res = await session.execute(
                select(CreatorModel).where(CreatorModel.id == _uuid.UUID(cid))
            )
            c = res.scalars().first()
            if c:
                c.telegram_session = new_session
                c.display_name     = account_name
                c.telegram_phone   = phone
                await session.commit()

        # Connect into the live pool (non-default creators)
        from app.services.telegram.client import telegram_client, creator_pool
        api_id   = int(getattr(__import__("app.core.config", fromlist=["settings"]), "settings").TELEGRAM_API_ID or 0)
        api_hash = getattr(__import__("app.core.config", fromlist=["settings"]), "settings").TELEGRAM_API_HASH or ""

        # Check if default creator
        async with db_manager.get_session() as session:
            res = await session.execute(select(CreatorModel).where(CreatorModel.id == _uuid.UUID(cid)))
            c   = res.scalars().first()
            is_default = c.is_default if c else False

        if is_default:
            # For default creator, reconnect legacy client with new session via env override isn't
            # possible at runtime — just mark connected using the pool path instead
            ok, account = await creator_pool.connect_creator(cid, new_session, api_id, api_hash)
        else:
            ok, account = await creator_pool.connect_creator(cid, new_session, api_id, api_hash)

        # Clean up pending auth
        try:
            await client.disconnect()
        except Exception:
            pass
        del _pending_auth[cid]

        if not ok:
            # Session saved but pool connect failed — still a partial success
            logger.warning(f"Creator {cid}: session saved but pool connect failed")

        logger.info(f"Creator {cid}: fresh-auth succeeded as {account_name}")
        return {
            "status": "connected",
            "account_name": account_name,
            "creator_id": cid,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"creator_submit_code {cid}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== MEDIA FILE UPLOAD ====================

import os as _os
import uuid as _uuid_mod

_MEDIA_DIR = _os.getenv("MEDIA_STORAGE_PATH", "/tmp/media")

media_router = APIRouter(prefix="/media", tags=["Media"])

from fastapi import Request as _Request

@media_router.post("/upload/file")
async def upload_media_file_raw(request: _Request):
    """
    Multipart file upload. Saves to MEDIA_STORAGE_PATH and returns a URL.
    Frontend sends: POST /api/v1/media/upload/file  (multipart, field name = 'file')
    """
    try:
        form = await request.form()
        upload = form.get("file")
        if not upload:
            raise HTTPException(status_code=400, detail="No file in request")

        _os.makedirs(_MEDIA_DIR, exist_ok=True)

        filename_raw: str = getattr(upload, "filename", None) or "upload"
        ext = _os.path.splitext(filename_raw)[1].lower() or ""
        safe_name = f"{_uuid_mod.uuid4().hex}{ext}"
        dest = _os.path.join(_MEDIA_DIR, safe_name)

        contents: bytes = await upload.read()
        with open(dest, "wb") as fh:
            fh.write(contents)

        content_type: str = getattr(upload, "content_type", "application/octet-stream") or "application/octet-stream"
        file_url = f"/media/files/{safe_name}"
        logger.info(f"[media-upload] saved {safe_name} ({len(contents)} bytes)")
        return {
            "url": file_url,
            "filename": safe_name,
            "original_name": filename_raw,
            "size": len(contents),
            "content_type": content_type,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[media-upload] error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Upload failed")


@media_router.delete("/files/{filename}")
async def delete_media_file(filename: str):
    """Delete an uploaded media file from disk."""
    try:
        if ".." in filename or _os.sep in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        path = _os.path.join(_MEDIA_DIR, filename)
        if _os.path.exists(path):
            _os.remove(path)
            logger.info(f"[media-upload] deleted {filename}")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[media-upload] delete error: {e}")
        raise HTTPException(status_code=500, detail="Delete failed")


# ==================== ROUTER AGGREGATION ====================

api_router = APIRouter()
api_router.include_router(router)
api_router.include_router(user_router)
api_router.include_router(lead_router)
api_router.include_router(telegram_router)
api_router.include_router(ai_router)
api_router.include_router(config_router)
api_router.include_router(analytics_router)
api_router.include_router(creators_router)
api_router.include_router(media_router)

__all__ = ["api_router"]
