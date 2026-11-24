export interface WordTimestamp {
  word: str;
  start: number;
  end: number;
  highlight: boolean;
}

export interface ViralClip {
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
  layout: 'blurred_fill' | 'center_crop';
  caption_style: 'hype_yellow' | 'clean_white' | 'neon_glow';
  creator_tag?: string;
  words: WordTimestamp[];
}

