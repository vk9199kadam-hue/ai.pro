import os
import re
import time
import subprocess
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("video_composer")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MEDIA_CLIPS_DIR = os.path.join(BASE_DIR, "media", "clips")
VENV_BIN_DIR = os.path.join(os.path.dirname(BASE_DIR), ".venv", "bin")

os.makedirs(MEDIA_CLIPS_DIR, exist_ok=True)

FFMPEG_BIN = os.path.join(VENV_BIN_DIR, "ffmpeg")
if not os.path.exists(FFMPEG_BIN):
    FFMPEG_BIN = "ffmpeg"

EMOJI_PATTERN = re.compile(
    "[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]",
    flags=re.UNICODE
)

def clean_text_for_ass(text: Optional[str]) -> str:
    """Removes unsupported emoji glyphs and escapes special ASS characters."""
    if not text:
        return ""
    # Strip emojis to avoid missing glyph boxes in standard system fonts
    cleaned = EMOJI_PATTERN.sub("", text)
    # Remove control characters and escape ASS special chars
    cleaned = cleaned.replace("\\", "/").replace("{", "(").replace("}", ")").strip()
    return cleaned

def format_ass_time(seconds: float) -> str:
    """Formats float seconds into ASS timestamp H:MM:SS.cs (centiseconds)."""
    if seconds < 0:
        seconds = 0.0
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        secs += 1
        cs -= 100
    return f"{hrs:d}:{mins:02d}:{secs:02d}.{cs:02d}"

def get_watermark_style(position: str = "bottom_right") -> str:
    """Returns ASS style line for watermark position."""
    pos_map = {
        "bottom_right": (3, 40, 40, 240),
        "bottom_left": (1, 40, 40, 240),
        "top_right": (9, 40, 40, 180),
        "top_left": (7, 40, 40, 180),
    }
    align, ml, mr, mv = pos_map.get(position, (3, 40, 40, 240))
    return f"Style: Watermark, Arial, 36, &H80FFFFFF, &H000000FF, &H00000000, &H00000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 3, 1, {align}, {ml}, {mr}, {mv}, 1"

def generate_ass_subtitles(
    ass_path: str,
    words: List[Dict[str, Any]],
    hook_text: Optional[str],
    creator_tag: Optional[str],
    caption_style: str = "hype_yellow",
    clip_duration: float = 30.0,
    trim_start: float = 0.0,
    trim_end: Optional[float] = None,
    hook_enabled: bool = True,
    captions_enabled: bool = True,
    watermark_enabled: bool = True,
    watermark_position: str = "bottom_right"
) -> bool:
    """
    Generates a full ASS subtitle script calibrated for 1080x1920 (9:16 vertical short).
    Returns True if any dialogue events were written, False if empty.
    """
    effective_duration = (trim_end - trim_start) if (trim_end and trim_end > trim_start) else clip_duration

    primary_caption_color = "&H0000FFFF" if caption_style != "clean_white" else "&H00FFFFFF"

    ass_lines = [
        "[Script Info]",
        "Title: ClipSnap AI Render Engine",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # Hook: Top center (Alignment 8), 180px down, bold yellow/white with strong outline & drop shadow
        f"Style: Hook, Arial, 54, {primary_caption_color}, &H000000FF, &H00000000, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 6, 3, 8, 40, 40, 180, 1",
        # Captions: Bottom center (Alignment 2), 420px up from bottom, large readable bold text
        f"Style: CaptionText, Arial, 62, &H00FFFFFF, &H000000FF, &H00000000, &H80000000, 1, 0, 0, 0, 100, 100, 0, 0, 1, 6, 2, 2, 50, 50, 420, 1",
        # Watermark
        get_watermark_style(watermark_position),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]

    has_events = False

    # 1. Opening Hook Headline (0.00 to 3.50s)
    clean_hook = clean_text_for_ass(hook_text)
    if hook_enabled and clean_hook:
        hook_end = min(3.5, effective_duration)
        start_ts = format_ass_time(0.0)
        end_ts = format_ass_time(hook_end)
        ass_lines.append(f"Dialogue: 1,{start_ts},{end_ts},Hook,,0,0,0,,{clean_hook}")
        has_events = True

    # 2. Watermark / Creator Tag
    clean_tag = clean_text_for_ass(creator_tag) or "@ClipSnapAI"
    if watermark_enabled and clean_tag:
        start_tag = format_ass_time(0.0)
        end_tag = format_ass_time(effective_duration)
        ass_lines.append(f"Dialogue: 0,{start_tag},{end_tag},Watermark,,0,0,0,,{clean_tag}")
        has_events = True

    # 3. Timed Spoken Subtitles
    if captions_enabled and words:
        valid_words = []
        for w in words:
            raw_start = w.get("start", 0.0)
            raw_end = w.get("end", 0.0)
            w_text = clean_text_for_ass(w.get("word", ""))
            if not w_text:
                continue

            rel_start = max(0.0, raw_start - trim_start)
            rel_end = max(0.0, raw_end - trim_start)

            if rel_end > 0.0 and rel_start < effective_duration:
                valid_words.append({
                    "word": w_text,
                    "start": rel_start,
                    "end": min(rel_end, effective_duration)
                })

        # Group words into 3 to 4 word phrases for punchy viral short pacing
        chunk_size = 4
        for i in range(0, len(valid_words), chunk_size):
            chunk = valid_words[i:i + chunk_size]
            if not chunk:
                continue

            for active_idx, active_word in enumerate(chunk):
                w_start = format_ass_time(active_word["start"])
                w_end = format_ass_time(active_word["end"])
                if active_word["end"] <= active_word["start"]:
                    continue

                phrase_parts = []
                for j, item in enumerate(chunk):
                    if j == active_idx:
                        if caption_style == "clean_white":
                            phrase_parts.append(f"{{\\u1}}{item['word']}{{\\u0}}")
                        else:
                            phrase_parts.append(f"{{\\c&H0000FFFF&}}{item['word']}{{\\c&H00FFFFFF&}}")
                    else:
                        phrase_parts.append(item['word'])

                formatted_text = " ".join(phrase_parts)
                ass_lines.append(f"Dialogue: 0,{w_start},{w_end},CaptionText,,0,0,0,,{formatted_text}")
                has_events = True

    if has_events:
        content = "\n".join(ass_lines)
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(content)
        return True

    return False

def render_edited_short(manifest: Dict[str, Any]) -> str:
    """
    Renders the complete 9:16 vertical short using FFmpeg.
    Accurately maps the source video clip without ever using an incorrect fallback.
    """
    clip_id = str(manifest.get("clip_id", "clip_default")).replace(".mp4", "")
    source_url = manifest.get("source_url", "")
    trim_start = float(manifest.get("trim_start", 0.0))
    trim_end = float(manifest.get("trim_end", 0.0))
    layout = manifest.get("layout", "blurred_fill")
    caption_style = manifest.get("caption_style", "hype_yellow")
    captions_enabled = manifest.get("captions_enabled", True)
    creator_tag = manifest.get("creator_tag") or manifest.get("watermark_text")
    watermark_enabled = manifest.get("watermark_enabled", True)
    watermark_position = manifest.get("watermark_position", "bottom_right")
    hook_text = manifest.get("hook_text")
    hook_enabled = manifest.get("hook_enabled", True)
    words = manifest.get("words", [])

    print(f"[video_composer] Starting composition for clip_id='{clip_id}', source_url='{source_url}'")

    # 1. Resolve local source file path accurately
    local_source = None

    # Step A: Check if source_url contains an exact filename in media/clips/
    if "/media/clips/" in source_url:
        clip_filename = source_url.split("/media/clips/")[-1].split("?")[0]
        candidate = os.path.join(MEDIA_CLIPS_DIR, clip_filename)
        if os.path.exists(candidate) and os.path.getsize(candidate) > 10000:
            local_source = candidate

    # Step B: Check if clip_id directly names an existing file
    if not local_source:
        candidate = os.path.join(MEDIA_CLIPS_DIR, f"{clip_id}.mp4")
        if os.path.exists(candidate) and os.path.getsize(candidate) > 10000:
            local_source = candidate

    # Step C: Check if source_url is a direct file path on disk
    if not local_source and os.path.exists(source_url) and os.path.getsize(source_url) > 10000:
        local_source = source_url

    # Step D: Match by video ID / clip prefix
    if not local_source and clip_id and clip_id != "clip_default":
        clean_key = clip_id.replace("clip_", "")
        for fname in os.listdir(MEDIA_CLIPS_DIR):
            if fname.endswith(".mp4") and not fname.startswith("rendered_") and not fname.startswith("test_"):
                if clean_key in fname or clip_id in fname:
                    cand = os.path.join(MEDIA_CLIPS_DIR, fname)
                    if os.path.getsize(cand) > 10000:
                        local_source = cand
                        break

    if not local_source or not os.path.exists(local_source):
        available = [f for f in os.listdir(MEDIA_CLIPS_DIR) if f.endswith(".mp4")]
        raise FileNotFoundError(
            f"Source video clip for '{clip_id}' (URL: '{source_url}') not found in {MEDIA_CLIPS_DIR}. Available clips: {available}"
        )

    print(f"[video_composer] ✅ Resolved local source clip: {local_source} ({os.path.getsize(local_source)} bytes)")

    clean_file_id = os.path.basename(local_source).replace(".mp4", "")
    output_filename = f"rendered_{clean_file_id}_{int(time.time())}.mp4"
    output_path = os.path.join(MEDIA_CLIPS_DIR, output_filename)
    ass_path = os.path.join(MEDIA_CLIPS_DIR, f"subs_{clean_file_id}_{int(time.time())}.ass")

    duration = max(5.0, (trim_end - trim_start) if trim_end > trim_start else 30.0)

    # 2. Generate ASS Subtitle File
    has_subtitles = generate_ass_subtitles(
        ass_path=ass_path,
        words=words,
        hook_text=hook_text,
        creator_tag=creator_tag,
        caption_style=caption_style,
        clip_duration=duration,
        trim_start=trim_start,
        trim_end=trim_end if trim_end > trim_start else None,
        hook_enabled=hook_enabled,
        captions_enabled=captions_enabled,
        watermark_enabled=watermark_enabled,
        watermark_position=watermark_position
    )

    # 3. Construct Filter Complex
    if layout == "center_crop":
        base_v = (
            "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
            "crop=1080:1920[v_base]"
        )
    elif layout == "fit_black":
        base_v = (
            "color=c=black:s=1080x1920[bg];"
            "[0:v]scale=1080:-2[fg];"
            "[bg][fg]overlay=0:(1920-h)/2[v_base]"
        )
    else:
        # Default: blurred_fill (high-speed downscaled bokeh blur)
        base_v = (
            "[0:v]split=2[fg_in][bg_in];"
            "[bg_in]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=8:3,scale=1080:1920[bg];"
            "[fg_in]scale=1080:-2[fg];"
            "[bg][fg]overlay=0:(1920-h)/2[v_base]"
        )

    if has_subtitles and os.path.exists(ass_path):
        escaped_ass_path = ass_path.replace(":", "\\:").replace("'", "\\'")
        vf = f"{base_v};[v_base]subtitles='{escaped_ass_path}'[outv]"
    else:
        vf = f"{base_v};[v_base]null[outv]"

    # 4. Assemble FFmpeg command
    cmd = [
        FFMPEG_BIN, "-y"
    ]

    # Apply trim range if specified
    if trim_start > 0:
        cmd.extend(["-ss", str(trim_start)])
    if trim_end > trim_start:
        cmd.extend(["-to", str(trim_end)])

    cmd.extend([
        "-i", local_source,
        "-filter_complex", vf,
        "-map", "[outv]",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        output_path
    ])

    print(f"[video_composer] Rendering video: {' '.join(cmd[:12])} ... -> {output_filename}")
    start_t = time.time()
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)

    render_sec = round(time.time() - start_t, 2)

    # Clean up temporary ASS file
    if os.path.exists(ass_path):
        try:
            os.remove(ass_path)
        except Exception:
            pass

    if result.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) < 10000:
        stderr_msg = result.stderr.decode("utf-8", errors="ignore")
        print(f"[video_composer] ❌ Render failed: {stderr_msg[-400:]}")
        raise RuntimeError(f"FFmpeg rendering failed: {stderr_msg[-250:]}")

    print(f"[video_composer] ✅ Render finished successfully in {render_sec}s! Output: {output_path} ({os.path.getsize(output_path)} bytes)")
    return f"/media/clips/{output_filename}"
