# Master Project Documentation & Windows Roadmap: AI Viral Shorts SaaS

---

## 1. Executive Summary & Vision

This project is an **AI-powered Video Slicing SaaS** designed for creators to publish viral short-form clips on **YouTube Shorts, Instagram Reels, and TikTok**. 

- **Target Deployment:** Android Mobile App on **Google Play Store**.
- **Backend & Database:** **Oracle Cloud Infrastructure (OCI)**.
- **AI Engine:** **Google Gemini 3.5 Flash** (Free Cloud Tier: 1,500 requests/day).
- **Video Engine:** Standalone **FFmpeg 7.1** with **Blurred Background 9:16 layout**.
- **Monetization Model:** **Hybrid Freemium** (Google AdMob Banner + Rewarded Ads for free daily credits + Pro In-App Subscription).

---

## 2. Current State (What is Completed & Verified)

### Core Engines Built and Tested:
1. **`viral_detector.py`**:
   - Takes a YouTube link.
   - Fetches timestamped subtitles/transcript in **~1 second** (0 bytes of video downloaded).
   - Calls **Gemini 3.5 Flash** to identify the top 3 viral moments based on:
     - The 3-second attention hook.
     - Complete thought and punchline payoff.
     - Optimal short-form duration (25–60 seconds).
     - Virality score (1–100) and virality explanation.
2. **`video_editor.py`**:
   - Slices the selected time range.
   - Uses FFmpeg complex filter graphs to convert landscape (16:9) video into portrait (9:16, 1080x1920) with a stylish blurred background fill.
3. **`pipeline.py`**:
   - Orchestrates the full process from link to ready-to-publish MP4 in `output/`.

---

## 3. Switching to Windows: Setup & Development Guide

Follow this guide to continue development on your **Windows laptop**:

### Step 1: Install Required Tools on Windows
Open Windows PowerShell (Run as Administrator):
```powershell
# Install Git and Python 3.11
winget install -id Git.Git -e
winget install -id Python.Python.3.11 -e
winget install -id Gyan.FFmpeg -e
```
*Close and re-open PowerShell after installation so PATH is refreshed.*

### Step 2: Clone & Activate Environment
```powershell
git clone https://github.com/vk9199kadam-hue/ai.pro.git
cd ai.pro
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### Step 3: Configure `.env`
Create a `.env` file in the project folder with your Gemini API Key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### Step 4: Verify on Windows
```powershell
python pipeline.py "https://www.youtube.com/watch?v=UF8uR6Z6KLc"
```
Check `output/` folder for your generated 9:16 vertical reel!

---

## 4. How Technical Complexity Is Managed

### 1. Bandwidth & Storage Optimization (The "Zero Full-Download" Rule)
- Downloading 2-hour videos (2–4 GB) crashes servers and exhausts disk space.
- **Solution:** We fetch only a **15 KB text transcript** first. After the AI picks the viral moments, we download **only the selected 30–45 second slice (~15 MB)**. Bandwidth is reduced by **98%**.

### 2. YouTube Throttling & 403 Forbidden Protection
- YouTube sometimes blocks automated downloading of certain videos with SABR stream restrictions.
- **Solution:** In our mobile app, we support **Dual Input**:
  - **Mode 1 (Link Mode):** For YouTube, Twitch, and Kick links.
  - **Mode 2 (Direct MP4 Upload):** Mobile users can pick any video file directly from their phone gallery. This works 100% reliably with zero stream blocks.

### 3. Oracle Cloud 1 GB RAM Server Sizing
- A 1 OCPU / 1 GB RAM instance (`instance-20261104-1110`) cannot run local LLMs (OOM crash).
- **Solution:** The Oracle server acts as the **API Controller & Database** (using only ~60 MB RAM). The heavy AI runs on **Gemini 3.5 Flash** (0 MB RAM on your server).

---

## 5. Remaining Development Roadmap (End-to-End Plan)

### Phase 1: Dynamic Animated Captions (Subtitles)
- Add word-level animated subtitles (Bounce / Hype style) using ASS subtitle filters.
- Highlight the spoken word in bright yellow/green synced to audio.

### Phase 2: Backend REST API (Node.js/Express)
- Build `server.js` exposing REST endpoints:
  - `POST /api/analyze-link` -> Returns viral moments in 3 seconds.
  - `POST /api/render-clip` -> Slices, converts to 9:16, burns subtitles, and returns MP4 URL.
  - `GET /api/user-credits` -> Checks user credit balance.
  - `POST /api/claim-ad-reward` -> Adds +1 free clip credit when a rewarded ad is completed.

### Phase 3: Oracle Database Integration
- Create tables in your Oracle Database:
  - `app_users`: User ID, email, credit balance.
  - `video_jobs`: Job ID, source URL, status (QUEUED, RENDERING, DONE).
  - `extracted_clips`: Clip ID, timestamps, virality score, download URL.
  - `monetization_logs`: AdMob rewarded events and subscription payments.

### Phase 4: React Native Android Mobile App (Expo)
- **Screen 1 (Home):** Paste link or upload video, choose caption style.
- **Screen 2 (Viral Moments Carousel):** Displays cards for each clip with virality score (e.g. 98/100), hook title, and quick preview.
- **Screen 3 (Player & Export):** Fullscreen vertical player with 1-tap "Save to Gallery" and "Share to Instagram/Shorts".
- **Monetization Integration:**
  - Banner Ad docked at bottom of dashboard.
  - Interstitial Ad during video rendering.
  - Rewarded Video Ad when daily free credits are exhausted.

### Phase 5: Google Play Store Publishing
- Create app icon (512x512) and feature graphic (1024x500).
- Build production Android App Bundle:
  ```bash
  eas build --platform android
  ```
- Upload `.aab` to Google Play Console and submit for review!
