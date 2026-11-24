from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.analyze import router as analyze_router
from app.api.credits import router as credits_router
from app.database.session import init_db

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Cloud Intelligence Gateway for AI Viral Shorts Mobile SaaS"
)

# Initialize Database tables
@app.on_event("startup")
def on_startup():
    init_db()

# CORS setup for mobile client access
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(analyze_router, prefix=settings.API_V1_STR)
app.include_router(credits_router, prefix=settings.API_V1_STR)

@app.get("/healthz")
async def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

@app.get("/")
async def root():
    return {
        "message": "AI Viral Shorts Gateway is running. Visit /docs for OpenAPI specifications."
    }
