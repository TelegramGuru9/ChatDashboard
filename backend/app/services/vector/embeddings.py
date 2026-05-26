"""
app/services/vector/embeddings.py
Text embedding generation using Voyage or Claude API.

ARCHITECTURE DECISIONS:
1. Support multiple embedding models
2. Batch embedding for efficiency
3. Caching for identical texts
4. Async API calls
5. Fallback mechanisms
"""

import logging
from typing import List, Optional
import httpx
import numpy as np
from hashlib import sha256

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Generates text embeddings for semantic search.
    
    Supports:
    - Voyage API (recommended)
    - Claude API embeddings
    - Local caching
    """
    
    def __init__(self):
        self.model = settings.EMBEDDING_MODEL
        self.dimension = settings.EMBEDDING_DIMENSION
        self._embedding_cache = {}  # Simple in-memory cache
        self.http_client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "AI-Telegram-CRM/1.0",
            }
        )
    
    async def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for single text.
        
        Args:
            text: Text to embed
            
        Returns:
            Embedding vector
        """
        # Check cache
        text_hash = sha256(text.encode()).hexdigest()
        if text_hash in self._embedding_cache:
            logger.debug(f"Cache hit for text hash {text_hash}")
            return self._embedding_cache[text_hash]
        
        # Generate embedding
        if self.model == "voyage-3":
            embedding = await self._embed_voyage([text])
            result = embedding[0] if embedding else []
        elif self.model == "claude":
            embedding = await self._embed_claude(text)
            result = embedding or []
        else:
            raise ValueError(f"Unknown embedding model: {self.model}")
        
        # Cache result
        if result:
            self._embedding_cache[text_hash] = result
        
        return result
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts efficiently.
        
        Args:
            texts: List of texts to embed
            
        Returns:
            List of embedding vectors
        """
        results = []
        
        # Check cache first
        uncached_texts = []
        uncached_indices = []
        
        for idx, text in enumerate(texts):
            text_hash = sha256(text.encode()).hexdigest()
            if text_hash in self._embedding_cache:
                results.append(self._embedding_cache[text_hash])
            else:
                uncached_texts.append(text)
                uncached_indices.append(idx)
        
        # Generate embeddings for uncached texts
        if uncached_texts:
            if self.model == "voyage-3":
                embeddings = await self._embed_voyage(uncached_texts)
            elif self.model == "claude":
                embeddings = [await self._embed_claude(text) for text in uncached_texts]
            else:
                embeddings = [[] for _ in uncached_texts]
            
            # Insert into results at correct positions
            for idx, embedding in zip(uncached_indices, embeddings):
                if embedding:
                    # Cache it
                    text_hash = sha256(uncached_texts[uncached_indices.index(idx)].encode()).hexdigest()\n                    self._embedding_cache[text_hash] = embedding
                results.insert(idx, embedding or [])
        
        return results
    
    async def _embed_voyage(self, texts: List[str]) -> List[List[float]]:
        """
        Embed using Voyage API.
        
        Requires VOYAGE_API_KEY environment variable.
        """
        try:
            response = await self.http_client.post(
                "https://api.voyageai.com/v1/embeddings",
                json={
                    "input": texts,
                    "model": "voyage-3",
                    "input_type": "document",
                },
                headers={
                    "Authorization": f"Bearer {settings.VOYAGE_API_KEY}",
                }
            )
            response.raise_for_status()
            
            data = response.json()
            embeddings = [item["embedding"] for item in data["data"]]
            
            logger.debug(f"Generated {len(embeddings)} embeddings via Voyage")
            return embeddings
            
        except Exception as e:
            logger.error(f"Voyage embedding failed: {e}")
            return [[] for _ in texts]
    
    async def _embed_claude(self, text: str) -> Optional[List[float]]:
        """
        Embed using Claude API.
        
        Note: Claude API embedding support varies by model.
        This is a placeholder for future implementation.
        """
        try:
            from anthropic import Anthropic
            
            client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            
            # This would depend on Claude's embedding API availability
            # For now, use a simple placeholder
            logger.warning("Claude API embeddings not yet implemented")
            return None
            
        except Exception as e:
            logger.error(f"Claude embedding failed: {e}")
            return None
    
    async def close(self) -> None:
        """Close HTTP client."""
        await self.http_client.aclose()


class VectorStore:
    """
    Manages vector similarity search using pgvector.
    """
    
    def __init__(self):
        from app.db.database import db_manager
        self.db = db_manager
    
    async def search_similar(
        self,
        user_id: str,
        embedding: List[float],
        limit: int = 5,
        similarity_threshold: float = 0.5,
    ) -> List[dict]:
        """
        Find similar memories using vector search.
        
        Args:
            user_id: User UUID
            embedding: Query embedding vector
            limit: Maximum results
            similarity_threshold: Minimum similarity score (0-1)
            
        Returns:
            List of similar memories with similarity scores
        """
        from sqlalchemy import func, text
        from sqlalchemy.sql import select
        from app.db.models import Memory
        from uuid import UUID
        
        try:
            async with self.db.get_session() as session:
                # pgvector cosine similarity search
                # 1 - (a <=> b) converts distance to similarity
                query = select(
                    Memory,
                    (1 - (Memory.embedding.op("<=>") (text(f"'{embedding}'")))).label("similarity")
                ).where(
                    Memory.user_id == UUID(user_id)
                ).order_by(
                    Memory.embedding.op("<=>") (text(f"'{embedding}'"))
                ).limit(limit)
                
                result = await session.execute(query)
                rows = result.all()
                
                # Filter by threshold and convert to dict
                memories = []
                for memory, similarity in rows:
                    if similarity >= similarity_threshold:
                        memories.append({
                            "id": str(memory.id),
                            "content": memory.content,
                            "type": memory.memory_type,
                            "similarity": float(similarity),
                            "created_at": memory.created_at,
                            "metadata": memory.metadata,
                        })
                
                logger.debug(f"Found {len(memories)} similar memories for user {user_id}")
                return memories
                
        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []
    
    async def search_memories_by_topic(
        self,
        user_id: str,
        topic: str,
        limit: int = 5,
    ) -> List[dict]:
        """
        Search memories by topic using semantic search.
        
        Args:
            user_id: User UUID
            topic: Topic to search for
            limit: Maximum results
            
        Returns:
            List of relevant memories
        """
        # Generate embedding for topic
        embedding = await embedding_service.embed_text(topic)
        
        if not embedding:
            logger.warning(f"Could not generate embedding for topic: {topic}")
            return []
        
        # Search
        return await self.search_similar(user_id, embedding, limit)


# Global instances
embedding_service = EmbeddingService()
vector_store = VectorStore()


__all__ = ["embedding_service", "vector_store", "EmbeddingService", "VectorStore"]
