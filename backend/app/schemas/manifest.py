from pydantic import BaseModel, Field
from typing import List, Optional

class AnalyzeRequest(BaseModel):
    source_type: str = Field(..., description="'YOUTUBE_URL' or 'DIRECT_UPLOAD'")
    url: Optional[str] = Field(None, description="YouTube or media URL")
    num_clips: int = Field(default=3, ge=1, le=6, description="Number of viral clips to detect")

class WordTimestamp(BaseModel):
    word: str
    start: float  # Normalized relative to clip start
    end: float    # Normalized relative to clip start
    highlight: bool = True

class SocialKit(BaseModel):
    viral_title: str
    caption: str
    hashtags: List[str]
    hashtags_formatted: str
    full_transcript: str

class ViralClip(BaseModel):
    clip_number: int
    hook_title: str
    start_time_seconds: float
    end_time_seconds: float
    start_time_formatted: str
    end_time_formatted: str
    duration_seconds: float
    viral_score: int
    virality_reason: str
    key_quote: str
    preview_url: Optional[str] = None
    social_kit: Optional[SocialKit] = None
    words: Optional[List[WordTimestamp]] = None

class AnalyzeResponse(BaseModel):
    source_id: str
    video_id: Optional[str] = None
    total_clips: int
    clips: List[ViralClip]

class PrepareClipRequest(BaseModel):
    clip_id: str
    caption_style: str = "hype_yellow" # hype_yellow, clean_white, neon_glow
    creator_tag: Optional[str] = None

class RenderManifest(BaseModel):
    clip_id: str
    source_url: str
    trim_start: float
    trim_end: float
    target_width: int = 1080
    target_height: int = 1920
    layout: str = "blurred_fill" # blurred_fill, center_crop
    caption_style: str
    creator_tag: Optional[str] = None
    words: List[WordTimestamp]

