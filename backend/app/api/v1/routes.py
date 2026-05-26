"""
app/api/v1/routes.py
All API v1 routes: messages, users, leads, AI.
"""

import logging
from typing import Optional
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import Message, User
from app.db.schemas import (
    MessageResponse,
    MessageDetailResponse,
    PaginationParams,
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


@router.get("/{message_id}")
async def get_message(
    message_id: UUID,
    session: AsyncSession = Depends(get_db),
) -> MessageDetailResponse:
    """Get detailed message information."""
    try:
        result = await session.execute(
            select(Message).where(Message.id == message_id)
        )
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
    """Get conversation history with a user."""
    try:
        user_result = await session.execute(
            select(User).where(User.id == user_id)
        )
        if not user_result.scalars().first():
            raise HTTPException(status_code=404, detail="User not found")

        query = select(Message).where(Message.user_id == user_id)

        if days:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            query = query.where(Message.created_at >= cutoff_date)

        query = query.order_by(Message.created_at.desc()).limit(limit)
        result = await session.execute(query)
        messages = result.scalars().all()

        return [MessageDetailResponse.model_validate(m) for m in reversed(messages)]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get history")


# ==================== USER ROUTES ====================

user_router = APIRouter(prefix="/users", tags=["Users"])


@user_router.get("")
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    conversation_state: Optional[str] = None,
    min_lead_score: Optional[float] = Query(None, ge=0.0, le=100.0),
    session: AsyncSession = Depends(get_db),
) -> PaginatedResponse:
    """List users with optional filtering."""
    try:
        filters = []

        if conversation_state:
            filters.append(User.conversation_state == conversation_state)
        if min_lead_score is not None:
            filters.append(User.lead_score >= min_lead_score)

        where_clause = and_(*filters) if filters else True

        count_result = await session.execute(
            select(func.count(User.id)).where(where_clause)
        )
        total = count_result.scalar() or 0

        result = await session.execute(
            select(User).where(where_clause)
            .order_by(User.created_at.desc())
            .offset(skip).limit(limit)
        )
        users = result.scalars().all()

        return PaginatedResponse(
            items=[UserResponse.model_validate(u) for u in users],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + limit) < total,
        )
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        raise HTTPException(status_code=500, detail="Failed to list users")


@user_router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    session: AsyncSession = Depends(get_db),
):
    """Get user details."""
    try:
        result = await session.execute(
            select(User).where(User.id == user_id)
        )
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
    min_score: Optional[float] = Query(None, ge=0.0, le=100.0),
    session: AsyncSession = Depends(get_db),
):
    """List leads with filtering."""
    from app.db.models import Lead

    try:
        filters = []

        if status:
            filters.append(Lead.status == status)
        if funnel_stage:
            filters.append(Lead.funnel_stage == funnel_stage)
        if min_score is not None:
            filters.append(Lead.lead_score >= min_score)

        where_clause = and_(*filters) if filters else True

        count_result = await session.execute(
            select(func.count(Lead.id)).where(where_clause)
        )
        total = count_result.scalar() or 0

        result = await session.execute(
            select(Lead).where(where_clause)
            .order_by(Lead.lead_score.desc())
            .offset(skip).limit(limit)
        )
        leads = result.scalars().all()

        return PaginatedResponse(
            items=[LeadResponse.model_validate(l) for l in leads],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + limit) < total,
        )
    except Exception as e:
        logger.error(f"Error listing leads: {e}")
        raise HTTPException(status_code=500, detail="Failed to list leads")


# ==================== AI ROUTES ====================

ai_router = APIRouter(prefix="/ai", tags=["AI"])


@ai_router.post("/toggle/{user_id}")
async def toggle_ai(
    user_id: UUID,
    enabled: bool,
    override_minutes: Optional[int] = None,
    session: AsyncSession = Depends(get_db),
):
    """Enable/disable AI for a user."""
    try:
        result = await session.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalars().first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.ai_enabled = enabled

        if not enabled and override_minutes:
            from datetime import timezone
            user.ai_override_until = datetime.now(timezone.utc) + timedelta(minutes=override_minutes)

        await session.commit()

        return {
            "user_id": user_id,
            "ai_enabled": user.ai_enabled,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling AI: {e}")
        raise HTTPException(status_code=500, detail="Failed to toggle AI")


# ==================== ROUTER AGGREGATION ====================

api_router = APIRouter()
api_router.include_router(router)
api_router.include_router(user_router)
api_router.include_router(lead_router)
api_router.include_router(ai_router)

__all__ = ["router", "user_router", "lead_router", "ai_router", "api_router"]
