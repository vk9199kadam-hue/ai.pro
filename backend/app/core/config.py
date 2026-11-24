import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "AI Viral Shorts Backend"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Gemini AI
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # Database (Default to local SQLite for development, Oracle in production)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./app.db")
    
    # Storage settings
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    EXPORT_DIR: str = os.getenv("EXPORT_DIR", "exports")
    
    # CORS
    CORS_ORIGINS: list = ["*"]

settings = Settings()
