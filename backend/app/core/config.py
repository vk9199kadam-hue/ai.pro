import os
from typing import List
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "AI Viral Shorts Backend"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Gemini AI - Single & Multi-Key Pool support
    @property
    def GEMINI_API_KEYS(self) -> List[str]:
        """
        Dynamically reads API keys from environment so adding/updating keys
        in .env takes effect without requiring code restarts.
        """
        raw_keys = os.getenv("GEMINI_API_KEYS", "")
        keys = [k.strip() for k in raw_keys.split(",") if k.strip()]
        if not keys:
            single = os.getenv("GEMINI_API_KEY", "")
            if single:
                keys = [single.strip()]
        return keys

    @property
    def GEMINI_API_KEY(self) -> str:
        keys = self.GEMINI_API_KEYS
        return keys[0] if keys else ""
    
    # Database (Default to local SQLite for development, Oracle in production)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./app.db")
    
    # Storage settings
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    EXPORT_DIR: str = os.getenv("EXPORT_DIR", "exports")
    
    # CORS
    CORS_ORIGINS: list = ["*"]

settings = Settings()
