import json
import time
import threading
from typing import List, Dict, Any, Tuple, Optional
from google import genai
from google.genai import types
from app.core.config import settings

ACTIVE_MODELS = [
    "gemini-2.5-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash"
]

class GeminiKeyPool:
    """
    Thread-Safe, Dynamic Multi-Project Gemini API Key Load Balancer.
    - Round-Robin distribution across all configured project keys.
    - Automatic Circuit Breaker & 60s cooldown when a key hits 429 rate limit.
    - Zero-downtime failover to the next healthy key.
    - Dynamic key reloading so you can add or change keys anytime.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._current_index = 0
        self._key_stats: Dict[str, Dict[str, Any]] = {}
        self._clients: Dict[str, genai.Client] = {}
        self.refresh_keys()

    def _mask_key(self, key: str) -> str:
        if len(key) <= 12:
            return key[:4] + "..."
        return f"{key[:8]}...{key[-6:]}"

    def refresh_keys(self) -> List[str]:
        """Dynamically sync with settings so keys added in .env are active immediately."""
        with self._lock:
            active_keys = settings.GEMINI_API_KEYS
            for k in active_keys:
                masked = self._mask_key(k)
                if masked not in self._key_stats:
                    self._key_stats[masked] = {
                        "key_masked": masked,
                        "raw_key": k,
                        "total_requests": 0,
                        "total_errors": 0,
                        "status": "HEALTHY",
                        "cooldown_until": 0.0,
                        "last_used_timestamp": 0.0
                    }
                if k not in self._clients:
                    self._clients[k] = genai.Client(api_key=k)
            return active_keys

    def get_next_client(self) -> Tuple[genai.Client, str]:
        """
        Selects the next healthy key using round-robin.
        If all keys are in cooldown, picks the one closest to expiry.
        """
        self.refresh_keys()
        now = time.time()

        with self._lock:
            active_keys = settings.GEMINI_API_KEYS
            if not active_keys:
                raise RuntimeError("No GEMINI_API_KEYS configured in environment.")

            total = len(active_keys)
            # Try to find the next HEALTHY key starting from _current_index
            for _ in range(total):
                idx = self._current_index % total
                self._current_index = (self._current_index + 1) % total
                key = active_keys[idx]
                masked = self._mask_key(key)
                stat = self._key_stats[masked]

                # Check if cooldown has expired
                if stat["status"] == "COOLDOWN" and now >= stat["cooldown_until"]:
                    stat["status"] = "HEALTHY"
                    stat["cooldown_until"] = 0.0

                if stat["status"] == "HEALTHY":
                    stat["last_used_timestamp"] = now
                    return self._clients[key], masked

            # If all are in cooldown, pick the one expiring soonest
            best_key = active_keys[0]
            soonest_time = float("inf")
            for key in active_keys:
                masked = self._mask_key(key)
                stat = self._key_stats[masked]
                if stat["cooldown_until"] < soonest_time:
                    soonest_time = stat["cooldown_until"]
                    best_key = key

            best_masked = self._mask_key(best_key)
            self._key_stats[best_masked]["last_used_timestamp"] = now
            return self._clients[best_key], best_masked

    def report_success(self, masked_key: str):
        with self._lock:
            if masked_key in self._key_stats:
                self._key_stats[masked_key]["total_requests"] += 1
                self._key_stats[masked_key]["status"] = "HEALTHY"

    def report_rate_limit(self, masked_key: str, cooldown_seconds: int = 60):
        with self._lock:
            if masked_key in self._key_stats:
                self._key_stats[masked_key]["total_errors"] += 1
                self._key_stats[masked_key]["status"] = "COOLDOWN"
                self._key_stats[masked_key]["cooldown_until"] = time.time() + cooldown_seconds

    def get_status(self) -> Dict[str, Any]:
        """Provides monitoring stats for live dashboard."""
        self.refresh_keys()
        now = time.time()
        with self._lock:
            keys_info = []
            healthy_count = 0
            for masked, stat in self._key_stats.items():
                is_healthy = stat["status"] == "HEALTHY" or now >= stat["cooldown_until"]
                status_label = "HEALTHY" if is_healthy else "COOLDOWN"
                if is_healthy:
                    healthy_count += 1

                cooldown_remaining = max(0, int(stat["cooldown_until"] - now)) if stat["cooldown_until"] > now else 0
                keys_info.append({
                    "key_masked": masked,
                    "status": status_label,
                    "total_requests": stat["total_requests"],
                    "total_errors": stat["total_errors"],
                    "cooldown_remaining_seconds": cooldown_remaining
                })

            total_keys = len(keys_info)
            return {
                "load_balancer": "Gemini Multi-Project Key Pool",
                "total_keys": total_keys,
                "healthy_keys": healthy_count,
                "cooldown_keys": total_keys - healthy_count,
                "daily_request_capacity": total_keys * 1500,
                "minute_request_capacity": total_keys * 15,
                "keys": keys_info
            }

# Global singleton load balancer instance
key_pool = GeminiKeyPool()

def analyze_viral_moments(transcript_text: str, num_clips: int = 3) -> dict:
    """
    Analyzes speech transcript using the round-robin key pool.
    Automatically fails over across keys and models if rate-limited.
    """
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
      "key_quote": "The exact hook quote that grabs attention",
      "social_caption": "Engaging 2-sentence description for Instagram Reels / YouTube Shorts with a strong call-to-action",
      "hashtags": ["#ViralShorts", "#Reels", "#Trending", "#TopicTag1", "#TopicTag2"],
      "full_transcript": "The complete spoken text during this clip segment"
    }}
  ]
}}
"""
    active_keys = settings.GEMINI_API_KEYS
    max_key_attempts = max(1, len(active_keys))

    # Outer loop: Try keys in the load balancer pool
    for attempt in range(max_key_attempts):
        client, masked_key = key_pool.get_next_client()
        
        # Inner loop: Try active flash models on this key
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
                parsed = json.loads(response.text)
                key_pool.report_success(masked_key)
                return parsed

            except Exception as e:
                err_str = str(e).lower()
                # If Google returns 429 / resource exhausted / rate limit
                if "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str:
                    print(f"Key {masked_key} rate-limited on {model_name}. Marking cooldown and rotating to next key...")
                    key_pool.report_rate_limit(masked_key, cooldown_seconds=60)
                    break # Break out of inner model loop to try the next key immediately!
                else:
                    print(f"Model {model_name} on key {masked_key} error: {e}. Trying next model...")
                    continue

    raise RuntimeError("All Gemini API keys and models in the load balancer pool failed.")
