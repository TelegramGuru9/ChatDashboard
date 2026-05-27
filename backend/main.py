import logging
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import db_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==================== LIFESPAN ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    # Database
    try:
        await db_manager.initialize()
        await db_manager.create_tables()
        logger.info("Database ready")
    except Exception as e:
        logger.error(f"Database init failed: {e}")

    # Telegram — wire message_processor BEFORE connecting
    try:
        from app.services.telegram.client import telegram_client
        from app.services.telegram.message_handler import message_processor

        # Wire the event handler so new incoming messages get stored + processed
        telegram_client.on("message_new", message_processor.process_incoming_message)
        logger.info("Message processor wired to Telegram client")

        connected = await telegram_client.connect()
        if connected:
            logger.info("Telegram connected — listening for messages")
            # Start background processor (embedding queue)
            asyncio.create_task(message_processor.start_processor())
        else:
            logger.warning("Telegram not connected — run auth first")
    except Exception as e:
        logger.warning(f"Telegram skipped: {e}")

    logger.info("Startup complete")
    yield

    # Shutdown
    try:
        from app.services.telegram.client import telegram_client
        await telegram_client.disconnect()
    except Exception:
        pass
    try:
        await db_manager.close()
    except Exception:
        pass
    logger.info("Shutdown complete")


# ==================== APP ====================

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered Telegram CRM platform",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# CORS
_cors_raw = settings.CORS_ORIGINS or "*"
_cors_origins = [o.strip() for o in _cors_raw.split(",")] if "," in _cors_raw else [_cors_raw]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== HEALTH ====================

@app.get("/health")
async def health_check():
    from app.services.telegram.client import telegram_client
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "telegram_connected": telegram_client.is_connected,
        "timestamp": str(datetime.utcnow()),
    }


# ==================== ROUTES ====================

from app.api.v1 import api_router
app.include_router(api_router, prefix=settings.API_V1_STR)
