import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import { RenderManifest } from '../types';
import { renderEditedVideo, resolveMediaUrl } from './api';

interface RenderResult {
  outputPath: string;
  durationMs: number;
  width: number;
  height: number;
  fileSizeBytes: number;
}

/**
 * On-Device Video Renderer & Gallery Exporter Service
 * 1. Native Build: Executes Android Media3 Transformer hardware pipeline.
 * 2. Expo Go Mode: Downloads the real processed MP4 clip directly to the phone's 
 *    filesystem and saves it to the Android MediaStore Gallery (DCIM / ClipSnap AI).
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

  // 2. Production Native Android Path (Media3 Transformer Module)
  if (Platform.OS === 'android' && VideoRendererModule) {
    return new Promise((resolve, reject) => {
      let progressSub: any = null;

      if (onProgress) {
        progressSub = DeviceEventEmitter.addListener('onRenderProgress', (data: { progress: number }) => {
          onProgress(Math.min(100, Math.round(data.progress * 100)));
        });
      }

      VideoRendererModule.renderClip(JSON.stringify(manifest))
        .then(async (resultJson: string) => {
          if (progressSub) progressSub.remove();
          const parsed = JSON.parse(resultJson);
          try {
            if (parsed.outputPath && parsed.outputPath.startsWith('file://')) {
              await MediaLibrary.saveToLibraryAsync(parsed.outputPath);
            }
          } catch (e) {
            console.warn('[NativeRenderer] Save to library warning:', e);
          }
          resolve(parsed);
        })
        .catch((err: any) => {
          if (progressSub) progressSub.remove();
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

  // Save the downloaded MP4 file into the phone's native Photos / Gallery!
  try {
    await MediaLibrary.saveToLibraryAsync(result.uri);
    const asset = await MediaLibrary.createAssetAsync(result.uri);
    try {
      await MediaLibrary.createAlbumAsync('ClipSnap AI', asset, false);
    } catch {}
    console.log('[NativeRenderer] ✅ Rendered 9:16 short saved to phone Gallery successfully!');
  } catch (libErr: any) {
    console.warn('[NativeRenderer] MediaLibrary save notice:', libErr.message);
  }

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
