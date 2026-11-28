import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Linking, ActivityIndicator, Alert, ScrollView } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { RenderManifest, ViralClip } from '../types';
import { renderVideoOnDevice } from '../services/nativeRenderer';
import { showInterstitialAd } from '../services/admob';
import { saveExportedVideo } from '../services/storage';

interface ExportScreenProps {
  manifest: RenderManifest;
  clip: ViralClip;
  onFinish: () => void;
  onBackToCarousel: () => void;
}

export const ExportScreen: React.FC<ExportScreenProps> = ({ manifest, clip, onFinish, onBackToCarousel }) => {
  const [progress, setProgress] = useState(0);
  const [isRendering, setIsRendering] = useState(true);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [renderDuration, setRenderDuration] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;

    async function runExportPipeline() {
      try {
        const startTime = Date.now();

        // 1. Trigger non-intrusive AdMob Interstitial during render phase
        showInterstitialAd().catch(() => {});

        // 2. Execute On-Device Android Media3 Render Pipeline
        const result = await renderVideoOnDevice(manifest, (pct) => {
          if (isMounted) setProgress(pct);
        });

        // 3. Persist exported video record and remove any previous local version for this clip
        if (result.outputPath) {
          const kit = clip.social_kit;
          const replacedUris = await saveExportedVideo({
            id: `${manifest.clip_id}_${Date.now()}`,
            clip_id: manifest.clip_id,
            hook_title: kit?.viral_title || clip.hook_title || 'Viral Short',
            local_uri: result.outputPath,
            duration_seconds: Math.round((result.durationMs || 0) / 1000),
            created_at: Date.now(),
            social_caption: kit?.caption || clip.key_quote || '',
            social_hashtags: kit?.hashtags_formatted || '#ViralShorts #Reels #Trending',
          });
          for (const oldUri of replacedUris) {
            if (oldUri.startsWith('file://')) {
              await FileSystem.deleteAsync(oldUri, { idempotent: true }).catch(() => {});
            }
          }
        }

        if (isMounted) {
          setOutputPath(result.outputPath);
          setRenderDuration((Date.now() - startTime) / 1000);
          setIsRendering(false);
        }
      } catch (err: any) {
        alert(`Render Error: ${err.message || 'On-device render failed'}`);
        if (isMounted) setIsRendering(false);
      }
    }

    runExportPipeline();

    return () => {
      isMounted = false;
    };
  }, [manifest]);

  const handleShareGeneral = async () => {
    if (!outputPath) return;
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(outputPath, {
          mimeType: 'video/mp4',
          dialogTitle: 'Share Video Short',
          UTI: 'public.movie',
        });
      } else {
        await Share.share({
          title: clip.hook_title,
          message: `Check out this viral short generated with ClipSnap AI: ${clip.hook_title}`,
          url: outputPath,
        });
      }
    } catch (err: any) {
      console.log('Share canceled or failed', err);
    }
  };

  const handleCopySocialKit = async () => {
    const kit = clip.social_kit;
    const title = kit?.viral_title || clip.hook_title;
    const caption = kit?.caption || clip.key_quote || '';
    const hashtags = kit?.hashtags_formatted || '#ViralShorts #Reels #Trending';
    const textToShare = `${title}\n\n${caption}\n\n${hashtags}`.trim();
    try {
      await Share.share({
        title,
        message: textToShare,
      });
    } catch {
      Alert.alert('AI Social Media Kit', textToShare);
    }
  };

  const handleOpenApp = (scheme: string) => {
    Linking.canOpenURL(scheme).then((supported) => {
      if (supported) {
        Linking.openURL(scheme);
      } else {
        alert('App not installed on device');
      }
    });
  };

  return (
    <View style={styles.container}>
      {isRendering ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FFE600" />
          <Text style={styles.titleText}>
            {progress < 50 ? 'Composing 9:16 Short...' : progress < 95 ? 'Saving to Phone Gallery...' : 'Finalizing Video...'}
          </Text>
          <Text style={styles.subtitleText}>
            {progress < 50 ? 'Applying background blur, subtitles & hook banner' : 'Saving 1080×1920 MP4 to phone'}
          </Text>

          {/* Progress Bar Container */}
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.percentText}>{progress}% Completed</Text>

          {/* Quality badge */}
          <View style={styles.badgeBox}>
            <Text style={styles.badgeText}>⚡ 1080×1920 Full HD · Hardware Video Engine</Text>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollCenterBox} showsVerticalScrollIndicator={false}>
          <Text style={styles.successIcon}>🎉</Text>
          <Text style={styles.titleText}>Short Ready & Saved!</Text>
          <Text style={styles.savedLocation}>Saved to your phone Gallery & ready to share</Text>

          {/* Render Stats Card */}
          <View style={styles.statsCard}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Resolution</Text>
              <Text style={styles.statVal}>1080 × 1920 (9:16)</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Edits Applied</Text>
              <Text style={styles.statVal}>✅ Blur + Subtitles + Hook</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Viral Hook</Text>
              <Text style={[styles.statVal, { flex: 1, textAlign: 'right', marginLeft: 12 }]} numberOfLines={1}>{clip.hook_title}</Text>
            </View>
          </View>

          {/* AI Social Media Kit Card */}
          <View style={styles.socialKitCard}>
            <View style={styles.socialKitHeader}>
              <Text style={styles.socialKitTitle}>📱 AI Social Media Kit</Text>
              <TouchableOpacity style={styles.copyKitBtn} onPress={handleCopySocialKit}>
                <Text style={styles.copyKitBtnText}>📋 Copy / Share</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.kitLabel}>Title:</Text>
            <Text selectable style={styles.kitText}>{clip.social_kit?.viral_title || clip.hook_title}</Text>
            <Text style={styles.kitLabel}>Caption:</Text>
            <Text selectable style={styles.kitText}>{clip.social_kit?.caption || clip.key_quote}</Text>
            <Text style={styles.kitHashtags} selectable>
              {clip.social_kit?.hashtags_formatted || '#ViralShorts #Reels #Trending'}
            </Text>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity style={styles.shareNowBtn} onPress={handleShareGeneral}>
            <Text style={styles.shareNowBtnText}>📥 Save Video to Phone / Share (MP4)</Text>
          </TouchableOpacity>

          <Text style={styles.expoGoNote}>
            💡 Tap above to save the MP4 file to your Downloads or send directly to WhatsApp / Instagram
          </Text>

          <TouchableOpacity style={styles.doneBtn} onPress={onFinish}>
            <Text style={styles.doneBtnText}>⚡ Create Another Short</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn} onPress={onBackToCarousel}>
            <Text style={styles.backBtnText}>Choose Another Moment from this Video</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F15',
    justifyContent: 'center',
    padding: 24,
  },
  centerBox: {
    alignItems: 'center',
  },
  scrollCenterBox: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  socialKitCard: {
    backgroundColor: '#141822',
    borderWidth: 1,
    borderColor: '#2E364A',
    borderRadius: 14,
    padding: 14,
    width: '100%',
    marginTop: 14,
  },
  socialKitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  socialKitTitle: {
    color: '#FFE600',
    fontSize: 13,
    fontWeight: '800',
  },
  copyKitBtn: {
    backgroundColor: '#1E2330',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFE600',
  },
  copyKitBtnText: {
    color: '#FFE600',
    fontSize: 11,
    fontWeight: '800',
  },
  kitLabel: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  kitText: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  kitHashtags: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  titleText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 18,
    textAlign: 'center',
  },
  subtitleText: {
    color: '#8E9AA8',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  progressBarTrack: {
    width: '100%',
    height: 12,
    backgroundColor: '#1E2330',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 28,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFE600',
    borderRadius: 6,
  },
  percentText: {
    color: '#FFE600',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  badgeBox: {
    marginTop: 24,
    backgroundColor: '#141822',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#232938',
  },
  badgeText: {
    color: '#8E9AA8',
    fontSize: 12,
  },
  successIcon: {
    fontSize: 54,
  },
  savedLocation: {
    color: '#8E9AA8',
    fontSize: 13,
    marginTop: 6,
  },
  highlightText: {
    color: '#FFE600',
    fontWeight: '700',
  },
  statsCard: {
    backgroundColor: '#141822',
    borderWidth: 1,
    borderColor: '#232938',
    borderRadius: 14,
    padding: 16,
    width: '100%',
    marginTop: 24,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  statLabel: {
    color: '#667085',
    fontSize: 13,
  },
  statVal: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  shareHeading: {
    color: '#8E9AA8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  socialBtn: {
    backgroundColor: '#141822',
    borderWidth: 1,
    borderColor: '#232938',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  socialEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  socialLabel: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  shareNowBtn: {
    backgroundColor: '#1E2330',
    borderRadius: 12,
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#FFE600',
  },
  shareNowBtnText: {
    color: '#FFE600',
    fontSize: 15,
    fontWeight: '800',
  },
  expoGoNote: {
    color: '#8E9AA8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 10,
    lineHeight: 16,
  },
  doneBtn: {
    backgroundColor: '#FFE600',
    borderRadius: 12,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
  },
  doneBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800',
  },
  backBtn: {
    marginTop: 14,
    paddingVertical: 10,
  },
  backBtnText: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '600',
  },
});

