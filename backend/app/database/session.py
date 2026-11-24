from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.database.models import Base

# Database engine: uses SQLite locally, connects to Oracle Cloud DB via DATABASE_URL
connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)

def get_db():
    """Dependency for API endpoints to get a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

