import os
import subprocess
import logging
import concurrent.futures
from typing import Optional, Tuple

logger = logging.getLogger("clip_extractor")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MEDIA_CLIPS_DIR = os.path.join(BASE_DIR, "media", "clips")
VENV_BIN_DIR = os.path.join(os.path.dirname(BASE_DIR), ".venv", "bin")

os.makedirs(MEDIA_CLIPS_DIR, exist_ok=True)

# 5 concurrent workers so all 1-5 clips extract simultaneously without queuing
CLIP_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=5)


def format_timestamp(seconds: float) -> str:
    """Format seconds into HH:MM:SS for yt-dlp."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hrs:02d}:{mins:02d}:{secs:02d}"


def is_clip_ready(clip_id: str) -> bool:
    """Check if the clip MP4 exists and has non-trivial size."""
    clean_id = clip_id.replace(".mp4", "")
    target = os.path.join(MEDIA_CLIPS_DIR, f"{clean_id}.mp4")
    return os.path.exists(target) and os.path.getsize(target) > 10000


def _get_bin(name: str) -> str:
    candidate = os.path.join(VENV_BIN_DIR, name)
    return candidate if os.path.exists(candidate) else name


def _build_env() -> dict:
    env = os.environ.copy()
    if os.path.exists(VENV_BIN_DIR):
        env["PATH"] = f"{VENV_BIN_DIR}:{env.get('PATH', '')}"
    return env


def resolve_youtube_streams(video_url: str) -> Optional[Tuple[str, Optional[str]]]:
    """
    Resolves direct 720p-max YouTube stream URL(s) ONCE per analyze request.
    Returns (video_url, audio_url_or_None).
    """
    ytdlp_bin = _get_bin("yt-dlp")
    cmd = [
        ytdlp_bin,
        "--no-playlist",
        "--no-warnings",
        "-g",
        "--extractor-args", "youtube:player_client=android,web",
        "-f", "best[height<=720][ext=mp4]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]",
        video_url,
    ]
    try:
        res = subprocess.run(
            cmd,
            env=_build_env(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=20,
        )
        if res.returncode == 0:
            urls = [line.strip() for line in res.stdout.decode("utf-8", errors="ignore").splitlines() if line.strip().startswith("http")]
            if len(urls) >= 2:
                print(f"[clip_extractor] ✅ Resolved separate video+audio 720p streams once")
                return (urls[0], urls[1])
            elif len(urls) == 1:
                print(f"[clip_extractor] ✅ Resolved muxed 720p stream once")
                return (urls[0], None)
    except Exception as e:
        print(f"[clip_extractor] ⚠️ Stream pre-resolve notice: {e}")
    return None


def extract_clip_section(
    video_source: str,
    start_sec: float,
    end_sec: float,
    clip_id: str,
    pre_resolved_streams: Optional[Tuple[str, Optional[str]]] = None,
) -> Optional[str]:
    """
    Fast-extracts ONLY the requested section from a YouTube URL.
    Uses pre-resolved stream URLs + FFmpeg input seeking (-ss before -i) + stream copy (-c copy)
    for 3x-5x faster loading, with automatic yt-dlp fallback.
    """
    output_filename = f"{clip_id}.mp4"
    output_path = os.path.join(MEDIA_CLIPS_DIR, output_filename)

    if os.path.exists(output_path) and os.path.getsize(output_path) > 10000:
        print(f"[clip_extractor] Clip {clip_id} already cached ({os.path.getsize(output_path)} bytes)")
        return output_path

    temp_output_path = os.path.join(MEDIA_CLIPS_DIR, f"temp_{output_filename}")
    if os.path.exists(temp_output_path):
        try:
            os.remove(temp_output_path)
        except Exception:
            pass

    env = _build_env()
    ffmpeg_bin = _get_bin("ffmpeg")
    ytdlp_bin = _get_bin("yt-dlp")
    duration = max(1.0, end_sec - start_sec)

    # Fast Path: Direct FFmpeg input-seek + stream copy using pre-resolved stream URL
    if pre_resolved_streams:
        v_url, a_url = pre_resolved_streams
        if a_url:
            fast_cmd = [
                ffmpeg_bin, "-y",
                "-ss", str(start_sec), "-t", str(duration), "-i", v_url,
                "-ss", str(start_sec), "-t", str(duration), "-i", a_url,
                "-c", "copy", "-movflags", "+faststart",
                temp_output_path,
            ]
        else:
            fast_cmd = [
                ffmpeg_bin, "-y",
                "-ss", str(start_sec), "-t", str(duration), "-i", v_url,
                "-c", "copy", "-movflags", "+faststart",
                temp_output_path,
            ]
        try:
            print(f"[clip_extractor] ⚡ Fast-seeking clip {clip_id} ({start_sec}s -> {end_sec}s)...")
            res = subprocess.run(fast_cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
            if res.returncode == 0 and os.path.exists(temp_output_path) and os.path.getsize(temp_output_path) > 10000:
                os.replace(temp_output_path, output_path)
                print(f"[clip_extractor] ✅ Fast-seek clip ready: {output_path} ({os.path.getsize(output_path)} bytes)")
                return output_path
        except Exception as e:
            print(f"[clip_extractor] ⚠️ Fast-seek fallback for {clip_id}: {e}")

    # Fallback Path: yt-dlp section download (720p cap, no slow keyframe re-encode)
    section_arg = f"*{format_timestamp(start_sec)}-{format_timestamp(end_sec)}"
    fallback_cmd = [
        ytdlp_bin,
        "--no-playlist",
        "--ffmpeg-location", VENV_BIN_DIR,
        "--extractor-args", "youtube:player_client=android,web",
        "--download-sections", section_arg,
        "-f", "best[height<=720][ext=mp4]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]",
        "-o", temp_output_path,
        video_source,
    ]
    try:
        print(f"[clip_extractor] Downloading section {section_arg} for clip {clip_id}...")
        result = subprocess.run(fallback_cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
        if result.returncode == 0 and os.path.exists(temp_output_path) and os.path.getsize(temp_output_path) > 5000:
            os.replace(temp_output_path, output_path)
            print(f"[clip_extractor] ✅ Clip extracted successfully: {output_path} ({os.path.getsize(output_path)} bytes)")
            return output_path
        else:
            stderr_msg = result.stderr.decode("utf-8", errors="ignore")
            print(f"[clip_extractor] ⚠️ Extraction failed with code {result.returncode}: {stderr_msg[:300]}")
            return None
    except Exception as e:
        print(f"[clip_extractor] ❌ Error during extraction of {clip_id}: {str(e)}")
        return None
