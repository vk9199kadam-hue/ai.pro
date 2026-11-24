import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Linking, ActivityIndicator } from 'react-native';
import { RenderManifest, ViralClip } from '../types';
import { renderVideoOnDevice } from '../services/nativeRenderer';
import { showInterstitialAd } from '../services/admob';

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
      await Share.share({
        title: clip.hook_title,
        message: `Check out this viral short generated with ClipSnap AI: ${clip.hook_title}`,
        url: outputPath,
      });
    } catch (err: any) {
      console.log('Share canceled or failed', err);
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
          <Text style={styles.titleText}>Rendering On-Device...</Text>
          <Text style={styles.subtitleText}>Using Native Android Media3 GPU Acceleration</Text>

          {/* Progress Bar Container */}
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.percentText}>{progress}% Completed</Text>

          {/* Cloud vs Phone stat badge */}
          <View style={styles.badgeBox}>
            <Text style={styles.badgeText}>⚡ 0 MB Server Upload · 100% Private on Phone</Text>
          </View>
        </View>
      ) : (
        <View style={styles.centerBox}>
          <Text style={styles.successIcon}>🎉</Text>
          <Text style={styles.titleText}>Short Ready & Saved!</Text>
          <Text style={styles.savedLocation}>Saved to: <Text style={styles.highlightText}>DCIM/ClipSnap</Text></Text>

          {/* Render Stats Card */}
          <View style={styles.statsCard}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Resolution</Text>
              <Text style={styles.statVal}>1080 × 1920 (9:16)</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Render Time</Text>
              <Text style={styles.statVal}>{renderDuration.toFixed(1)}s (Hardware GPU)</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Viral Hook</Text>
              <Text style={styles.statVal} numberOfLines={1}>{clip.hook_title}</Text>
            </View>
          </View>

          {/* Share Action Row */}
          <Text style={styles.shareHeading}>Quick Share to Social Platforms:</Text>
          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialBtn} onPress={() => handleOpenApp('youtube://')}>
              <Text style={styles.socialEmoji}>🔴</Text>
              <Text style={styles.socialLabel}>Shorts</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.socialBtn} onPress={() => handleOpenApp('instagram://')}>
              <Text style={styles.socialEmoji}>📸</Text>
              <Text style={styles.socialLabel}>Reels</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.socialBtn} onPress={() => handleOpenApp('snssdk1233://')}>
              <Text style={styles.socialEmoji}>🎵</Text>
              <Text style={styles.socialLabel}>TikTok</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.socialBtn} onPress={handleShareGeneral}>
              <Text style={styles.socialEmoji}>📤</Text>
              <Text style={styles.socialLabel}>More</Text>
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity style={styles.doneBtn} onPress={onFinish}>
            <Text style={styles.doneBtnText}>⚡ Create Another Short</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn} onPress={onBackToCarousel}>
            <Text style={styles.backBtnText}>Choose Another Moment from this Video</Text>
          </TouchableOpacity>
        </View>
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
  doneBtn: {
    backgroundColor: '#FFE600',
    borderRadius: 12,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    marginTop: 28,
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

