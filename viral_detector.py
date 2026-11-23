import os
import re
import json
import subprocess
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi
from google import genai
from google.genai import types

# Load environment variables from script directory and current working directory
_script_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_script_dir, ".env"))
load_dotenv()

def get_api_key():
    return os.getenv("GEMINI_API_KEY")

def extract_video_id(url: str) -> str:
    """Extract YouTube Video ID from various URL formats."""
    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11}).*",
        r"youtu\.be\/([0-9A-Za-z_-]{11})",
        r"youtube\.com\/shorts\/([0-9A-Za-z_-]{11})"
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return url if len(url) == 11 else ""

def get_youtube_transcript(video_id: str):
    """Fetch timestamped transcript from YouTube."""
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id, languages=['en', 'en-US', 'hi', 'hi-Latn'])
        data = transcript.to_raw_data() if hasattr(transcript, 'to_raw_data') else list(transcript)
        return data
    except Exception as e:
        try:
            # Fallback: list all transcripts and fetch the first available
            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)
            transcript = next(iter(transcript_list))
            data = transcript.fetch()
            return data.to_raw_data() if hasattr(data, 'to_raw_data') else list(data)
        except Exception as err:
            print(f"Error fetching transcript: {err}")
            return None

def format_transcript_for_ai(transcript_data) -> str:
    """Format transcript with timestamps for AI consumption."""
    lines = []
    for item in transcript_data:
        start_sec = item['start']
        mins = int(start_sec // 60)
        secs = int(start_sec % 60)
        timestamp = f"[{mins:02d}:{secs:02d}]"
        text = item['text'].replace('\n', ' ')
        lines.append(f"{timestamp} {text}")
    return "\n".join(lines)

def detect_viral_moments(transcript_text: str, num_clips: int = 3):
    """Use Gemini Flash to find viral hooks and timestamps."""
    api_key = get_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in .env")

    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(api_version='v1beta'))
    
    prompt = f"""
You are a world-class AI viral content editor (like Opus Clip and Klap).
Your job is to analyze this YouTube video transcript and find the top {num_clips} most VIRAL moments suitable for YouTube Shorts, Instagram Reels, and TikTok.

VIRALITY CRITERIA:
1. Strong Hook: Starts with an intriguing question, bold claim, shocking statement, or hilarious comment in the first 3 seconds.
2. Complete Thought: Does not cut off mid-sentence; has a punchline, emotional climax, or clear conclusion.
3. Optimal Length: Each clip MUST be between 25 seconds and 60 seconds.
4. Viral Potential Score: Score from 1 to 100 based on humor, controversy, curiosity, or value.

Here is the timestamped transcript:
---
{transcript_text[:120000]}
---

Respond ONLY in valid JSON matching this schema:
{{
  "clips": [
    {{
      "clip_number": 1,
      "hook_title": "Catchy headline for the short",
      "start_time_seconds": 120.0,
      "end_time_seconds": 165.0,
      "start_time_formatted": "02:00",
      "end_time_formatted": "02:45",
      "duration_seconds": 45.0,
      "viral_score": 95,
      "virality_reason": "Why this moment will get high views/shares",
      "key_quote": "The exact hook quote that grabs attention"
    }}
  ]
}}
"""

    # Active model list with resilient fallbacks
    models_to_try = [
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.7-flash",
        "gemini-2.5-flash"
    ]

    last_error = None
    for model_name in models_to_try:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.3
                )
            )
            response_text = response.text
            return json.loads(response_text)
        except Exception as e:
            last_error = e
            print(f"Model {model_name} notice: {e}. Trying next fallback...")
            continue
    raise RuntimeError(f"All Gemini model attempts failed. Last error: {last_error}")

def slice_video_segment(video_url: str, start_sec: float, end_sec: float, output_path: str):
    """Download ONLY the specified seconds using yt-dlp (No full video download!)."""
    start_str = f"{int(start_sec//3600):02d}:{int((start_sec%3600)//60):02d}:{int(start_sec%60):02d}"
    end_str = f"{int(end_sec//3600):02d}:{int((end_sec%3600)//60):02d}:{int(end_sec%60):02d}"
    
    cmd = [
        "yt-dlp",
        "--download-sections", f"*{start_str}-{end_str}",
        "--force-keyframes-at-cuts",
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "-o", output_path,
        video_url
    ]
    
    print(f"Executing: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)
    print(f"Downloaded slice saved to: {output_path}")

if __name__ == "__main__":
    import sys
    test_url = sys.argv[1] if len(sys.argv) > 1 else "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    v_id = extract_video_id(test_url)
    print(f"Video ID: {v_id}")
    
    print("1. Fetching transcript...")
    raw_transcript = get_youtube_transcript(v_id)
    if not raw_transcript:
        print("Could not fetch transcript for this video.")
        sys.exit(1)
        
    formatted = format_transcript_for_ai(raw_transcript)
    print(f"Transcript fetched ({len(raw_transcript)} segments, {len(formatted)} characters).")
    
    print("2. Analyzing viral moments with Gemini Flash...")
    analysis = detect_viral_moments(formatted, num_clips=3)
    print("\n--- AI VIRAL CLIPS FOUND ---")
    print(json.dumps(analysis, indent=2))
