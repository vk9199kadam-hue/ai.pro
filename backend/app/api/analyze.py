import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.schemas.manifest import AnalyzeRequest, AnalyzeResponse, ViralClip, PrepareClipRequest, RenderManifest
from app.services.transcript import extract_video_id, get_transcript, format_transcript_with_timestamps, extract_relative_words
from app.services.gemini_service import analyze_viral_moments

router = APIRouter(tags=["Analysis & Clips"])

# In-memory storage for demonstration and fast lookups
CLIPS_CACHE = {}
TRANSCRIPTS_CACHE = {}

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_video(request: AnalyzeRequest):
    """
    Analyze YouTube video or upload, extract speech transcript, 
    and call Gemini Flash to identify viral hooks.
    """
    if request.source_type == "YOUTUBE_URL":
        if not request.url:
            raise HTTPException(status_code=400, detail="URL is required for YOUTUBE_URL source")
        
        video_id = extract_video_id(request.url)
        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL provided")
        
        # 1. Fetch transcript (takes ~1s)
        raw_transcript = get_transcript(video_id)
        if not raw_transcript:
            raise HTTPException(
                status_code=422, 
                detail="Could not retrieve transcript for this video. Consider uploading MP4 directly."
            )
            
        formatted_text = format_transcript_with_timestamps(raw_transcript)
        TRANSCRIPTS_CACHE[video_id] = raw_transcript
        
        # 2. Call Gemini Flash (takes ~2s)
        try:
            analysis = analyze_viral_moments(formatted_text, num_clips=request.num_clips)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")
            
        source_id = str(uuid.uuid4())
        viral_clips = []
        
        for item in analysis.get("clips", []):
            clip_id = f"clip_{uuid.uuid4().hex[:8]}"
            start_s = item["start_time_seconds"]
            end_s = item["end_time_seconds"]
            
            # Extract word-level timestamps relative to clip cut
            relative_words = extract_relative_words(raw_transcript, start_s, end_s)
            
            clip_obj = ViralClip(
                clip_number=item["clip_number"],
                hook_title=item["hook_title"],
                start_time_seconds=start_s,
                end_time_seconds=end_s,
                start_time_formatted=item.get("start_time_formatted", ""),
                end_time_formatted=item.get("end_time_formatted", ""),
                duration_seconds=item.get("duration_seconds", round(end_s - start_s, 2)),
                viral_score=item.get("viral_score", 90),
                virality_reason=item.get("virality_reason", ""),
                key_quote=item.get("key_quote", ""),
                words=relative_words
            )
            
            CLIPS_CACHE[clip_id] = {
                "clip": clip_obj,
                "video_url": request.url,
                "video_id": video_id
            }
            viral_clips.append(clip_obj)
            
        return AnalyzeResponse(
            source_id=source_id,
            video_id=video_id,
            total_clips=len(viral_clips),
            clips=viral_clips
        )
    else:
        # DIRECT_UPLOAD handling
        raise HTTPException(status_code=501, detail="Direct upload endpoint ready in media upload service.")

@router.post("/clips/{clip_id}/prepare", response_model=RenderManifest)
async def prepare_clip_manifest(clip_id: str, request: PrepareClipRequest):
    """
    Returns the media manifest and relative word-level timestamps 
    for the user's phone to render locally with Android Media3.
    """
    if clip_id not in CLIPS_CACHE:
        # Fallback for preview / dev testing mode
        return RenderManifest(
            clip_id=clip_id,
            source_url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            trim_start=0.0,
            trim_end=30.0,
            target_width=1080,
            target_height=1920,
            layout="blurred_fill",
            caption_style=request.caption_style,
            creator_tag=request.creator_tag,
            words=[
                {"word": "Welcome", "start": 0.5, "end": 1.0, "confidence": 0.99},
                {"word": "to", "start": 1.1, "end": 1.3, "confidence": 0.99},
                {"word": "ClipSnap", "start": 1.4, "end": 2.0, "confidence": 0.99},
                {"word": "AI", "start": 2.1, "end": 2.5, "confidence": 0.99},
            ]
        )
        
    cached = CLIPS_CACHE[clip_id]
    clip = cached["clip"]
    
    return RenderManifest(
        clip_id=clip_id,
        source_url=cached["video_url"],
        trim_start=clip.start_time_seconds,
        trim_end=clip.end_time_seconds,
        target_width=1080,
        target_height=1920,
        layout="blurred_fill",
        caption_style=request.caption_style,
        creator_tag=request.creator_tag,
        words=clip.words or []
    )

@router.get("/loadbalancer/status")
async def get_load_balancer_status():
    """
    Returns real-time status, health, and throughput metrics 
    for the Gemini API multi-key pool.
    """
    from app.services.gemini_service import key_pool
    return key_pool.get_status()

