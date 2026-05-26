"""
app/db/models.py
SQLAlchemy ORM models for PostgreSQL database.

ARCHITECTURE DECISIONS:
1. Use UUID primary keys for scalability
2. Composite indexes on frequently queried columns
3. Soft deletes where needed (is_deleted flag)
4. Timestamps on all entities for audit trail
5. Vector column for pgvector embeddings
6. JSON fields for flexible metadata storage
"""

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Boolean, Text, JSON,
    ForeignKey, Index, UniqueConstraint, func, ARRAY
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone
import uuid

Base = declarative_base()


def get_utc_now() -> datetime:
    """Get current UTC time."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    """
    Telegram user entity.
    
    WHY THIS STRUCTURE:
    - user_id is Telegram's user ID (indexed for fast lookups)
    - conversation_state tracks relationship stage for funnel logic
    - metadata stores custom tags, flags, preferences
    - ai_enabled allows manual control per user
    - last_message_at for engagement tracking
    """
    
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, unique=True, nullable=False, index=True)
    
    # Basic info
    first_name = Column(String(255), nullable=False)
    last_name = Column(String(255), nullable=True)
    username = Column(String(255), nullable=True, unique=True, index=True)
    phone = Column(String(20), nullable=True)
    
    # Profile
    bio = Column(Text, nullable=True)
    profile_photo_url = Column(String(500), nullable=True)
    is_bot = Column(Boolean, default=False)
    
    # CRM Fields
    conversation_state = Column(
        String(50),
        default="initial",  # initial → interested → qualified → customer
        nullable=False,
        index=True
    )
    lead_score = Column(Float, default=0.0, nullable=False)
    lead_score_updated_at = Column(DateTime, nullable=True)
    
    # AI Control
    ai_enabled = Column(Boolean, default=True, nullable=False)
    ai_override_until = Column(DateTime, nullable=True)  # Manual takeover mode
    
    # Tags & Metadata
    tags = Column(ARRAY(String), default=[], nullable=False)  # ["vip", "interested"]
    metadata = Column(JSONB, default={}, nullable=False)
    # metadata: {
    #   "source": "organic|referral",
    #   "funnel_stage": "awareness|consideration|decision",
    #   "last_product_mentioned": "product_id",
    #   "custom_notes": "any notes from manager"
    # }
    
    # Engagement Metrics
    total_messages = Column(Integer, default=0, nullable=False)
    total_interactions = Column(Integer, default=0, nullable=False)
    last_message_at = Column(DateTime, nullable=True, index=True)
    first_message_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
    deleted_at = Column(DateTime, nullable=True)
    
    # Relationships
    messages = relationship(
        "Message",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="select"
    )
    memories = relationship(
        "Memory",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="select"
    )
    
    __table_args__ = (
        Index("idx_user_conversation_state", "conversation_state"),
        Index("idx_user_lead_score", "lead_score"),
        Index("idx_user_created_at", "created_at"),
        Index("idx_user_tags", "tags", postgresql_using="gin"),
    )


class Message(Base):
    """
    Individual Telegram message.
    
    WHY THIS STRUCTURE:
    - message_id is Telegram's message ID for idempotency
    - direction: 'incoming' or 'outgoing' for tracking
    - ai_generated flag tracks AI vs manual messages
    - processed flag for async batch processing
    - has_embedding for vector search optimization
    """
    
    __tablename__ = "messages"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(Integer, nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    # Content
    text = Column(Text, nullable=True)
    has_media = Column(Boolean, default=False)
    media_type = Column(String(50), nullable=True)  # photo, video, document, etc
    media_url = Column(String(500), nullable=True)
    
    # Direction & Processing
    direction = Column(String(20), nullable=False)  # 'incoming' or 'outgoing'
    is_ai_generated = Column(Boolean, default=False, index=True)
    is_manual_override = Column(Boolean, default=False)
    
    # Processing Status
    processed = Column(Boolean, default=False, index=True)
    has_embedding = Column(Boolean, default=False)
    embedded_at = Column(DateTime, nullable=True)
    
    # Context
    response_to_id = Column(UUID(as_uuid=True), nullable=True)  # If it's a reply
    parent_message_id = Column(
        Integer,
        nullable=True
    )  # Telegram's parent message ID
    
    # Metadata
    metadata = Column(JSONB, default={}, nullable=False)
    # metadata: {
    #   "sentiment": "positive|neutral|negative",
    #   "intent": "inquiry|complaint|feedback",
    #   "engagement_score": 0.8,
    #   "response_time_ms": 1200,
    #   "claude_context_tokens": 1500
    # }
    
    # Timestamps
    created_at = Column(DateTime, default=get_utc_now, nullable=False, index=True)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
    
    # Relationships
    user = relationship("User", back_populates="messages")
    embedding = relationship(
        "Memory",
        back_populates="message",
        uselist=False,
        cascade="all, delete-orphan"
    )
    
    __table_args__ = (
        Index("idx_message_user_created", "user_id", "created_at"),
        Index("idx_message_direction", "direction"),
        Index("idx_message_ai_generated", "is_ai_generated"),
        Index("idx_message_processed", "processed"),
        UniqueConstraint("message_id", "user_id", name="uq_message_id_user_id"),
    )


class Memory(Base):
    """
    Vector embeddings and semantic memory.
    
    WHY THIS STRUCTURE:
    - Separates vector operations from message storage
    - embedding is a pgvector column for semantic search
    - content_hash prevents duplicate embeddings
    - memory_type: 'message', 'fact', 'preference' for filtering
    - relevance_score for ranking search results
    """
    
    __tablename__ = "memories"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id"), nullable=True)
    
    # Content
    content = Column(Text, nullable=False)
    content_hash = Column(String(64), unique=True, nullable=False)  # SHA256
    
    # Memory Type
    memory_type = Column(
        String(50),
        default="message",
        nullable=False,
        index=True
    )
    # message: from conversations
    # fact: extracted facts about user
    # preference: user preferences
    # context: contextual information
    
    # Vector Embedding
    embedding = Column(Vector(1024), nullable=False)  # pgvector column
    embedding_model = Column(String(50), default="voyage-3")
    
    # Relevance & Scoring
    relevance_score = Column(Float, default=1.0)  # Starts at 1.0, decays over time
    access_count = Column(Integer, default=0)  # How often retrieved
    last_accessed_at = Column(DateTime, nullable=True)
    
    # Metadata
    metadata = Column(JSONB, default={}, nullable=False)
    # metadata: {
    #   "source": "conversation|extraction|manual",
    #   "importance": "high|medium|low",
    #   "tags": ["product", "interest"],
    #   "expiry_days": 90
    # }
    
    # Timestamps
    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
    
    # Relationships
    user = relationship("User", back_populates="memories")
    message = relationship("Message", back_populates="embedding")
    
    __table_args__ = (
        Index("idx_memory_user_created", "user_id", "created_at"),
        Index("idx_memory_type", "memory_type"),
        Index("idx_memory_relevance", "relevance_score"),
        Index("idx_memory_embedding", "embedding", postgresql_using="ivfflat"),
    )


class Conversation(Base):
    """
    Conversation state and context.
    
    WHY THIS STRUCTURE:
    - Tracks active conversations and context
    - pending_ai_response for handling overlapping messages
    - tone_detected for maintaining consistency
    - engagement_phase for funnel stage
    - last_ai_message_id to avoid duplicate responses
    """
    
    __tablename__ = "conversations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True
    )
    
    # State
    is_active = Column(Boolean, default=True, index=True)
    last_message_direction = Column(String(20), nullable=True)  # incoming/outgoing
    
    # Context
    conversation_summary = Column(Text, nullable=True)  # Auto-updated summary
    detected_tone = Column(String(50), nullable=True)  # friendly, frustrated, formal
    detected_intent = Column(String(50), nullable=True)  # inquiry, complaint, etc
    
    # AI State
    pending_ai_response = Column(Boolean, default=False)
    last_ai_message_id = Column(UUID(as_uuid=True), nullable=True)
    ai_response_pending_since = Column(DateTime, nullable=True)
    
    # Engagement
    engagement_phase = Column(
        String(50),
        default="initial",
        nullable=False
    )
    # initial → interested → qualified → nurture → converted → inactive
    
    # Metadata
    metadata = Column(JSONB, default={}, nullable=False)
    # metadata: {
    #   "conversion_likelihood": 0.75,
    #   "blockers": ["price", "timing"],
    #   "interests": ["feature_a", "pricing"],
    #   "last_action": "viewed_pricing"
    # }
    
    # Timestamps
    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
    last_message_at = Column(DateTime, nullable=True)
    
    __table_args__ = (
        Index("idx_conversation_user", "user_id"),
        Index("idx_conversation_active", "is_active"),
        Index("idx_conversation_engagement_phase", "engagement_phase"),
    )


class Lead(Base):
    """
    CRM Lead tracking and scoring.
    
    WHY THIS STRUCTURE:
    - Separate from User for CRM flexibility
    - qualified flag for sales pipeline
    - source tracks acquisition channel
    - metadata for custom CRM fields
    - score_breakdown for transparency
    """
    
    __tablename__ = "leads"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True
    )
    
    # Lead Status
    status = Column(
        String(50),
        default="new",
        nullable=False,
        index=True
    )
    # new → interested → qualified → customer → lost → inactive
    
    qualified = Column(Boolean, default=False, index=True)
    qualified_at = Column(DateTime, nullable=True)
    qualified_by = Column(String(100), nullable=True)  # 'ai' or username
    
    # Scoring
    lead_score = Column(Float, default=0.0, nullable=False, index=True)
    score_breakdown = Column(JSONB, default={}, nullable=False)
    # score_breakdown: {
    #   "engagement": 30,
    #   "message_frequency": 20,
    #   "keyword_match": 15,
    #   "response_time": 10,
    #   "qualification_questions": 25
    # }
    
    # Source & Attribution
    source = Column(String(50), nullable=True, index=True)  # organic, referral, ads
    acquisition_channel = Column(String(100), nullable=True)
    utm_source = Column(String(100), nullable=True)
    utm_campaign = Column(String(100), nullable=True)
    
    # Engagement
    total_interactions = Column(Integer, default=0)
    message_frequency = Column(Float, default=0.0)  # messages per day
    response_rate = Column(Float, default=0.0)  # 0.0 to 1.0
    engagement_score = Column(Float, default=0.0)
    
    # CRM Fields
    custom_fields = Column(JSONB, default={}, nullable=False)
    notes = Column(Text, nullable=True)
    tags = Column(ARRAY(String), default=[], nullable=False)
    
    # Funnel Position
    funnel_stage = Column(
        String(50),
        default="awareness",
        nullable=False,
        index=True
    )
    # awareness → interest → consideration → decision → purchase
    
    # Conversion
    converted = Column(Boolean, default=False, index=True)
    converted_at = Column(DateTime, nullable=True)
    conversion_value = Column(Float, default=0.0)  # Revenue or value
    conversion_product = Column(String(255), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
    last_activity_at = Column(DateTime, nullable=True)
    
    __table_args__ = (
        Index("idx_lead_status", "status"),
        Index("idx_lead_score", "lead_score"),
        Index("idx_lead_funnel", "funnel_stage"),
        Index("idx_lead_source", "source"),
    )


class Analytics(Base):
    """
    Daily analytics snapshot for reporting.
    
    WHY THIS STRUCTURE:
    - Pre-aggregated for fast queries
    - Daily granularity for trends
    - Separate from operational tables
    """
    
    __tablename__ = "analytics"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Date dimension
    date = Column(DateTime, nullable=False, unique=True, index=True)
    
    # Message metrics
    incoming_messages_count = Column(Integer, default=0)
    outgoing_messages_count = Column(Integer, default=0)
    ai_generated_messages_count = Column(Integer, default=0)
    manual_messages_count = Column(Integer, default=0)
    
    # User metrics
    active_users = Column(Integer, default=0)
    new_users = Column(Integer, default=0)
    users_converted = Column(Integer, default=0)
    
    # Engagement metrics
    average_response_time_seconds = Column(Float, default=0.0)
    average_engagement_score = Column(Float, default=0.0)
    message_frequency_avg = Column(Float, default=0.0)
    
    # Lead metrics
    new_leads = Column(Integer, default=0)
    qualified_leads = Column(Integer, default=0)
    total_leads = Column(Integer, default=0)
    
    # AI metrics
    ai_accuracy_score = Column(Float, default=0.0)
    avg_claude_tokens_used = Column(Integer, default=0)
    
    # Metadata
    metadata = Column(JSONB, default={}, nullable=False)
    
    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
    
    __table_args__ = (
        Index("idx_analytics_date", "date"),
    )


__all__ = [
    "User",
    "Message",
    "Memory",
    "Conversation",
    "Lead",
    "Analytics",
    "Base",
]
