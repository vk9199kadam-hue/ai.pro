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
    
    # Try direct download first; fallback to cookies only if needed
    base_cmd = [
        sys.executable, "-m", "yt_dlp",
        "--ffmpeg-location", ffmpeg_bin,
        "--download-sections", f"*{start_str}-{end_str}",
        "--force-keyframes-at-cuts",
        "--merge-output-format", "mp4",
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
        "-o", raw_output_path,
        video_url
    ]
    
    print(f"[1/2] Slicing segment ({start_str} to {end_str})...")
    try:
        subprocess.run(base_cmd, check=True)
    except subprocess.CalledProcessError:
        print("Direct slice download failed, trying with Chrome cookies fallback...")
        cookie_cmd = base_cmd[:2] + ["--cookies-from-browser", "chrome"] + base_cmd[2:]
        subprocess.run(cookie_cmd, check=True)
        
    # Resolve actual output file if yt-dlp used another extension (e.g. .webm)
    if os.path.exists(raw_output_path):
        return raw_output_path
        
    parent = os.path.dirname(raw_output_path) or "."
    base_name = os.path.splitext(os.path.basename(raw_output_path))[0]
    for fname in os.listdir(parent):
        if fname.startswith(base_name) and not fname.endswith(".part"):
            actual_path = os.path.join(parent, fname)
            print(f"Located downloaded slice at: {actual_path}")
            return actual_path
            
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
