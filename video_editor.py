import os
import sys
import subprocess
import shutil

def get_ffmpeg_binary():
    """Find FFmpeg binary from system or imageio-ffmpeg."""
    which_ffmpeg = shutil.which("ffmpeg")
    if which_ffmpeg:
        return which_ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"

def download_clip_slice(video_url: str, start_sec: float, end_sec: float, raw_output_path: str):
    """Download only the exact segment using yt-dlp python module."""
    ffmpeg_bin = get_ffmpeg_binary()
    start_str = f"{int(start_sec//3600):02d}:{int((start_sec%3600)//60):02d}:{int(start_sec%60):02d}"
    end_str = f"{int(end_sec//3600):02d}:{int((end_sec%3600)//60):02d}:{int(end_sec%60):02d}"
    
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--cookies-from-browser", "chrome",
        "--ffmpeg-location", ffmpeg_bin,
        "--download-sections", f"*{start_str}-{end_str}",
        "--force-keyframes-at-cuts",
        "-f", "bestvideo+bestaudio/best",
        "-o", raw_output_path,
        video_url
    ]
    
    print(f"[1/2] Slicing segment ({start_str} to {end_str})...")
    subprocess.run(cmd, check=True)
    return raw_output_path

def convert_to_vertical_reel(input_video_path: str, output_reel_path: str, layout: str = "blurred_fill"):
    """
    Convert a horizontal (16:9) video to vertical (9:16, 1080x1920) for Shorts/Reels.
    layout options:
      - 'blurred_fill': Sharp video in center, stylish blurred video filling top & bottom (Best for podcasts).
      - 'crop': Zoomed in and cropped to center 9:16.
    """
    ffmpeg_bin = get_ffmpeg_binary()
    
    if layout == "blurred_fill":
        # Complex filter: scale background to fill 1080x1920 and blur it; scale foreground to fit; overlay in center
        filter_complex = (
            "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[bg];"
            "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];"
            "[bg][fg]overlay=(W-w)/2:(H-h)/2"
        )
        cmd = [
            ffmpeg_bin, "-y",
            "-i", input_video_path,
            "-filter_complex", filter_complex,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-c:a", "aac", "-b:a", "192k",
            output_reel_path
        ]
    else:
        # Simple center crop to 9:16
        cmd = [
            ffmpeg_bin, "-y",
            "-i", input_video_path,
            "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
            "-c:a", "aac", "-b:a", "192k",
            output_reel_path
        ]
        
    print(f"[2/2] Rendering 9:16 Vertical Reel with {layout} layout...")
    subprocess.run(cmd, check=True)
    print(f"🎉 Vertical Reel created successfully: {output_reel_path}")
    return output_reel_path
