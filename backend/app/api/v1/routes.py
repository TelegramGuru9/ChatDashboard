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
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
):
    """
    Return one row per user — the latest message plus user info.
    Used for the inbox conversation list view.
    """
    try:
        # Subquery: latest message per user
        subq = (
            select(
                Message.user_id,
                func.max(Message.created_at).label("latest_at"),
            )
            .group_by(Message.user_id)
            .subquery()
        )

        result = await session.execute(
            select(User, Message)
            .join(subq, User.id == subq.c.user_id)
            .join(
                Message,
                and_(
                    Message.user_id == User.id,
                    Message.created_at == subq.c.latest_at,
                ),
            )
            .order_by(subq.c.latest_at.desc())
            .offset(skip)
            .limit(limit)
        )
        rows = result.all()

        items = []
        for user, msg in rows:
            items.append({
                "user_id": str(user.id),
                "telegram_id": user.user_id,
                "name": f"{user.first_name or ''} {user.last_name or ''}".strip() or f"User {user.user_id}",
                "username": user.username,
                "lead_score": user.lead_score,
                "total_messages": user.total_messages,
                "last_message": msg.text,
                "last_message_direction": msg.direction,
                "last_message_at": msg.created_at.isoformat() if msg.created_at else None,
                "ai_enabled": user.ai_enabled,
            })

        return {"items": items, "total": len(items)}
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
    session: AsyncSession = Depends(get_db),
) -> list:
    try:
        query = select(Message).where(Message.user_id == user_id)
        if days:
            cutoff = datetime.utcnow() - timedelta(days=days)
            query = query.where(Message.created_at >= cutoff)
        query = query.order_by(Message.created_at.asc()).limit(limit)
        result = await session.execute(query)
        messages = result.scalars().all()
        return [MessageDetailResponse.model_validate(m) for m in messages]
    except Exception as e:
        logger.error(f"Error getting history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get history")


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
    limit_per_chat: int = Query(50, ge=1, le=200),
    max_dialogs: int = Query(200, ge=1, le=500),
):
    """
    Pull existing Telegram chat history into the database.
    This is safe to call multiple times — it skips already-stored messages.
    Returns a summary of what was synced.
    """
    from app.services.telegram.client import telegram_client

    if not telegram_client.is_connected:
        raise HTTPException(status_code=503, detail="Telegram not connected")

    synced_users = 0
    synced_messages = 0
    errors = 0

    try:
        async for dialog in telegram_client.client.iter_dialogs(limit=max_dialogs):
            # Only private chats (not groups or channels)
            if not dialog.is_user:
                continue

            entity = dialog.entity
            telegram_user_id = entity.id

            try:
                async with db_manager.get_session() as session:
                    # Get or create user
                    result = await session.execute(
                        select(User).where(User.user_id == telegram_user_id)
                    )
                    user = result.scalars().first()

                    if not user:
                        user = User(
                            user_id=telegram_user_id,
                            first_name=getattr(entity, "first_name", None) or "Unknown",
                            last_name=getattr(entity, "last_name", None),
                            username=getattr(entity, "username", None),
                            is_bot=getattr(entity, "bot", False),
                        )
                        session.add(user)
                        await session.flush()
                        synced_users += 1

                    # Pull message history
                    async for tg_msg in telegram_client.client.iter_messages(entity, limit=limit_per_chat):
                        if not tg_msg.message and not tg_msg.media:
                            continue  # skip empty system messages

                        # Check duplicate
                        dup = await session.execute(
                            select(Message).where(
                                and_(
                                    Message.user_id == user.id,
                                    Message.message_id == tg_msg.id,
                                )
                            )
                        )
                        if dup.scalars().first():
                            continue  # already stored

                        direction = "outgoing" if tg_msg.out else "incoming"
                        has_media = tg_msg.media is not None
                        media_type = None
                        if has_media:
                            mt = type(tg_msg.media).__name__
                            if "Photo" in mt: media_type = "photo"
                            elif "Document" in mt: media_type = "document"
                            elif "Video" in mt: media_type = "video"
                            elif "Audio" in mt: media_type = "audio"
                            else: media_type = mt.lower()

                        msg = Message(
                            message_id=tg_msg.id,
                            user_id=user.id,
                            text=tg_msg.message or None,
                            direction=direction,
                            has_media=has_media,
                            media_type=media_type,
                            is_ai_generated=False,
                            extra_data={},
                            created_at=tg_msg.date.replace(tzinfo=None) if tg_msg.date else datetime.utcnow(),
                        )
                        session.add(msg)
                        synced_messages += 1

                    # Update user message count
                    msg_count = await session.execute(
                        select(func.count(Message.id)).where(Message.user_id == user.id)
                    )
                    user.total_messages = msg_count.scalar() or 0

                    await session.commit()

            except Exception as e:
                logger.error(f"Error syncing dialog {telegram_user_id}: {e}")
                errors += 1
                continue

        return {
            "status": "ok",
            "synced_users": synced_users,
            "synced_messages": synced_messages,
            "errors": errors,
        }

    except Exception as e:
        logger.error(f"Sync failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


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
    """Save AI persona config (stored in config table)."""
    try:
        async with db_manager.get_session() as session:
            result = await session.execute(select(Config).where(Config.key == "persona"))
            cfg = result.scalars().first()
            if cfg:
                cfg.value = payload
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
async def save_config(key: str, payload: Dict[str, Any] = Body(...)):
    """
    Save or merge config for a key.
    If payload contains a top-level '__merge': true flag, the existing value
    is deep-merged rather than replaced.
    """
    try:
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

__all__ = ["api_router"]
