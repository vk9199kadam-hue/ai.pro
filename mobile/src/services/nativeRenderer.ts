import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import { RenderManifest } from '../types';
import { renderEditedVideo, resolveMediaUrl, cleanupRenderedVideo } from './api';

interface RenderResult {
  outputPath: string;
  durationMs: number;
  width: number;
  height: number;
  fileSizeBytes: number;
}

/**
 * On-Device Video Renderer & Gallery Exporter Service
 * 1. Native Build: Downloads raw clip to cache, then executes Android Media3 Transformer
 *    hardware GPU pipeline (blurred_fill, animated subtitles, hook banner, watermark).
 * 2. Expo Go Mode: Uses local dev backend FFmpeg composer and saves the MP4 to phone Gallery.
 */
export async function renderVideoOnDevice(
  manifest: RenderManifest,
  onProgress?: (percent: number) => void
): Promise<RenderResult> {
  const { VideoRendererModule } = NativeModules;

  // 1. Request MediaLibrary Storage Permissions (Only photo and video, avoid AUDIO permission crash on Android 13+)
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
    console.log('[NativeRenderer] MediaLibrary permission status:', status);
  } catch (err: any) {
    console.warn('[NativeRenderer] Permission request notice:', err?.message || err);
  }

  // 2. Production Native Android Path (Media3 Transformer GPU Module)
  if (Platform.OS === 'android' && VideoRendererModule) {
    let localSourcePath = manifest.source_url;
    let tempCachedFile: string | null = null;

    // Pre-download HTTP clip to local cache so MediaMetadataRetriever & Media3 run 100% offline/fast
    if (localSourcePath.startsWith('http://') || localSourcePath.startsWith('https://')) {
      if (onProgress) onProgress(5);
      const cacheTarget = `${FileSystem.cacheDirectory}raw_${manifest.clip_id || Date.now()}.mp4`;
      console.log('[NativeRenderer] Pre-fetching raw clip to local cache for Media3 GPU:', localSourcePath);

      const dl = FileSystem.createDownloadResumable(
        localSourcePath,
        cacheTarget,
        {},
        (dp) => {
          if (onProgress && dp.totalBytesExpectedToWrite > 0) {
            const pct = 5 + Math.round((dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 20);
            onProgress(Math.min(25, pct));
          }
        }
      );
      const dlRes = await dl.downloadAsync();
      if (!dlRes || !dlRes.uri) {
        throw new Error('Failed to fetch source clip for on-device rendering');
      }
      localSourcePath = dlRes.uri;
      tempCachedFile = dlRes.uri;
    }

    if (onProgress) onProgress(25);
    const localManifest: RenderManifest = {
      ...manifest,
      source_url: localSourcePath,
    };

    return new Promise((resolve, reject) => {
      let progressSub: any = null;

      if (onProgress) {
        progressSub = DeviceEventEmitter.addListener('onRenderProgress', (data: { progress: number }) => {
          const scaled = 25 + Math.round(data.progress * 75);
          onProgress(Math.min(99, scaled));
        });
      }

      VideoRendererModule.renderClip(JSON.stringify(localManifest))
        .then(async (resultJson: string) => {
          if (progressSub) progressSub.remove();
          if (tempCachedFile) {
            FileSystem.deleteAsync(tempCachedFile, { idempotent: true }).catch(() => {});
          }
          const parsed = JSON.parse(resultJson);
          try {
            if (!parsed.savedToGallery && parsed.outputPath && parsed.outputPath.startsWith('file://')) {
              await MediaLibrary.saveToLibraryAsync(parsed.outputPath);
            }
          } catch (e) {
            console.warn('[NativeRenderer] Save to library warning:', e);
          }
          if (onProgress) onProgress(100);
          resolve(parsed);
        })
        .catch((err: any) => {
          if (progressSub) progressSub.remove();
          if (tempCachedFile) {
            FileSystem.deleteAsync(tempCachedFile, { idempotent: true }).catch(() => {});
          }
          reject(err);
        });
    });
  }

  // 3. Expo Go Mode: Render complete 9:16 vertical short with blur, subtitles & hook banner!
  if (onProgress) onProgress(15);
  console.log('[NativeRenderer] Rendering 9:16 short with all edits via backend engine...');

  let renderedRelativeUrl = '';
  try {
    const renderRes = await renderEditedVideo(manifest);
    renderedRelativeUrl = renderRes.rendered_url;
    console.log('[NativeRenderer] Render engine response:', renderRes);
  } catch (renderErr: any) {
    console.error('[NativeRenderer] Backend render failed:', renderErr?.message || renderErr);
    throw new Error(`Video composition failed: ${renderErr?.message || 'Server render error'}`);
  }

  if (onProgress) onProgress(50);

  const targetUrl = resolveMediaUrl(renderedRelativeUrl);
  const fileName = `ClipSnap_9x16_${manifest.clip_id || Date.now()}.mp4`;
  const localFileUri = `${FileSystem.documentDirectory}${fileName}`;

  console.log('[NativeRenderer] Downloading rendered 9:16 short from:', targetUrl);
  console.log('[NativeRenderer] Local target path:', localFileUri);

  const downloadResumable = FileSystem.createDownloadResumable(
    targetUrl,
    localFileUri,
    {},
    (downloadProgress) => {
      if (onProgress && downloadProgress.totalBytesExpectedToWrite > 0) {
        const progressPct = 50 + Math.round(
          (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 45
        );
        onProgress(Math.min(95, progressPct));
      }
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || !result.uri) {
    throw new Error('Failed to download rendered video file to device');
  }

  if (onProgress) onProgress(98);

  // Save the downloaded MP4 file into the phone's native Photos / Gallery cleanly without Scoped Storage prompts
  try {
    await MediaLibrary.saveToLibraryAsync(result.uri);
    console.log('[NativeRenderer] ✅ Rendered 9:16 short saved to phone Gallery successfully!');
  } catch (libErr: any) {
    console.warn('[NativeRenderer] MediaLibrary save notice:', libErr.message);
  }

  // Delete temporary rendered MP4 from backend server immediately after download
  cleanupRenderedVideo(renderedRelativeUrl).catch(() => {});

  if (onProgress) onProgress(100);

  const fileInfo = await FileSystem.getInfoAsync(result.uri);
  const size = fileInfo.exists ? fileInfo.size : 5_000_000;

  return {
    outputPath: result.uri,
    durationMs: (manifest.trim_end - manifest.trim_start) * 1000,
    width: manifest.target_width || 1080,
    height: manifest.target_height || 1920,
    fileSizeBytes: size,
  };
}
