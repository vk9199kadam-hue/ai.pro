import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    user_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    credit_record = relationship("UserCredits", back_populates="user", uselist=False)
    transactions = relationship("CreditTransaction", back_populates="user")
    media_sources = relationship("MediaSource", back_populates="user")

class UserCredits(Base):
    __tablename__ = "user_credits"
    user_id = Column(String(36), ForeignKey("users.user_id"), primary_key=True)
    balance = Column(Integer, default=5, nullable=False)  # 5 free clips on signup
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="credit_record")

class CreditTransaction(Base):
    __tablename__ = "credit_transactions"
    transaction_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.user_id"), nullable=False)
    amount = Column(Integer, nullable=False)  # e.g. +5, -1, +1
    reason = Column(String(50), nullable=False)  # 'SIGNUP_BONUS', 'EXPORT_CLIP', 'REWARD_AD'
    idempotency_key = Column(String(64), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="transactions")

class MediaSource(Base):
    __tablename__ = "media_sources"
    source_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.user_id"), nullable=False)
    source_type = Column(String(20), nullable=False)  # 'YOUTUBE_URL', 'DIRECT_UPLOAD'
    storage_key = Column(String(500), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    status = Column(String(20), default="PENDING")  # 'PENDING', 'ANALYZED', 'ERROR'
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="media_sources")
    clips = relationship("Clip", back_populates="source")

class Clip(Base):
    __tablename__ = "clips"
    clip_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_id = Column(String(36), ForeignKey("media_sources.source_id"), nullable=False)
    start_time_seconds = Column(Float, nullable=False)
    end_time_seconds = Column(Float, nullable=False)
    viral_score = Column(Integer, nullable=False)
    hook_title = Column(String(300), nullable=False)
    key_quote = Column(String(500), nullable=True)
    virality_reason = Column(String(1000), nullable=True)
    
    source = relationship("MediaSource", back_populates="clips")

class DeviceExport(Base):
    __tablename__ = "device_exports"
    export_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.user_id"), nullable=False)
    clip_id = Column(String(36), ForeignKey("clips.clip_id"), nullable=False)
    device_model = Column(String(100), nullable=True)
    profile_used = Column(String(20), default="STD_1080P")  # 'LOW_720P', 'STD_1080P', 'HIGH_1080P60'
    render_status = Column(String(20), default="STARTED")  # 'STARTED', 'COMPLETED', 'FAILED'
    created_at = Column(DateTime, default=datetime.utcnow)

