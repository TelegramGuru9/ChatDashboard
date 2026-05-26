"""
app/services/telegram/message_handler.py
Processing pipeline for incoming Telegram messages.

ARCHITECTURE DECISIONS:
1. Separate message processing into discrete steps
2. Async batch processing for database operations
3. Queue messages for AI processing (not blocking)
4. Extract metadata (sentiment, intent) immediately
5. Emit events for real-time dashboard updates
"""

import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import hashlib
import asyncio
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.types import Message as TelegramMessage

from app.db.database import db_manager
from app.db.models import User, Message, Memory, Conversation, Lead
from app.db.schemas import MessageCreate
from app.core.config import settings
from app.services.vector.embeddings import embedding_service
from app.services.telegram.client import telegram_client

logger = logging.getLogger(__name__)


class MessageProcessor:
    """
    Processes incoming Telegram messages through the system.
    
    Pipeline:
    1. Store message in database
    2. Update user engagement metrics
    3. Generate embeddings
    4. Queue for AI processing (if enabled)
    5. Emit WebSocket event for dashboard
    """
    
    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue()
        self._processor_running = False
        self._stats = {
            "processed": 0,
            "failed": 0,
            "embedded": 0,
        }
    
    async def process_incoming_message(
        self,
        event_data: Dict[str, Any],
    ) -> bool:
        """
        Process incoming Telegram message.
        
        Args:
            event_data: Message event data from Telethon
            
        Returns:
            bool: True if successful
        """
        try:
            telegram_message: TelegramMessage = event_data["message"]
            sender_id: int = event_data["sender_id"]
            
            # Skip bot messages and our own messages
            if telegram_message.from_id is None:
                logger.debug("Skipping channel/system message")
                return False
            
            # Extract message data
            text = telegram_message.message or ""
            has_media = telegram_message.media is not None
            
            logger.info(f"Processing message from user {sender_id}")
            
            # Step 1: Get or create user
            async with db_manager.get_session() as session:
                user = await self._get_or_create_user(session, sender_id)
                if not user:
                    logger.error(f"Failed to create user {sender_id}")
                    return False
                
                # Step 2: Store message
                message = await self._store_message(
                    session=session,
                    user_id=user.id,
                    telegram_message=telegram_message,
                    text=text,
                    has_media=has_media,
                )
                if not message:
                    logger.error("Failed to store message")
                    return False
                
                # Step 3: Update user engagement
                await self._update_user_engagement(session, user)
                
                # Step 4: Update conversation state
                await self._update_conversation(session, user, text)
                
                # Step 5: Generate embedding (async)
                await session.commit()
                
            # Queue for embedding and AI processing
            await self.queue.put({
                "user_id": user.id,
                "message_id": message.id,
                "text": text,
                "timestamp": datetime.now(timezone.utc),
            })
            
            self._stats["processed"] += 1
            return True
            
        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)
            self._stats["failed"] += 1
            return False
    
    async def _get_or_create_user(
        self,
        session: AsyncSession,
        telegram_user_id: int,
    ) -> Optional[User]:
        """Get existing user or create new one."""
        try:
            # Get from database
            result = await session.execute(
                select(User).where(User.user_id == telegram_user_id)
            )
            user = result.scalars().first()
            
            if user:
                return user
            
            # Fetch from Telegram
            telegram_user = await telegram_client.get_user(telegram_user_id)
            if not telegram_user:
                logger.warning(f"Could not fetch user {telegram_user_id} from Telegram")
                return None
            
            # Create user
            user = User(
                user_id=telegram_user_id,
                first_name=telegram_user.first_name or "Unknown",
                last_name=telegram_user.last_name,
                username=telegram_user.username,
                is_bot=telegram_user.bot,
            )
            session.add(user)
            await session.flush()  # Get ID without committing
            
            logger.info(f"Created new user {user.id} (Telegram {telegram_user_id})")
            return user
            
        except Exception as e:
            logger.error(f"Error getting/creating user: {e}")
            return None
    
    async def _store_message(
        self,
        session: AsyncSession,
        user_id: UUID,
        telegram_message: TelegramMessage,
        text: str,
        has_media: bool,
    ) -> Optional[Message]:
        """Store message in database."""
        try:
            # Check for duplicate (idempotency)
            result = await session.execute(
                select(Message).where(
                    (Message.user_id == user_id) &
                    (Message.message_id == telegram_message.id)
                )
            )
            if result.scalars().first():
                logger.debug(f"Message {telegram_message.id} already stored")
                return None
            
            # Create message
            message = Message(
                message_id=telegram_message.id,
                user_id=user_id,
                text=text,
                direction="incoming",
                has_media=has_media,
                media_type=self._get_media_type(telegram_message),
                created_at=telegram_message.date or datetime.now(timezone.utc),
            )
            
            # Extract metadata
            message.metadata = await self._extract_metadata(text)
            
            session.add(message)
            await session.flush()
            
            logger.debug(f"Stored message {message.id}")
            return message
            
        except Exception as e:
            logger.error(f"Error storing message: {e}")
            return None
    
    async def _update_user_engagement(
        self,
        session: AsyncSession,
        user: User,
    ) -> None:
        """Update user engagement metrics."""
        try:
            user.total_messages += 1
            user.total_interactions += 1
            user.last_message_at = datetime.now(timezone.utc)
            
            if not user.first_message_at:
                user.first_message_at = datetime.now(timezone.utc)
            
            await session.flush()
            
        except Exception as e:
            logger.error(f"Error updating engagement: {e}")
    
    async def _update_conversation(
        self,
        session: AsyncSession,
        user: User,
        message_text: str,
    ) -> None:
        """Update or create conversation state."""
        try:
            # Get or create conversation
            result = await session.execute(
                select(Conversation).where(Conversation.user_id == user.id)
            )
            conversation = result.scalars().first()
            
            if not conversation:
                conversation = Conversation(user_id=user.id)
                session.add(conversation)
            
            # Update state
            conversation.is_active = True
            conversation.last_message_direction = "incoming"
            conversation.last_message_at = datetime.now(timezone.utc)
            
            # Detect intent and tone (basic implementation)
            conversation.detected_intent = await self._detect_intent(message_text)
            conversation.detected_tone = await self._detect_tone(message_text)
            
            await session.flush()
            
        except Exception as e:
            logger.error(f"Error updating conversation: {e}")
    
    def _get_media_type(self, message: TelegramMessage) -> Optional[str]:
        """Extract media type from message."""
        if not message.media:
            return None
        
        media_type = type(message.media).__name__
        if "Photo" in media_type:
            return "photo"
        elif "Document" in media_type:
            return "document"
        elif "Video" in media_type:
            return "video"
        elif "Audio" in media_type:
            return "audio"
        elif "WebPage" in media_type:
            return "webpage"
        
        return media_type
    
    async def _extract_metadata(self, text: str) -> Dict[str, Any]:
        """Extract metadata from message."""
        return {
            "sentiment": await self._detect_sentiment(text),
            "intent": await self._detect_intent(text),
            "engagement_score": await self._calculate_engagement_score(text),
        }
    
    async def _detect_sentiment(self, text: str) -> str:
        """Simple sentiment detection (could use ML model)."""
        # Placeholder - would use actual sentiment model
        positive_words = {"great", "awesome", "love", "excellent", "happy"}
        negative_words = {"hate", "bad", "terrible", "awful", "angry"}
        
        text_lower = text.lower()
        
        if any(word in text_lower for word in positive_words):
            return "positive"
        elif any(word in text_lower for word in negative_words):
            return "negative"
        return "neutral"
    
    async def _detect_intent(self, text: str) -> str:
        """Simple intent detection."""
        text_lower = text.lower()
        
        if any(word in text_lower for word in ["?", "help", "how", "what", "when", "where"]):
            return "inquiry"
        elif any(word in text_lower for word in ["problem", "issue", "bug", "error", "not working"]):
            return "complaint"
        elif any(word in text_lower for word in ["thank", "thanks", "appreciate", "good job"]):
            return "feedback"
        
        return "other"
    
    async def _detect_tone(self, text: str) -> str:
        """Detect conversation tone."""
        text_lower = text.lower()
        
        if any(word in text_lower for word in ["please", "thank", "hello"]):
            return "formal"
        elif "!!!" in text or "???" in text:
            return "emotional"
        
        return "neutral"
    
    async def _calculate_engagement_score(self, text: str) -> float:
        """Calculate engagement score for message."""
        # Simple heuristic
        score = 0.5  # Base score
        
        if len(text) > 100:
            score += 0.2
        if "?" in text:
            score += 0.15
        if len(text.split()) > 20:
            score += 0.15
        
        return min(score, 1.0)
    
    # ==================== BACKGROUND PROCESSING ====================
    
    async def start_processor(self) -> None:
        """Start background message processor."""
        if self._processor_running:
            logger.warning("Processor already running")
            return
        
        self._processor_running = True
        logger.info("Starting message processor")
        
        # Run processor task
        try:
            await self._process_queue()
        except asyncio.CancelledError:
            logger.info("Message processor stopped")
        finally:
            self._processor_running = False
    
    async def _process_queue(self) -> None:
        """Process queued messages for embedding."""
        while self._processor_running:
            try:
                # Get message from queue with timeout
                message_data = await asyncio.wait_for(
                    self.queue.get(),
                    timeout=30
                )
                
                # Generate embedding
                await self._generate_embedding(message_data)
                
            except asyncio.TimeoutError:
                # Queue empty, continue
                continue
            except Exception as e:
                logger.error(f"Error processing queue: {e}", exc_info=True)
                await asyncio.sleep(5)
    
    async def _generate_embedding(self, message_data: Dict[str, Any]) -> None:
        """Generate embedding for message."""
        try:
            user_id = message_data["user_id"]
            message_id = message_data["message_id"]
            text = message_data["text"]
            
            if not text or len(text) < 3:
                logger.debug(f"Skipping embedding for short message {message_id}")
                return
            
            # Generate embedding
            embedding_vector = await embedding_service.embed_text(text)
            
            # Store embedding in database
            async with db_manager.get_session() as session:
                # Create memory record
                content_hash = hashlib.sha256(text.encode()).hexdigest()
                
                memory = Memory(
                    user_id=user_id,
                    message_id=message_id,
                    content=text,
                    content_hash=content_hash,
                    embedding=embedding_vector,
                    memory_type="message",
                )
                
                session.add(memory)
                
                # Update message processed flag
                await session.execute(
                    update(Message)
                    .where(Message.id == message_id)
                    .values(
                        processed=True,
                        has_embedding=True,
                        embedded_at=datetime.now(timezone.utc)
                    )
                )
                
                await session.commit()
            
            self._stats["embedded"] += 1
            logger.debug(f"Generated embedding for message {message_id}")
            
        except Exception as e:
            logger.error(f"Error generating embedding: {e}", exc_info=True)


# Global message processor instance
message_processor = MessageProcessor()


__all__ = ["message_processor", "MessageProcessor"]
