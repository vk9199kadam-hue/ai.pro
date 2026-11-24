import re
from youtube_transcript_api import YouTubeTranscriptApi
from typing import List, Dict, Any, Optional

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

def get_transcript(video_id: str) -> Optional[List[Dict[str, Any]]]:
    """Fetch timestamped transcript from YouTube."""
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id, languages=['en', 'en-US', 'hi', 'hi-Latn'])
        data = transcript.to_raw_data() if hasattr(transcript, 'to_raw_data') else list(transcript)
        return data
    except Exception:
        try:
            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)
            transcript = next(iter(transcript_list))
            data = transcript.fetch()
            return data.to_raw_data() if hasattr(data, 'to_raw_data') else list(data)
        except Exception:
            return None

def format_transcript_with_timestamps(raw_data: List[Dict[str, Any]]) -> str:
    """Format transcript lines for Gemini context."""
    lines = []
    for item in raw_data:
        start_sec = item['start']
        mins = int(start_sec // 60)
        secs = int(start_sec % 60)
        timestamp = f"[{mins:02d}:{secs:02d}]"
        text = item['text'].replace('\n', ' ')
        lines.append(f"{timestamp} {text}")
    return "\n".join(lines)

def extract_relative_words(raw_data: List[Dict[str, Any]], start_sec: float, end_sec: float) -> List[Dict[str, Any]]:
    """
    Extract words spoken between start_sec and end_sec, 
    normalizing timestamps relative to clip start: t_local = t_spoken - start_sec.
    """
    clip_words = []
    for item in raw_data:
        item_start = item['start']
        item_duration = item.get('duration', 2.0)
        item_end = item_start + item_duration
        
        # Check if item overlaps with clip range
        if item_end >= start_sec and item_start <= end_sec:
            words = item['text'].split()
            if not words:
                continue
            word_duration = item_duration / len(words)
            for idx, word in enumerate(words):
                w_start = item_start + (idx * word_duration)
                w_end = w_start + word_duration
                
                # Normalize relative to clip cut
                rel_start = max(0.0, round(w_start - start_sec, 2))
                rel_end = round(w_end - start_sec, 2)
                
                if rel_start <= (end_sec - start_sec):
                    clip_words.append({
                        "word": word,
                        "start": rel_start,
                        "end": rel_end,
                        "highlight": True
                    })
    return clip_words

