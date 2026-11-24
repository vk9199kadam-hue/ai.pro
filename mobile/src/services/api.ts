import axios from 'axios';
import { AnalyzeResponse, RenderManifest } from '../types';

// Primary: Public HTTPS Tunnel (works on 5G mobile data, personal hotspot, and any Wi-Fi)
// Secondary: Local Mac Wi-Fi IP fallback
const TUNNEL_URL = 'https://clipsnap-ai.loca.lt/api/v1';
const LOCAL_URL = 'http://10.111.23.89:8000/api/v1';

export const apiClient = axios.create({
  baseURL: TUNNEL_URL,
  timeout: 120000, // 2 minutes: AI transcript and hook analysis takes ~30-60s
  headers: {
    'Content-Type': 'application/json',
    'bypass-tunnel-reminder': 'true',
  },
});

// Resilient Fallback: If tunnel fails, immediately retry on local Wi-Fi IP
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (config && !config.__isRetry && config.baseURL === TUNNEL_URL) {
      config.__isRetry = true;
      config.baseURL = LOCAL_URL;
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

