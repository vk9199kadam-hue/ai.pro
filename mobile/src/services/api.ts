import axios from 'axios';
import { AnalyzeResponse, RenderManifest } from '../types';

// Connects to local Mac backend over Wi-Fi (change to Oracle IP 130.210.123.13 after cloud deployment)
const API_BASE_URL = 'http://10.111.23.89:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

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

