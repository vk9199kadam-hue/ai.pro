import json
from google import genai
from google.genai import types
from app.core.config import settings

ACTIVE_MODELS = [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash"
]

def analyze_viral_moments(transcript_text: str, num_clips: int = 3) -> dict:
    """Use Gemini Flash to find viral hooks and timestamps."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not found in environment")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    prompt = f"""
You are an expert AI viral short-form video editor (like Opus Clip and Klap).
Analyze this video transcript and identify the top {num_clips} most VIRAL moments suitable for YouTube Shorts, Instagram Reels, and TikTok.

VIRALITY CRITERIA:
1. 3-Second Hook: Starts with an intriguing question, bold claim, or shocking statement.
2. Complete Story/Punchline: Does not cut off mid-sentence; has a punchline, emotional climax, or clear conclusion.
3. Optimal Duration: Each clip MUST be strictly between 25 seconds and 60 seconds.
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

    for model_name in ACTIVE_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.3
                )
            )
            return json.loads(response.text)
        except Exception as e:
            print(f"Model {model_name} error: {e}. Trying fallback...")
            continue
            
    raise RuntimeError("All Gemini model attempts failed.")

