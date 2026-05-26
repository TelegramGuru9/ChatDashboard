"""
app/db/schemas.py
Pydantic v2 schemas for validation and serialization.
"""

from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID


# ==================== USER SCHEMAS ====================

class UserBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    bio: Optional[str] = None


class UserCreate(UserBase):
    user_id: int = Field(..., gt=0)
    is_bot: bool = False
    profile_photo_url: Optional[str] = None


class UserUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1)
    last_name: Optional[str] = None
    bio: Optional[str] = None
    ai_enabled: Optional[bool] = None
    tags: Optional[List[str]] = None


class UserCRMUpdate(BaseModel):
    conversation_state: Optional[str] = None
    lead_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    tags: Optional[List[str]] = None
    extra_data: Optional[Dict[str, Any]] = None


class UserResponse(UserBase):
    id: UUID
    user_id: int
    is_bot: bool
    conversation_state: str
    lead_score: float
    ai_enabled: bool
    total_messages: int
    total_interactions: int
    last_message_at: Optional[datetime] = None
    first_message_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserDetailResponse(UserResponse):
    tags: List[str] = []
    extra_data: Dict[str, Any] = {}
    ai_override_until: Optional[datetime] = None


# ==================== MESSAGE SCHEMAS ====================

class MessageBase(BaseModel):
    text: Optional[str] = Field(None, max_length=4096)
    has_media: bool = False
    media_type: Optional[str] = None
    media_url: Optional[str] = None


class MessageCreate(MessageBase):
    message_id: int = Field(..., gt=0)
    user_id: UUID
    direction: str = Field(..., pattern="^(incoming|outgoing)$")
    is_ai_generated: bool = False


class MessageResponse(MessageBase):
    id: UUID
    message_id: int
    user_id: UUID
    direction: str
    is_ai_generated: bool
    is_manual_override: bool
    processed: bool
    has_embedding: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageDetailResponse(MessageResponse):
    extra_data: Dict[str, Any] = {}
    embedded_at: Optional[datetime] = None
    response_to_id: Optional[UUID] = None


class MessageBatchCreate(BaseModel):
    messages: List[MessageCreate] = Field(..., min_length=1, max_length=100)


# ==================== MEMORY SCHEMAS ====================

class MemoryBase(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    memory_type: str = Field(
        default="message",
        pattern="^(message|fact|preference|context)$"
    )


class MemoryCreate(MemoryBase):
    user_id: UUID
    message_id: Optional[UUID] = None


class MemoryResponse(MemoryBase):
    id: UUID
    user_id: UUID
    relevance_score: float
    access_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class MemoryDetailResponse(MemoryResponse):
    content_hash: str
    extra_data: Dict[str, Any] = {}
    last_accessed_at: Optional[datetime] = None
    embedding_model: str = "voyage-3"


class SimilarMemory(BaseModel):
    memory: MemoryResponse
    similarity_score: float = Field(..., ge=0.0, le=1.0)


# ==================== CONVERSATION SCHEMAS ====================

class ConversationBase(BaseModel):
    is_active: bool = True


class ConversationUpdate(BaseModel):
    is_active: Optional[bool] = None
    conversation_summary: Optional[str] = None
    detected_tone: Optional[str] = None
    extra_data: Optional[Dict[str, Any]] = None


class ConversationResponse(ConversationBase):
    id: UUID
    user_id: UUID
    last_message_direction: Optional[str] = None
    detected_tone: Optional[str] = None
    detected_intent: Optional[str] = None
    pending_ai_response: bool
    engagement_phase: str
    created_at: datetime
    updated_at: datetime
    last_message_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ==================== LEAD SCHEMAS ====================

class LeadBase(BaseModel):
    source: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class LeadCreate(LeadBase):
    user_id: UUID


class LeadUpdate(BaseModel):
    status: Optional[str] = None
    qualified: Optional[bool] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None
    funnel_stage: Optional[str] = None


class LeadScoringResponse(BaseModel):
    user_id: UUID
    lead_score: float = Field(..., ge=0.0, le=100.0)
    score_breakdown: Dict[str, float]
    qualified: bool
    recommendation: str


class LeadResponse(LeadBase):
    id: UUID
    user_id: UUID
    status: str
    qualified: bool
    lead_score: float
    funnel_stage: str
    total_interactions: int
    engagement_score: float
    converted: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LeadDetailResponse(LeadResponse):
    score_breakdown: Dict[str, float] = {}
    custom_fields: Dict[str, Any] = {}
    notes: Optional[str] = None
    last_activity_at: Optional[datetime] = None
    qualified_at: Optional[datetime] = None
    converted_at: Optional[datetime] = None


# ==================== AI SCHEMAS ====================

class AIGenerateRequest(BaseModel):
    user_id: UUID
    message_id: Optional[UUID] = None
    context_override: Optional[Dict[str, Any]] = None
    max_tokens: Optional[int] = Field(None, ge=100, le=4000)
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)


class AIGenerateResponse(BaseModel):
    generated_text: str
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    tokens_used: int
    memory_chunks_used: int
    tone_detected: str
    suggested_follow_up: Optional[str] = None
    requires_human_review: bool = False


class AIToggleRequest(BaseModel):
    user_id: UUID
    enabled: bool
    override_minutes: Optional[int] = Field(None, ge=1, le=1440)


# ==================== ANALYTICS SCHEMAS ====================

class AnalyticsMetrics(BaseModel):
    period: str
    total_messages: int
    incoming_messages: int
    outgoing_messages: int
    ai_generated_messages: int
    active_users: int
    new_users: int
    users_converted: int
    avg_response_time_seconds: float
    avg_engagement_score: float
    new_leads: int
    qualified_leads: int
    conversion_rate: float


# ==================== ERROR SCHEMAS ====================

class ErrorResponse(BaseModel):
    error: str
    detail: str
    code: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ValidationErrorDetail(BaseModel):
    field: str
    message: str
    type: str


class ValidationErrorResponse(BaseModel):
    error: str = "Validation Error"
    details: List[ValidationErrorDetail]
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ==================== PAGINATION ====================

class PaginationParams(BaseModel):
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1, le=500)
    sort_by: Optional[str] = None
    sort_order: str = Field(default="desc", pattern="^(asc|desc)$")


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    skip: int
    limit: int
    has_more: bool


# ==================== HEALTH & STATUS ====================

class HealthCheck(BaseModel):
    status: str
    timestamp: datetime
    services: Dict[str, str]


class SystemStatus(BaseModel):
    uptime_seconds: float
    ai_enabled: bool
    telegram_connected: bool
    database_healthy: bool
    redis_healthy: bool
    memory_usage_percent: float
    active_connections: int


__all__ = [
    "UserBase", "UserCreate", "UserUpdate", "UserResponse", "UserDetailResponse",
    "MessageBase", "MessageCreate", "MessageResponse", "MessageDetailResponse",
    "MemoryBase", "MemoryCreate", "MemoryResponse", "MemoryDetailResponse", "SimilarMemory",
    "ConversationBase", "ConversationResponse",
    "LeadBase", "LeadCreate", "LeadUpdate", "LeadResponse", "LeadDetailResponse", "LeadScoringResponse",
    "AIGenerateRequest", "AIGenerateResponse",
    "AnalyticsMetrics", "ErrorResponse", "PaginationParams", "PaginatedResponse", "HealthCheck",
]
