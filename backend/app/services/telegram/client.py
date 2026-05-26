"""
app/services/telegram/client.py
Telethon client wrapper for Telegram integration.

ARCHITECTURE DECISIONS:
1. Wrapper pattern for dependency injection
2. Connection pooling and reconnection logic
3. Async/await throughout
4. Error handling and recovery
5. Event emitter for message notifications
"""

import logging
from typing import Optional, Callable, Any
from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError, AuthKeyUnregisteredError
from telethon.network import ConnectionTcpAbridged
from pathlib import Path
import asyncio

from app.core.config import settings

logger = logging.getLogger(__name__)


class TelegramClientManager:
    """
    Manages Telegram client connection and lifecycle.
    
    WHY THIS PATTERN:
    - Abstraction over Telethon for easier testing
    - Centralized connection management
    - Automatic reconnection
    - Event handling separation
    """
    
    def __init__(self):
        self.client: Optional[TelegramClient] = None
        self._is_connected = False
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5
        self._reconnect_delay = 5  # seconds
        
        # Event handlers registry
        self._handlers: dict[str, list[Callable]] = {
            "message_new": [],
            "message_edit": [],
            "connection_lost": [],
            "connection_restored": [],
        }
    
    async def connect(self) -> bool:
        """
        Establish Telegram connection.
        
        Returns:
            bool: True if connection successful
        """
        try:
            # Create client
            self.client = TelegramClient(
                session=Path(settings.TELEGRAM_SESSION_PATH) / settings.TELEGRAM_SESSION_NAME,
                api_id=settings.TELEGRAM_API_ID,
                api_hash=settings.TELEGRAM_API_HASH,
                connection=ConnectionTcpAbridged,
                auto_reconnect=True,
                connection_retries=settings.TELEGRAM_REQUEST_RETRIES,
                retry_delay=1,
                request_retries=settings.TELEGRAM_REQUEST_RETRIES,
            )
            
            # Connect and authenticate
            await self.client.start(
                phone=settings.TELEGRAM_PHONE,
                code_callback=self._code_callback,
                password=self._password_callback,
            )
            
            # Get self user
            me = await self.client.get_me()
            logger.info(f"Connected to Telegram as {me.first_name} (@{me.username})")
            
            # Register event handlers
            self._register_event_handlers()
            
            self._is_connected = True
            self._reconnect_attempts = 0
            
            return True
            
        except SessionPasswordNeededError:
            logger.error("2FA password needed - configure and try again")
            return False
        except AuthKeyUnregisteredError:
            logger.error("Session key unregistered - delete session and reconnect")
            return False
        except Exception as e:
            logger.error(f"Failed to connect to Telegram: {e}")
            return False
    
    async def disconnect(self) -> None:
        """Disconnect from Telegram."""
        if self.client:
            await self.client.disconnect()
            self._is_connected = False
            logger.info("Disconnected from Telegram")
    
    async def ensure_connected(self) -> bool:
        """
        Ensure connection is active, reconnect if needed.
        
        Returns:
            bool: True if connected
        """
        if self._is_connected and self.client and self.client.is_connected():
            return True
        
        logger.warning("Connection lost, attempting to reconnect...")
        
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            logger.error("Max reconnection attempts reached")
            return False
        
        self._reconnect_attempts += 1
        await asyncio.sleep(self._reconnect_delay)
        
        success = await self.connect()
        if success:
            await self._emit_event("connection_restored", {})
        else:
            await self._emit_event("connection_lost", {})
        
        return success
    
    def _register_event_handlers(self) -> None:
        """Register Telethon event handlers."""
        if not self.client:
            return
        
        # New message event
        @self.client.on(events.NewMessage(incoming=True))
        async def handle_new_message(event):
            try:
                await self._emit_event("message_new", {
                    "event": event,
                    "message": event.message,
                    "sender_id": event.sender_id,
                })
            except Exception as e:
                logger.error(f"Error handling new message: {e}")
        
        # Message edited event
        @self.client.on(events.MessageEdited())
        async def handle_message_edited(event):
            try:
                await self._emit_event("message_edit", {
                    "event": event,
                    "message": event.message,
                    "sender_id": event.sender_id,
                })
            except Exception as e:
                logger.error(f"Error handling message edit: {e}")
        
        logger.info("Event handlers registered")
    
    async def send_message(
        self,
        user_id: int,
        text: str,
        reply_to: Optional[int] = None,
    ) -> Optional[int]:
        """
        Send message to user.
        
        Args:
            user_id: Telegram user ID
            text: Message text
            reply_to: Message ID to reply to
            
        Returns:
            Message ID if successful, None otherwise
        """
        if not await self.ensure_connected():
            logger.error("Cannot send message: not connected")
            return None
        
        try:
            message = await self.client.send_message(
                entity=user_id,
                message=text,
                reply_to=reply_to,
            )
            logger.info(f"Sent message {message.id} to user {user_id}")
            return message.id
            
        except Exception as e:
            logger.error(f"Failed to send message to {user_id}: {e}")
            return None
    
    async def edit_message(
        self,
        user_id: int,
        message_id: int,
        text: str,
    ) -> bool:
        """
        Edit existing message.
        
        Args:
            user_id: Telegram user ID
            message_id: ID of message to edit
            text: New message text
            
        Returns:
            True if successful
        """
        if not await self.ensure_connected():
            return False
        
        try:
            await self.client.edit_message(
                entity=user_id,
                message=message_id,
                text=text,
            )
            logger.info(f"Edited message {message_id} for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to edit message: {e}")
            return False
    
    async def get_user(self, user_id: int) -> Optional[Any]:
        """Get user entity from Telegram."""
        if not await self.ensure_connected():
            return None
        
        try:
            return await self.client.get_entity(user_id)
        except Exception as e:
            logger.error(f"Failed to get user {user_id}: {e}")
            return None
    
    async def get_chat_history(
        self,
        user_id: int,
        limit: int = 100,
    ) -> list[Any]:
        """
        Get message history with user.
        
        Args:
            user_id: Telegram user ID
            limit: Number of messages to retrieve
            
        Returns:
            List of messages
        """
        if not await self.ensure_connected():
            return []
        
        try:
            messages = []
            async for message in self.client.iter_messages(user_id, limit=limit):
                messages.append(message)
            return messages
            
        except Exception as e:
            logger.error(f"Failed to get chat history: {e}")
            return []
    
    # ==================== EVENT SYSTEM ====================
    
    def on(self, event_name: str, handler: Callable) -> None:
        """
        Register event handler.
        
        Args:
            event_name: Event type ('message_new', 'message_edit', etc)
            handler: Async callback function
        """
        if event_name not in self._handlers:
            raise ValueError(f"Unknown event type: {event_name}")
        self._handlers[event_name].append(handler)
    
    def off(self, event_name: str, handler: Callable) -> None:
        """Unregister event handler."""
        if event_name in self._handlers:
            self._handlers[event_name].remove(handler)
    
    async def _emit_event(self, event_name: str, data: dict) -> None:
        """Emit event to all registered handlers."""
        if event_name not in self._handlers:
            return
        
        handlers = self._handlers[event_name]
        
        # Run handlers concurrently
        tasks = [handler(data) for handler in handlers]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    # ==================== PRIVATE METHODS ====================
    
    async def _code_callback(self) -> str:
        """Callback for 2FA code input."""
        code = input("Enter Telegram code: ")
        return code
    
    async def _password_callback(self) -> str:
        """Callback for password input."""
        password = input("Enter Telegram password: ")
        return password
    
    @property
    def is_connected(self) -> bool:
        """Check if connected to Telegram."""
        return self._is_connected and self.client and self.client.is_connected()


# Global Telegram client instance
telegram_client = TelegramClientManager()


__all__ = ["telegram_client", "TelegramClientManager"]
