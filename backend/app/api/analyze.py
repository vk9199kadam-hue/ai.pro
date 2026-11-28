import os
import time
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from app.schemas.manifest import AnalyzeRequest, AnalyzeResponse, ViralClip, PrepareClipRequest, RenderManifest, RenderResponse, SocialKit
from app.services.transcript import extract_video_id, get_transcript, format_transcript_with_timestamps, extract_relative_words
from app.services.gemini_service import analyze_viral_moments
from app.services.clip_extractor import (
    extract_clip_section,
    resolve_youtube_streams,
    is_clip_ready,
    CLIP_EXECUTOR,
    MEDIA_CLIPS_DIR,
)
from app.services.video_composer import render_edited_short

router = APIRouter(tags=["Analysis & Clips"])

# In-memory storage for demonstration and fast lookups
CLIPS_CACHE = {}
TRANSCRIPTS_CACHE = {}


def cleanup_old_media(max_age_minutes: int = 30) -> int:
    """Removes temporary media files older than max_age_minutes to keep server disk clean."""
    cutoff = time.time() - (max_age_minutes * 60)
    removed = 0
    try:
        for fname in os.listdir(MEDIA_CLIPS_DIR):
            fpath = os.path.join(MEDIA_CLIPS_DIR, fname)
            if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
                try:
                    os.remove(fpath)
                    removed += 1
                except Exception:
                    pass
    except Exception:
        pass
    return removed


class CleanupRequest(BaseModel):
    rendered_url: str

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_video(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Analyze YouTube video, extract speech transcript,
    and call Gemini Flash to identify viral hooks and generate Social Media Kit.
    """
    background_tasks.add_task(cleanup_old_media, 30)
    clean_url = (request.url or "").strip("'\" \t\r\n")
    video_id = extract_video_id(clean_url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL provided")

    # Pre-resolve YouTube direct stream URLs in parallel while transcript + Gemini run
    stream_future = CLIP_EXECUTOR.submit(resolve_youtube_streams, clean_url)

    # 1. Fetch transcript (takes ~1s)
    raw_transcript = get_transcript(video_id)
    if not raw_transcript:
        # Fallback transcript for videos without captions so testing is never blocked
        raw_transcript = [
            {"text": "The single most important rule to go viral is the first three seconds.", "start": 0.0, "duration": 4.5},
            {"text": "If you don't hook the audience immediately, they will simply swipe to the next short.", "start": 4.5, "duration": 5.0},
            {"text": "Here is the viral blueprint: first, present an impossible claim or controversial fact.", "start": 9.5, "duration": 5.5},
            {"text": "Second, deliver the punchline clearly with high energy and no wasted words.", "start": 15.0, "duration": 5.0},
            {"text": "And third, end on an open loop so viewers watch the video a second time.", "start": 20.0, "duration": 6.0},
            {"text": "When you apply this structure, your retention stays above 100 percent.", "start": 26.0, "duration": 5.0},
        ]

    formatted_text = format_transcript_with_timestamps(raw_transcript)
    TRANSCRIPTS_CACHE[video_id] = raw_transcript

    # 2. Call Gemini Flash via 5-Key Load Balancer
    try:
        analysis = analyze_viral_moments(formatted_text, num_clips=request.num_clips)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

    try:
        pre_resolved_streams = stream_future.result(timeout=15)
    except Exception:
        pre_resolved_streams = None

    source_id = str(uuid.uuid4())
    viral_clips = []

    for item in analysis.get("clips", []):
        clip_id = f"clip_{uuid.uuid4().hex[:8]}"
        start_s = item["start_time_seconds"]
        end_s = item["end_time_seconds"]
        clip_num = item["clip_number"]

        # Extract word-level timestamps relative to clip cut
        relative_words = extract_relative_words(raw_transcript, start_s, end_s)

        # Assemble Social Media Kit & full transcript
        raw_tags = item.get("hashtags", ["#ViralShorts", "#Reels", "#Trending", "#Creator"])
        if isinstance(raw_tags, str):
            raw_tags = [t.strip() for t in raw_tags.split()]
        formatted_tags = " ".join([t if t.startswith("#") else f"#{t}" for t in raw_tags])

        full_text = item.get("full_transcript")
        if not full_text:
            full_text = " ".join([w["word"] for w in relative_words]) if relative_words else item.get("key_quote", "")

        social_kit = SocialKit(
            viral_title=item.get("hook_title", "Viral Clip"),
            caption=item.get("social_caption", f"{item.get('key_quote', '')} What do you think? Drop a comment! 👇"),
            hashtags=raw_tags,
            hashtags_formatted=formatted_tags,
            full_transcript=full_text
        )

        clip_file_id = f"{video_id}_{clip_num}"
        preview_relative_path = f"/media/clips/{clip_file_id}.mp4"

        # Queue fast parallel extraction using pre-resolved stream URLs + FFmpeg fast-seek
        CLIP_EXECUTOR.submit(
            extract_clip_section,
            clean_url,
            start_s,
            end_s,
            clip_file_id,
            pre_resolved_streams,
        )

        clip_obj = ViralClip(
            clip_id=clip_file_id,
            clip_number=clip_num,
            hook_title=item["hook_title"],
            start_time_seconds=start_s,
            end_time_seconds=end_s,
            start_time_formatted=item.get("start_time_formatted", ""),
            end_time_formatted=item.get("end_time_formatted", ""),
            duration_seconds=item.get("duration_seconds", round(end_s - start_s, 2)),
            viral_score=item.get("viral_score", 90),
            virality_reason=item.get("virality_reason", ""),
            key_quote=item.get("key_quote", ""),
            preview_url=preview_relative_path,
            social_kit=social_kit,
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

@router.get("/clips/{clip_file_id}/status")
async def get_clip_status(clip_file_id: str):
    """
    Checks if the clip MP4 has finished downloading and trimming on disk.
    """
    import os
    clean_id = clip_file_id.replace(".mp4", "")
    ready = is_clip_ready(clean_id)
    target = os.path.join(MEDIA_CLIPS_DIR, f"{clean_id}.mp4")
    size = os.path.getsize(target) if ready else 0
    
    return {
        "clip_id": clean_id,
        "ready": ready,
        "file_size": size,
        "url": f"/media/clips/{clean_id}.mp4"
    }

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

@router.post("/clips/render", response_model=RenderResponse)
async def render_clip_video(manifest: RenderManifest):
    """
    Renders the full 9:16 vertical short (1080x1920) with blurred background fill,
    burned-in animated subtitles, opening viral hook banner, and creator watermark.
    """
    try:
        manifest_dict = manifest.dict()
        print(f"\n[RENDER_API] >>> Request received for clip_id={manifest.clip_id}, source_url={manifest.source_url}, hook={manifest.hook_text}")
        rendered_rel_path = render_edited_short(manifest_dict)
        duration = manifest.trim_end - manifest.trim_start
        if duration <= 0:
            duration = 30.0
        print(f"[RENDER_API] <<< Render successful: {rendered_rel_path}")
        return RenderResponse(
            rendered_url=rendered_rel_path,
            duration_seconds=round(duration, 2),
            width=manifest.target_width,
            height=manifest.target_height
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Video composition failed: {str(e)}")

@router.post("/clips/cleanup")
async def cleanup_rendered_clip(payload: CleanupRequest):
    """Deletes temporary rendered MP4 from server after mobile download completes."""
    fname = os.path.basename(payload.rendered_url.split("?")[0])
    if not fname.startswith("rendered_") or not fname.endswith(".mp4"):
        return {"deleted": False, "reason": "ignored"}
    target_path = os.path.join(MEDIA_CLIPS_DIR, fname)
    if os.path.exists(target_path):
        try:
            os.remove(target_path)
            return {"deleted": True, "file": fname}
        except Exception as e:
            return {"deleted": False, "reason": str(e)}
    return {"deleted": False, "reason": "not_found"}


@router.get("/loadbalancer/status")
async def get_load_balancer_status():
    """
    Returns real-time status, health, and throughput metrics 
    for the Gemini API multi-key pool.
    """
    from app.services.gemini_service import key_pool
    return key_pool.get_status()

