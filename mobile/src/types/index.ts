export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  highlight: boolean;
}

export interface CaptionWord {
  id: string;
  word: string;
  start: number; // in seconds, e.g. 1.25
  end: number;   // in seconds, e.g. 1.60
  isDeleted?: boolean; // user deleted this filler word
}

export interface SocialKit {
  viral_title: string;
  caption: string;
  hashtags: string[];
  hashtags_formatted: string;
  full_transcript: string;
}

export interface ViralClip {
  clip_id?: string;
  clip_number: number;
  hook_title: string;
  start_time_seconds: number;
  end_time_seconds: number;
  start_time_formatted: string;
  end_time_formatted: string;
  duration_seconds: number;
  viral_score: number;
  virality_reason: string;
  key_quote: string;
  preview_url?: string;
  social_kit?: SocialKit;
  words?: WordTimestamp[];
}

export interface AnalyzeResponse {
  source_id: string;
  video_id?: string;
  total_clips: number;
  clips: ViralClip[];
}

export interface RenderManifest {
  clip_id: string;
  source_url: string;
  trim_start: number;
  trim_end: number;
  target_width: number;
  target_height: number;
  layout: 'blurred_fill' | 'center_crop' | 'fit_black';
  caption_style: 'hype_yellow' | 'clean_white' | 'neon_glow';
  captions_enabled?: boolean;
  creator_tag?: string;
  hook_text?: string;
  hook_enabled?: boolean;
  watermark_text?: string;
  watermark_enabled?: boolean;
  watermark_position?: string;
  words: WordTimestamp[];
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


