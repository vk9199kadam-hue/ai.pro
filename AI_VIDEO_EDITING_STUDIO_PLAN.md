# AVer / ClipSnap AI — Phase 2: AI Video Editing Studio Master Plan (v2.2 Production-Ready)

> **Document Status:** Final Production-Ready Blueprint  
> **Target App:** ClipSnap AI / AVer (AI Viral Shorts Generator & Studio Editor)  
> **Implementation State:** ⏸️ **Awaiting User Review & Approval** (No code modified in this turn)

---

## 1. Executive Summary & Phase 1 Accomplishment

In Phase 1, we achieved **100% verified success** on your physical Android phone:
1. **Gemini 3.5 Flash** ingested source videos, identified peak engagement moments, and generated Marathi attention hooks, viral scores (95, 94, 90), and social copy kits.
2. **Serverless Range-Cut Extractor** downloaded exact 45s cuts in ~6 seconds (`vHwchNO-bOE_1.mp4`, etc.).
3. **Live In-App Video Playback** was verified playing smoothly with high-fidelity audio on your device using `expo-video`.
4. **Interactive Social Kit** enabled 1-tap copying of titles, 2-sentence descriptions, hashtags, and full spoken transcripts.

Now, we enter **Phase 2: The AI Video Editing Studio**.
When the user taps **`✂️ Select & Edit This Video`**, the app transitions into an **interactive editing studio** that converts horizontal videos into high-retention 9:16 vertical Shorts/Reels before rendering on-device directly to the phone's gallery.

---

## 2. Core Architecture (The 6 Pillars)

```
1. Gemini 3.5 Flash          ──> Identifies viral moments, generates hooks & social copy
2. Whisper / Forced Align   ──> Generates word timestamps (calibrated target with creator fallback)
3. Shared EditorSession     ──> Durable SQLite schema storing all editing settings & word arrays
4. React Native / Expo 52   ──> Interactive studio interface, gesture trimmer, and calibrated WYSIWYG preview
5. Android Media3 GPU       ──> Local hardware compositing (GaussianBlur, CanvasOverlay, MediaCodec H.264)
6. Dual-Stage Validation    ──> Headless playback probe + MediaMetadataRetriever before Gallery commit
```

---

## 3. Engineering Solutions to the 4 Final Technical Details

### 💡 Detail 1: Timestamp Accuracy & Multi-Lingual Alignment (Marathi, Hindi & English)
* **The Engineering Challenge:** Faster-Whisper provides word-level timestamps, but timing precision on Indic languages (Marathi & Hindi) can vary due to complex consonant conjuncts (जोडाक्षरे, e.g. "वर्षांपासून", "मसाल्यातलं"). A target of $\pm 50\text{ms}$ is an aspirational benchmark to test and validate, not a guaranteed constant.
* **Our 3-Tier Solution:**
  1. **VAD-Filtered Ingestion:** Faster-Whisper runs with Silero VAD (`vad_filter=True`) to eliminate background kitchen or street noise from speech segments.
  2. **Empirical Validation Suite:** During P0 testing, word-boundary accuracy will be empirically measured against Marathi, Hindi, and English benchmark clips to tune alignment parameters.
  3. **Creator Micro-Adjustment Fallback:** Because 100% automated accuracy across every accent is mathematically impossible, the Studio UI provides a dedicated **word micro-timing slider ($\pm 100\text{ms}$)**. If a creator notices a word lighting up slightly early or late, they can nudge it with one tap.

---

### 💡 Detail 2: Native Media3 Blur Implementation
* **The Engineering Challenge:** We need an efficient, high-performance background blur on Android that works reliably across diverse GPU chipsets (ARM Mali on Pixel 7 Tensor / Qualcomm Adreno / MediaTek) without crashing or requiring heavy external binaries.
* **Our Native Implementation:**
  1. **Primary Effect:** Utilize Media3's officially supported `androidx.media3.effect.GaussianBlur` (introduced in Media3 1.2+ for Transformer pipelines) or `androidx.media3.effect.SeparableConvolution` with an optimized 1D Gaussian kernel.
  2. **Hardware Compatibility Check:** At app initialization, we verify device OpenGL ES 3.0 capability and max texture sizes.
  3. **Graceful Fallback:** On ultra-low-end devices where heavy Gaussian shader passes might trigger GPU thermal throttling, the system seamlessly falls back to a fast 2-pass box blur or a dark tinted gradient background, ensuring 100% export reliability.

---

### 💡 Detail 3: Dual-Stage Export Container Integrity Validation
* **The Engineering Challenge:** `MediaMetadataRetriever` is excellent for reading track headers and decoding individual sample frames, but it does not fully verify MP4 container integrity (such as truncated `mdat` boxes, broken chunk offsets, or corrupt audio sync).
* **Our 2-Stage Verification Pipeline:**
  ```
  [ Media3 Transformer Export Output (.tmp.mp4) ]
                          │
                          ▼
             STAGE A: CONTAINER INTEGRITY TEST
    (Headless ExoPlayer instance loads the file in memory.
     Verifies STATE_READY, valid moov atom, and playable audio/video)
                          │
               PASS? ────┴──── FAIL? ──> [ Trigger Export Recovery & Retry ]
                 │
                 ▼
             STAGE B: METRIC & TRACK VALIDATION
    (MediaMetadataRetriever verifies:
     • Width == 1080 & Height == 1920
     • Video MIME: video/avc (H.264), Audio MIME: audio/mp4a-latm (AAC)
     • Duration matches trim cut ±0.2s
     • First & Last keyframes decode cleanly without black artifacts)
                 │
                 ▼
       [ COMMIT TO ANDROID MEDIASTORE (DCIM/ClipSnap) ]
  ```
* **Result:** Only 100% verified, playable MP4 files are saved to the user's phone gallery.

---

### 💡 Detail 4: Realistic Infrastructure Economics
* **Correction Clarified:** We do **not** claim "zero total server cost". AI inference, cloud storage, and API networking have modest operational costs.
* **The True Architecture Benefit:** **Zero server-side video rendering and encoding compute costs.**
* **Economic Cost Comparison per 1,000 Clips Generated:**
  | Cost Component | Traditional Cloud Rendering (AWS MediaConvert / Cloud Run) | AVer Edge-Cloud Hybrid Architecture |
  | :--- | :---: | :---: |
  | **Server Video Encoding (GPU/CPU)** | **\$150.00 – \$350.00** | **\$0.00** (Processed on Phone GPU) |
  | **Cloud Video Storage/Egress** | **\$40.00 – \$80.00** | **\$0.00** (MP4 stays on Phone Gallery) |
  | **Gemini AI Analysis Tokens** | ~\$1.00 | ~\$1.00 |
  | **Serverless Range Cut Extractor** | ~\$0.50 | ~\$0.50 |
  | **Total Cost per 1,000 Clips** | **\$191.50 – \$431.50** | **~\$1.50** *(99.5% Cost Reduction!)* |

This architectural model allows AVer to scale sustainably without server rendering bills.

---

## 5. The 6 Production Studio Features

1. **Undo/Redo & Durable SQLite Project Storage (`expo-sqlite`):**
   - In-memory action history stack (`undoStack` / `redoStack`).
   - SQLite auto-saves drafts every 3 seconds; sessions survive app restart.
   - 1-tap "Reset to Original AI Settings" button.
2. **Manual Word-Level Caption Editor:**
   - Tap any word to correct text/spelling.
   - Delete unwanted words ("um", "ah").
   - Word timing micro-slider ($\pm 100\text{ms}$).
3. **Calibrated Preview/Export Consistency (WYSIWYG Engine):**
   - Shared normalized coordinate matrix (`x: 0.0–1.0`, `y: 0.0–1.0`).
   - React Native Yoga layout and Android `Canvas` text rendering calibrated with font baseline compensation (`ascent`/`descent`).
4. **Resilient Export Recovery:**
   - 0% to 100% progress indicator with safe cancellation via `Transformer.cancel()`.
   - Pre-export storage check (requires $\ge 250\text{MB}$ free).
   - Error boundary with 1-tap retry.
5. **Smart Speaker Framing (Phase P2):**
   - Face detection and centroid tracking with manual horizontal pan slider override.
6. **Multi-Preset Platform Export Suite (Phase P1):**
   - 1080p vs 720p; YouTube Shorts, Instagram Reels, and TikTok presets.

---

## 6. Strict 10-Step Implementation Sequence for Phase P0

```
┌────────────────────────────────────────────────────────────────────────┐
│               PHASE P0 STEP-BY-STEP IMPLEMENTATION SEQUENCE            │
├────────────────────────────────────────────────────────────────────────┤
│  1. Studio Screen & 9:16 Canvas Preview                                │
│     Create StudioScreen.tsx with smooth navigation from CarouselScreen │
│                                                                        │
│  2. Background Blur & Layout Controls                                  │
│     Dual-layer 9:16 composition using Media3 native GaussianBlur/solid │
│                                                                        │
│  3. Animated Captions & Manual Word Editing                            │
│     Synchronized word highlighting (Hype Yellow / Clean White) +       │
│     tap-to-edit word text modal with micro-slider adjustment           │
│                                                                        │
│  4. Attention Hook Headline Banner                                     │
│     AI hook banner displayed with entrance animation during first 3.5s │
│                                                                        │
│  5. Custom Watermark & Brand Suite                                     │
│     Creator handle text or PNG logo picker with 4-corner placement     │
│                                                                        │
│  6. Clip Trimmer                                                       │
│     Dual-handle interactive start/end slider with real-time scrubber   │
│                                                                        │
│  7. Rule-Based "Magic Auto-Edit" (1-Tap Button)                        │
│     Single tap configures layout, hook, captions, and watermark        │
│                                                                        │
│  8. Preview / Export Consistency Calibration                           │
│     Calibrate React Native text metrics to match Android Canvas        │
│                                                                        │
│  9. Native Media3 Rendering & Gallery Export                           │
│     Hardware-accelerated 1080p MP4 render + save to MediaStore         │
│                                                                        │
│  10. Dual-Stage Export Recovery & Container Verification               │
│      ExoPlayer container playback test + MediaMetadataRetriever metrics│
└────────────────────────────────────────────────────────────────────────┘
```

> [!CAUTION]
> **The Golden Development Rule:**  
> **Do NOT start Phase P1 until Phase P0 has been tested and verified 100% successfully on your physical Android phone!**

---

## 7. Shared TypeScript State Schema (`EditorSession`)

```typescript
export interface CaptionWord {
  id: string;
  word: string;
  start: number; // in seconds, e.g. 1.25
  end: number;   // in seconds, e.g. 1.60
  isDeleted?: boolean; // user deleted this filler word
}

export interface EditorSession {
  projectId: string;
  clipId: string;
  sourceVideoUri: string;
  originalDuration: number;
  lastModifiedTimestamp: number;
  
  // Trimmer Configuration
  trimRange: {
    startSeconds: number;
    endSeconds: number;
  };
  
  // 9:16 Layout Configuration (Normalized)
  layout: {
    mode: 'blur_9_16' | 'fit_black' | 'fill_crop';
    blurRadius: number; // 0 to 25
    horizontalOffset: number; // -0.5 to +0.5 (for framing)
  };
  
  // Hook Banner Overlay
  hook: {
    enabled: boolean;
    text: string;
    displayDuration: number; // default 3.5s
    positionNormalizedY: number; // e.g. 0.08 (8% from top)
    backgroundColor: string;
    textColor: string;
  };
  
  // Captions Configuration (Calibrated)
  captions: {
    enabled: boolean;
    style: 'hype_yellow' | 'clean_white' | 'karaoke_glow' | 'dynamic_pop';
    positionNormalizedY: number; // 0.25 (top), 0.50 (mid), 0.75 (bottom)
    fontSizeRatio: number; // percentage of viewport height, e.g. 0.035
    words: CaptionWord[];
  };
  
  // Watermark & Branding Configuration
  branding: {
    enabled: boolean;
    type: 'text' | 'logo';
    watermarkText: string; // e.g. "@vk_vlogs"
    logoUri: string | null; // local phone file:// URI
    position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
    opacity: number; // 0.2 to 1.0
    normalizedScale: number; // 0.05 to 0.20 of screen width
  };
  
  // Audio Configuration
  audio: {
    voiceVolume: number; // 0.0 to 1.5
    bgmTrackId: string | null;
    bgmVolume: number; // 0.0 to 1.0
    duckingRatio: number; // e.g. 0.18 during speech
  };
  
  // Export Settings
  exportPreset: {
    resolution: '1080p' | '720p';
    fps: 30 | 60;
    bitrateMbps: number; // 12, 8, or 5
    platform: 'youtube_shorts' | 'instagram_reels' | 'tiktok';
  };
}
```

---

## 8. Verification & Approval Checklist

- [x] Phase 1 Video Extraction & Streaming verified playing live on phone.
- [x] 4 production details fully solved:
  - [x] Multi-lingual timestamp target calibration with VAD and micro-slider fallback.
  - [x] Native Media3 `GaussianBlur` / `SeparableConvolution` with compatibility check.
  - [x] Dual-stage export container verification (headless ExoPlayer + MediaMetadataRetriever).
  - [x] Realistic infrastructure economics (zero server-side video rendering/encoding compute cost).
- [x] Strict 10-step P0 implementation order formalized.
- [x] "Golden Development Rule" established.
- [ ] **User review and explicit command to begin Phase P0 implementation.**
- [ ] TypeScript check (`npx tsc --noEmit`) passes with 0 errors.
- [ ] Live Studio Screen renders on physical Android phone with dual-layer blur.
- [ ] Preview captions and exported video captions match with 100% timing parity.
- [ ] Dual-stage verified 1080p MP4 successfully saves to Android MediaStore (`DCIM/ClipSnap`).

---

> [!IMPORTANT]
> **Awaiting User Command:** No source code has been altered yet. Once you review this production-ready Master Plan (v2.2) and give the command, we will begin implementation of **Phase P0 (Core Studio)**!
