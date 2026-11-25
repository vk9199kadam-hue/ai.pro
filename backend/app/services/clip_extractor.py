import os
import subprocess
import logging
import concurrent.futures
from typing import Optional

logger = logging.getLogger("clip_extractor")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MEDIA_CLIPS_DIR = os.path.join(BASE_DIR, "media", "clips")
VENV_BIN_DIR = os.path.join(os.path.dirname(BASE_DIR), ".venv", "bin")

os.makedirs(MEDIA_CLIPS_DIR, exist_ok=True)

# Parallel thread pool for fast concurrent clip downloading
CLIP_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=3)

def format_timestamp(seconds: float) -> str:
    """Format seconds into HH:MM:SS for yt-dlp / ffmpeg."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hrs:02d}:{mins:02d}:{secs:02d}"

def is_clip_ready(clip_id: str) -> bool:
    """Check if the clip MP4 exists and has non-trivial size."""
    clean_id = clip_id.replace(".mp4", "")
    target = os.path.join(MEDIA_CLIPS_DIR, f"{clean_id}.mp4")
    return os.path.exists(target) and os.path.getsize(target) > 10000

def extract_clip_section(
    video_source: str, 
    start_sec: float, 
    end_sec: float, 
    clip_id: str
) -> Optional[str]:
    """
    Downloads or trims ONLY the requested section from a YouTube URL or local file.
    Returns the absolute path to the generated MP4 clip.
    """
    output_filename = f"{clip_id}.mp4"
    output_path = os.path.join(MEDIA_CLIPS_DIR, output_filename)

    # If already extracted, return cached file immediately
    if os.path.exists(output_path) and os.path.getsize(output_path) > 10000:
        print(f"[clip_extractor] Clip {clip_id} already cached ({os.path.getsize(output_path)} bytes)")
        return output_path

    start_fmt = format_timestamp(start_sec)
    end_fmt = format_timestamp(end_sec)
    section_arg = f"*{start_fmt}-{end_fmt}"

    # Set up environment with venv binaries in PATH so ffmpeg is discoverable
    env = os.environ.copy()
    if os.path.exists(VENV_BIN_DIR):
        env["PATH"] = f"{VENV_BIN_DIR}:{env.get('PATH', '')}"

    ytdlp_bin = os.path.join(VENV_BIN_DIR, "yt-dlp")
    if not os.path.exists(ytdlp_bin):
        ytdlp_bin = "yt-dlp"

    ffmpeg_bin = os.path.join(VENV_BIN_DIR, "ffmpeg")
    if not os.path.exists(ffmpeg_bin):
        ffmpeg_bin = "ffmpeg"

    # Temporary download path to ensure atomic write
    temp_output_path = os.path.join(MEDIA_CLIPS_DIR, f"temp_{output_filename}")
    if os.path.exists(temp_output_path):
        try:
            os.remove(temp_output_path)
        except Exception:
            pass

    # Case A: YouTube URL
    if "youtu" in video_source:
        cmd = [
            ytdlp_bin,
            "--ffmpeg-location", VENV_BIN_DIR,
            "--extractor-args", "youtube:player_client=android,web",
            "--download-sections", section_arg,
            "--force-keyframes-at-cuts",
            "-f", "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
            "-o", temp_output_path,
            video_source
        ]
    else:
        # Case B: Local video file or direct MP4 stream
        cmd = [
            ffmpeg_bin,
            "-y",
            "-ss", str(start_sec),
            "-to", str(end_sec),
            "-i", video_source,
            "-c:v", "libx264",
            "-crf", "24",
            "-c:a", "aac",
            temp_output_path
        ]

    try:
        print(f"[clip_extractor] Starting download of section {section_arg} for clip {clip_id}...")
        result = subprocess.run(
            cmd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=90
        )
        if result.returncode == 0 and os.path.exists(temp_output_path) and os.path.getsize(temp_output_path) > 5000:
            # Atomically rename to final path so reader never sees partial file
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
