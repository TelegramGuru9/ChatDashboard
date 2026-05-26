import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import db_manager

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

    # Telegram — non-fatal, requires manual auth first
    try:
        from app.services.telegram.client import telegram_client
        connected = await telegram_client.connect()
        if connected:
            logger.info("Telegram connected")
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

# CORS — allow all for now
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ==================== HEALTH ====================

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "timestamp": str(datetime.utcnow()),
    }


# ==================== ROUTES ====================

from app.api.v1 import api_router
app.include_router(api_router, prefix=settings.API_V1_STR)
