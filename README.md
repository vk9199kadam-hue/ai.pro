# AI Viral Shorts SaaS (ai.pro)
> Transform long YouTube videos, podcasts, and streams into viral 9:16 vertical shorts (Reels, TikTok, YouTube Shorts) powered by Google Gemini Flash AI and Oracle Cloud Infrastructure.

---

## 🎯 Current Project Status (Verified on macOS)

- [x] **AI Viral Moment Detection (`viral_detector.py`)**:
  - Fetches timestamped transcripts from YouTube in **1 second** (0 bytes of video downloaded).
  - Uses **Gemini 3.5 Flash** to identify the top 3 viral moments with hook titles, quotes, exact start/end timestamps, and virality scores (1–100).
- [x] **9:16 Vertical Video Engine (`video_editor.py`)**:
  - Slices selected video clips using `yt-dlp`.
  - Implements the professional **"Blurred Background Fill"** layout (1080x1920 @ 30fps) using FFmpeg.
- [x] **Verified Pipeline Output**: Successfully generated and tested `output/final_vertical_reel.mp4`.
- [ ] **Animated Captions**: Word-by-word colorful subtitles (Bounce/Hype styles).
- [ ] **Backend REST API**: Node.js/Express server (`/analyze`, `/render`, `/credits`).
- [ ] **Oracle Database**: User accounts, credit ledger, and job queues.
- [ ] **Mobile App**: React Native (Expo) app for Google Play Store with AdMob monetization.

For complete architectural details, complexity management, and roadmap, see **[PROJECT_MASTER_DOCUMENTATION.md](PROJECT_MASTER_DOCUMENTATION.md)**.

---

## 💻 Quickstart Guide for Windows PC

When switching to your **Windows laptop**, follow these steps to run the project:

### 1. Prerequisites (Install once on Windows)
1. **Python 3.11 or 3.12**: Download from [python.org](https://www.python.org/downloads/) (Make sure to check *"Add Python to PATH"* during install).
2. **Git**: Download from [git-scm.com](https://git-scm.com/).
3. **FFmpeg for Windows**:
   - Open PowerShell as Administrator and run:
     ```powershell
     winget install -id Gyan.FFmpeg -e
     ```
   - Restart PowerShell so the PATH refreshes.

---

### 2. Clone and Setup Project on Windows

Open PowerShell or Command Prompt:

```powershell
# 1. Clone the repository
git clone https://github.com/vk9199kadam-hue/ai.pro.git
cd ai.pro

# 2. Create Python virtual environment
python -m venv .venv

# 3. Activate virtual environment
.\.venv\Scripts\activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create .env file with your Gemini API key
echo GEMINI_API_KEY=your_key_here > .env
```

---

### 3. Run the AI Viral Shorts Pipeline

```powershell
# Run the pipeline with any YouTube video
python pipeline.py "https://www.youtube.com/watch?v=UF8uR6Z6KLc"
```

The output vertical 9:16 Reel will be saved to the `output/` folder!

---

## 🚀 Repository Structure

```
ai.pro/
├── viral_detector.py             # Fetches transcript & calls Gemini AI for viral hooks
├── video_editor.py               # FFmpeg video slicer & 9:16 vertical reformatting
├── pipeline.py                   # End-to-end processing pipeline
├── requirements.txt              # Pinned Python dependencies
├── .env.example                  # Environment configuration template
├── .gitignore                    # Git ignore rules (prevents uploading .venv and keys)
├── README.md                     # Project overview & quickstart
└── PROJECT_MASTER_DOCUMENTATION.md # Complete architecture, complexity, & Play Store roadmap
```
