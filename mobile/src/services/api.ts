import axios from 'axios';
import { AnalyzeResponse, RenderManifest } from '../types';

// Direct local Wi-Fi server (same subnet as Metro, 100% reliable, zero tunnel drops)
export const LOCAL_SERVER_IP = '10.125.178.89:8000';
export const LOCAL_BASE_URL = `http://${LOCAL_SERVER_IP}`;

// Active public tunnel (fallback for cellular data)
export const PUBLIC_TUNNEL_URL = 'https://d7d2fbfd66b6a9.app.lhr.life';

// Resolve streaming media URL: Use direct local Wi-Fi connection with full MP4 byte-range support
export const resolveMediaUrl = (path?: string | null): string => {
  if (!path) return '';
  // Extract relative clip path regardless of any previous domain
  const cleanPath = path.includes('/media/clips/')
    ? path.substring(path.indexOf('/media/clips/'))
    : (path.startsWith('/') ? path : `/${path}`);

  return `${LOCAL_BASE_URL}${cleanPath}`;
};

export const apiClient = axios.create({
  baseURL: `${LOCAL_BASE_URL}/api/v1`,
  timeout: 120000, // 2 minutes: AI transcript and hook analysis takes ~30-60s
  headers: {
    'Content-Type': 'application/json',
  },
});

// Resilient Fallback: Only retry on public tunnel if local Wi-Fi has a network/connection failure (!error.response)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!error.response && config && !config.__isRetry) {
      config.__isRetry = true;
      config.baseURL = `${PUBLIC_TUNNEL_URL}/api/v1`;
      return axios(config);
    }
    return Promise.reject(error);
  }
);

export const analyzeYouTubeLink = async (url: string, numClips: number = 3): Promise<AnalyzeResponse> => {
  const response = await apiClient.post<AnalyzeResponse>('/analyze', {
    source_type: 'YOUTUBE_URL',
    url,
    num_clips: numClips,
  });
  return response.data;
};

export const prepareRenderManifest = async (
  clipId: string,
  captionStyle: string = 'hype_yellow',
  creatorTag?: string
): Promise<RenderManifest> => {
  const response = await apiClient.post<RenderManifest>(`/clips/${clipId}/prepare`, {
    clip_id: clipId,
    caption_style: captionStyle,
    creator_tag: creatorTag,
  });
  return response.data;
};

export const getUserCredits = async (userId: string): Promise<number> => {
  try {
    const response = await apiClient.get<{ user_id: string; balance: number }>(`/credits/balance/${userId}`);
    return response.data.balance;
  } catch {
    return 5; // Default fallback
  }
};

export const claimAdRewardCredit = async (userId: string): Promise<number> => {
  const response = await apiClient.post<{ user_id: string; balance: number }>('/credits/claim-ad-reward', {
    user_id: userId,
    idempotency_key: `ad_${Date.now()}_${Math.random()}`,
  });
  return response.data.balance;
};

export const checkClipStatus = async (clipFileId: string): Promise<{ ready: boolean; url: string; file_size: number }> => {
  try {
    const cleanId = clipFileId.replace(/^.*\/media\/clips\//, '').replace('.mp4', '');
    const response = await apiClient.get<{ ready: boolean; url: string; file_size: number }>(`/clips/${cleanId}/status`);
    return response.data;
  } catch {
    return { ready: false, url: '', file_size: 0 };
  }
};

export const renderEditedVideo = async (
  manifest: RenderManifest
): Promise<{ rendered_url: string; duration_seconds: number; width: number; height: number }> => {
  const response = await apiClient.post<{
    rendered_url: string;
    duration_seconds: number;
    width: number;
    height: number;
  }>('/clips/render', manifest);
  return response.data;
};

export const cleanupRenderedVideo = async (renderedUrl: string): Promise<void> => {
  try {
    if (!renderedUrl) return;
    await apiClient.post('/clips/cleanup', { rendered_url: renderedUrl });
  } catch {
    // Non-critical cleanup; server background sweep handles leftovers
  }
};


