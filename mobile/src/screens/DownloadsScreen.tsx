import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  Share,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { listExportedVideos, deleteExportedVideo } from '../services/storage';
import { ExportedVideoRecord } from '../types';
import { AdBanner } from '../components/AdBanner';

export const DownloadsScreen: React.FC = () => {
  const [downloadedVideos, setDownloadedVideos] = useState<ExportedVideoRecord[]>([]);
  const [previewVideo, setPreviewVideo] = useState<ExportedVideoRecord | null>(null);

  const previewPlayer = useVideoPlayer(
    previewVideo ? { uri: previewVideo.local_uri } : null,
    (player) => {
      if (previewVideo) {
        player.loop = true;
        player.play();
      }
    }
  );

  const loadDownloadedVideos = useCallback(async () => {
    const records = await listExportedVideos();
    const valid: ExportedVideoRecord[] = [];
    for (const rec of records) {
      if (rec.local_uri.startsWith('content://')) {
        valid.push(rec);
      } else {
        try {
          const info = await FileSystem.getInfoAsync(rec.local_uri);
          if (info.exists) {
            valid.push(rec);
          } else {
            await deleteExportedVideo(rec.id);
          }
        } catch {
          // Ignore unreadable paths
        }
      }
    }
    setDownloadedVideos(valid);
  }, []);

  useEffect(() => {
    loadDownloadedVideos();
  }, [loadDownloadedVideos]);

  const handleShareDownloaded = async (item: ExportedVideoRecord) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(item.local_uri, {
          mimeType: 'video/mp4',
          dialogTitle: 'Share Short Video',
          UTI: 'public.movie',
        });
      } else {
        Alert.alert('Saved File', `Video saved at:\n${item.local_uri}`);
      }
    } catch (err) {
      console.log('Share error:', err);
    }
  };

  const handleCopySocialKit = async (item: ExportedVideoRecord) => {
    const caption = item.social_caption || '';
    const hashtags = item.social_hashtags || '#ViralShorts #Reels #Trending';
    const textToShare = `${item.hook_title}\n\n${caption}\n\n${hashtags}`.trim();
    try {
      await Share.share({
        title: item.hook_title,
        message: textToShare,
      });
    } catch {
      Alert.alert('AI Social Media Kit', textToShare);
    }
  };

  const handleDeleteDownloaded = (item: ExportedVideoRecord) => {
    Alert.alert('Delete Short?', `Remove "${item.hook_title}" from downloads?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (item.local_uri.startsWith('file://')) {
            await FileSystem.deleteAsync(item.local_uri, { idempotent: true }).catch(() => {});
          }
          await deleteExportedVideo(item.id);
          if (previewVideo?.id === item.id) {
            setPreviewVideo(null);
          }
          loadDownloadedVideos();
        },
      },
    ]);
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>🎬 My Downloaded Shorts</Text>
            <Text style={styles.subtitle}>All your exported 9:16 videos ready to post</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadDownloadedVideos}>
            <Text style={styles.refreshText}>↻ Refresh</Text>
          </TouchableOpacity>
        </View>

        {downloadedVideos.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📱</Text>
            <Text style={styles.emptyTitle}>No Downloaded Shorts Yet</Text>
            <Text style={styles.emptyText}>
              Create a short from the Home tab and tap Export. Your finished 1080×1920 MP4s will appear here!
            </Text>
          </View>
        ) : (
          downloadedVideos.map((item) => (
            <View key={item.id} style={styles.downloadRow}>
              <TouchableOpacity style={styles.downloadInfo} onPress={() => setPreviewVideo(item)}>
                <Text style={styles.downloadHook} numberOfLines={2}>{item.hook_title}</Text>
                <Text style={styles.downloadMeta}>
                  {item.duration_seconds > 0 ? `${item.duration_seconds}s · ` : ''}1080×1920 MP4 · Tap to watch
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.playMiniBtn} onPress={() => setPreviewVideo(item)}>
                <Text style={styles.playMiniText}>▶ Play</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.kitMiniBtn} onPress={() => handleCopySocialKit(item)}>
                <Text style={styles.kitMiniText}>📋 Kit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareMiniBtn} onPress={() => handleShareDownloaded(item)}>
                <Text style={styles.shareMiniText}>📤</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteMiniBtn} onPress={() => handleDeleteDownloaded(item)}>
                <Text style={styles.deleteMiniText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ marginTop: 20 }}>
          <AdBanner placement="inline" />
        </View>
      </ScrollView>

      <Modal
        visible={!!previewVideo}
        animationType="slide"
        transparent
        onRequestClose={() => setPreviewVideo(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {previewVideo?.hook_title || 'Exported Short'}
            </Text>
            <View style={styles.modalVideoFrame}>
              {previewVideo ? (
                <VideoView
                  player={previewPlayer}
                  style={styles.modalVideo}
                  contentFit="contain"
                  nativeControls
                />
              ) : null}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalShareBtn}
                onPress={() => previewVideo && handleShareDownloaded(previewVideo)}
              >
                <Text style={styles.modalShareText}>📥 Save / Share MP4</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalKitBtn}
                onPress={() => previewVideo && handleCopySocialKit(previewVideo)}
              >
                <Text style={styles.modalKitText}>📋 Copy Kit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setPreviewVideo(null)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#0D0F15' },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  subtitle: { fontSize: 12, color: '#8E9AA8', marginTop: 4 },
  refreshBtn: { backgroundColor: '#1E2330', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#2E364A' },
  refreshText: { color: '#FFE600', fontSize: 12, fontWeight: '700' },
  emptyCard: { backgroundColor: '#141822', borderRadius: 16, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#232938', marginTop: 10 },
  emptyIcon: { fontSize: 38, marginBottom: 10 },
  emptyTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  emptyText: { color: '#7E8B9B', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  downloadRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141822', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#232938', gap: 8 },
  downloadInfo: { flex: 1 },
  downloadHook: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  downloadMeta: { color: '#8E9AA8', fontSize: 11, marginTop: 4 },
  playMiniBtn: { backgroundColor: '#FFE600', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  playMiniText: { color: '#000', fontSize: 11, fontWeight: '800' },
  kitMiniBtn: { backgroundColor: '#1E2330', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8, borderWidth: 1, borderColor: '#FFE600' },
  kitMiniText: { color: '#FFE600', fontSize: 11, fontWeight: '800' },
  shareMiniBtn: { backgroundColor: '#1E2330', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#2E364A' },
  shareMiniText: { fontSize: 13 },
  deleteMiniBtn: { backgroundColor: '#2A1820', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8, borderWidth: 1, borderColor: '#5B2330' },
  deleteMiniText: { fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: '#141822', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#232938' },
  modalTitle: { color: '#FFF', fontSize: 15, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  modalVideoFrame: { width: '100%', height: 420, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  modalVideo: { width: '100%', height: '100%' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalShareBtn: { flex: 1, backgroundColor: '#FFE600', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalShareText: { color: '#000', fontSize: 13, fontWeight: '800' },
  modalKitBtn: { backgroundColor: '#1E2330', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#FFE600' },
  modalKitText: { color: '#FFE600', fontSize: 12, fontWeight: '800' },
  modalCloseBtn: { backgroundColor: '#1E2330', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2E364A' },
  modalCloseText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
});

