"""
app/services/ai/claude_client.py
Claude API integration for conversational AI responses.

ARCHITECTURE DECISIONS:
1. Request/response wrapping for error handling
2. Token counting for cost tracking
3. Context window management
4. Async streaming support
5. Fallback responses
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import anthropic

from app.core.config import settings

logger = logging.getLogger(__name__)


class ClaudeAIClient:
    """
    Manages interactions with Claude API.
    
    Handles:
    - Message generation with context
    - Token counting and management
    - Error recovery
    - Temperature and parameter tuning
    """
    
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = settings.CLAUDE_MODEL
        self.max_tokens = settings.CLAUDE_MAX_TOKENS
        self.temperature = settings.CLAUDE_TEMPERATURE
        self._stats = {
            "requests": 0,
            "errors": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
        }
    
    async def generate_response(
        self,
        user_id: str,
        messages: List[Dict[str, str]],
        system_prompt: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        tone: str = "friendly",
    ) -> Dict[str, Any]:
        """
        Generate AI response using Claude.
        
        Args:
            user_id: User identifier for context
            messages: Conversation history
            system_prompt: System prompt for tone/behavior
            max_tokens: Max output tokens
            temperature: Sampling temperature
            tone: Response tone
            
        Returns:
            Response dict with text and metadata
        """
        try:
            # Use defaults if not specified
            max_tokens = max_tokens or self.max_tokens
            temperature = temperature or self.temperature
            
            # Build messages
            formatted_messages = self._format_messages(messages)
            
            logger.debug(f"Generating response for user {user_id} with {len(formatted_messages)} messages")
            
            # Call Claude API
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=formatted_messages,
            )
            
            # Extract response
            generated_text = response.content[0].text
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            
            # Update stats
            self._stats["requests"] += 1
            self._stats["total_input_tokens"] += input_tokens
            self._stats["total_output_tokens"] += output_tokens
            
            logger.info(
                f"Generated response ({input_tokens} input, {output_tokens} output tokens)"
            )
            
            return {
                "success": True,
                "text": generated_text,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
                "confidence": 0.9,  # Claude responses are generally high confidence
                "requires_review": self._should_review(generated_text),
            }
            
        except anthropic.RateLimitError:
            logger.error("Claude API rate limited")
            self._stats["errors"] += 1
            return {
                "success": False,
                "error": "API rate limited",
                "text": self._get_fallback_response(tone),
            }
        except anthropic.AuthenticationError:
            logger.error("Claude API authentication failed")
            self._stats["errors"] += 1
            return {
                "success": False,
                "error": "Authentication failed",
                "text": self._get_fallback_response(tone),
            }
        except anthropic.APIError as e:
            logger.error(f"Claude API error: {e}")
            self._stats["errors"] += 1
            return {
                "success": False,
                "error": str(e),
                "text": self._get_fallback_response(tone),
            }
    
    async def analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """
        Analyze sentiment of message.
        
        Returns:
            Sentiment analysis results
        """
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=200,
                messages=[{
                    "role": "user",
                    "content": f"Analyze the sentiment of this message in one word (positive/negative/neutral). Message: \"{text}\""
                }],
            )
            
            sentiment = response.content[0].text.strip().lower()
            
            # Map to standard sentiments
            if "positive" in sentiment:
                return {"sentiment": "positive", "confidence": 0.85}
            elif "negative" in sentiment:
                return {"sentiment": "negative", "confidence": 0.85}
            else:
                return {"sentiment": "neutral", "confidence": 0.80}
                
        except Exception as e:
            logger.warning(f"Sentiment analysis failed: {e}")
            return {"sentiment": "neutral", "confidence": 0.0}
    
    async def extract_intent(self, text: str) -> Dict[str, Any]:
        """
        Extract user intent from message.
        
        Returns:
            Intent analysis
        """
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=100,
                messages=[{
                    "role": "user",
                    "content": f"What is the primary intent of this message? Choose one: inquiry, complaint, feedback, purchase, other. Message: \"{text}\""
                }],
            )
            
            intent_text = response.content[0].text.strip().lower()
            
            # Map to intents
            intents = ["inquiry", "complaint", "feedback", "purchase", "other"]
            for intent in intents:
                if intent in intent_text:
                    return {"intent": intent, "confidence": 0.80}
            
            return {"intent": "other", "confidence": 0.60}
                
        except Exception as e:
            logger.warning(f"Intent extraction failed: {e}")
            return {"intent": "other", "confidence": 0.0}
    
    def count_tokens(self, text: str) -> int:
        """
        Estimate token count for text.
        
        Note: This is an approximation. Claude uses BPE tokenization.
        """
        # Rough estimation: 1 token ≈ 4 characters
        return len(text) // 4
    
    # ==================== PRIVATE METHODS ====================
    
    def _format_messages(self, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """Format messages for Claude API."""
        formatted = []
        
        for msg in messages:
            formatted.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", ""),
            })
        
        return formatted
    
    def _should_review(self, text: str) -> bool:
        """Determine if response needs human review."""
        # Flag responses that might need review
        review_triggers = [
            "i'm not sure",
            "i cannot",
            "i cannot help",
            "as an ai",
            "unfortunately",
        ]
        
        text_lower = text.lower()
        for trigger in review_triggers:
            if trigger in text_lower:
                return True
        
        # Very short responses might need review
        if len(text.split()) < 3:
            return True
        
        return False
    
    def _get_fallback_response(self, tone: str = "friendly") -> str:
        """Get fallback response if Claude API fails."""
        fallbacks = {
            "friendly": "Hey! Thanks for reaching out. I'm having a quick hiccup connecting with our AI, but we'll get back to you soon with a proper response!",
            "professional": "Thank you for your message. We're experiencing temporary technical difficulties. Our team will respond shortly.",
            "casual": "Yo! Quick heads up - our AI is taking a coffee break. A human will hit you up soon!",
        }
        
        return fallbacks.get(tone, fallbacks["friendly"])
    
    @property
    def stats(self) -> Dict[str, Any]:
        """Get API usage statistics."""
        return self._stats.copy()


class ConversationContext:
    """
    Manages context window for conversation.
    
    Builds the optimal context for Claude by:
    1. Including recent messages
    2. Adding relevant memories from vector store
    3. Summarizing user state
    4. Managing token limits
    """
    
    def __init__(self, vector_store):
        self.vector_store = vector_store
    
    async def build_context(
        self,
        user_id: str,
        recent_messages: List[Dict],
        user_profile: Dict,
        max_context_tokens: int = 4000,
    ) -> str:
        """
        Build context string for Claude.
        
        Args:
            user_id: User identifier
            recent_messages: Recent conversation messages
            user_profile: User profile/state
            max_context_tokens: Token budget
            
        Returns:
            Context string for system prompt
        """
        context_parts = []
        
        # User information
        context_parts.append(
            f"User: {user_profile.get('first_name', 'Unknown')} "
            f"({user_profile.get('username', 'no username')})"
        )
        
        # Conversation state
        if user_profile.get('conversation_state'):
            context_parts.append(
                f"Relationship Stage: {user_profile['conversation_state']}"
            )
        
        # Engagement metrics
        context_parts.append(
            f"Messages: {user_profile.get('total_messages', 0)}, "
            f"Engagement: {user_profile.get('lead_score', 0):.1f}/100"
        )
        
        # Previous conversation summary
        if user_profile.get('conversation_summary'):
            context_parts.append(
                f"History: {user_profile['conversation_summary']}"
            )
        
        # User preferences/facts from vector memory
        if self.vector_store:
            memories = await self.vector_store.search_memories_by_topic(
                user_id,
                "user preferences interests",
                limit=3
            )
            if memories:
                context_parts.append("Known Preferences:")
                for memory in memories:
                    context_parts.append(f"  - {memory['content']}")
        
        return "\n".join(context_parts)


# Global instances
claude_client = ClaudeAIClient()


__all__ = ["claude_client", "ClaudeAIClient", "ConversationContext"]
