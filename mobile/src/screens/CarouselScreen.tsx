import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, Share } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ViralClip } from '../types';

interface CarouselScreenProps {
  clips: ViralClip[];
  onSelectClip: (clip: ViralClip) => void;
  onBack: () => void;
}

const ClipVideoPlayerItem: React.FC<{ videoUrl: string; onStop: () => void }> = ({ videoUrl, onStop }) => {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <View style={styles.activeVideoContainer}>
      <VideoView
        style={styles.activeVideoView}
        player={player}
        nativeControls={true}
        contentFit="contain"
      />
      <TouchableOpacity style={styles.closeVideoButton} onPress={onStop}>
        <Text style={styles.closeVideoText}>✕ Pause & Close Preview</Text>
      </TouchableOpacity>
    </View>
  );
};

export const CarouselScreen: React.FC<CarouselScreenProps> = ({ clips, onSelectClip, onBack }) => {
  const [activePlayingClip, setActivePlayingClip] = useState<number | null>(null);
  const [expandedTranscript, setExpandedTranscript] = useState<{ [key: number]: boolean }>({});

  const togglePlay = (clipNum: number) => {
    if (activePlayingClip === clipNum) {
      setActivePlayingClip(null);
    } else {
      setActivePlayingClip(clipNum);
    }
  };

  const toggleTranscript = (clipNum: number) => {
    setExpandedTranscript(prev => ({ ...prev, [clipNum]: !prev[clipNum] }));
  };

  const handleCopySocialKit = async (clip: ViralClip) => {
    const kit = clip.social_kit;
    const textToShare = kit 
      ? `${kit.viral_title}\n\n${kit.caption}\n\n${kit.hashtags_formatted}`
      : `${clip.hook_title}\n\n#ViralShorts #Reels #Trending`;

    try {
      await Share.share({
        title: clip.hook_title,
        message: textToShare,
      });
    } catch {
      Alert.alert('Social Kit Ready', textToShare);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎯 {clips.length} Viral Moments Found</Text>
      </View>

      <FlatList
        data={clips}
        keyExtractor={(item) => item.clip_number.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isPlaying = activePlayingClip === item.clip_number;
          const isTranscriptOpen = !!expandedTranscript[item.clip_number];
          const kit = item.social_kit;

          // Resolve streaming MP4 URL
          const BASE_STREAM_URL = 'https://clipsnap-ai.loca.lt';
          const streamUrl = item.preview_url && item.preview_url.startsWith('http')
            ? item.preview_url
            : `${BASE_STREAM_URL}${item.preview_url || `/media/clips/vHwchNO-bOE_${item.clip_number}.mp4`}`;

          return (
            <View style={styles.card}>
              {/* Header: Score & Timestamp */}
              <View style={styles.cardHeader}>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreText}>🔥 {item.viral_score}/100 VIRAL</Text>
                </View>
                <Text style={styles.timeBadge}>
                  ⏱️ {item.start_time_formatted} - {item.end_time_formatted} ({item.duration_seconds}s)
                </Text>
              </View>

              {/* Hook Title */}
              <Text style={styles.hookTitle}>"{item.hook_title}"</Text>

              {/* 🎬 Real Video Player & Preview */}
              {isPlaying ? (
                <ClipVideoPlayerItem 
                  videoUrl={streamUrl} 
                  onStop={() => setActivePlayingClip(null)} 
                />
              ) : (
                <TouchableOpacity 
                  style={styles.videoPreviewBox} 
                  onPress={() => togglePlay(item.clip_number)}
                  activeOpacity={0.8}
                >
                  <View style={styles.videoPlayerFrame}>
                    <Text style={styles.videoIcon}>▶️</Text>
                    <Text style={styles.videoStatusText}>Tap to Watch Video Clip with Sound</Text>
                    <View style={styles.videoTimeTag}>
                      <Text style={styles.videoTimeTagText}>{item.start_time_formatted} - {item.end_time_formatted}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* Attention Hook Quote */}
              <View style={styles.quoteBox}>
                <Text style={styles.quoteLabel}>Attention Hook:</Text>
                <Text style={styles.quoteText}>{item.key_quote}</Text>
              </View>

              {/* AI Why it's Viral */}
              <Text style={styles.reasonText}>💡 {item.virality_reason}</Text>

              {/* 📱 AI Social Media Kit Section */}
              <View style={styles.socialKitBox}>
                <View style={styles.socialKitHeader}>
                  <Text style={styles.socialKitTitle}>📱 AI Social Media Kit</Text>
                  <TouchableOpacity onPress={() => handleCopySocialKit(item)}>
                    <Text style={styles.copyButtonText}>📋 Share / Copy Kit</Text>
                  </TouchableOpacity>
                </View>

                {/* AI Caption */}
                <Text style={styles.captionText}>
                  {kit?.caption || 'Check out this viral moment! Would you try this? 👇'}
                </Text>

                {/* Hashtags */}
                <Text style={styles.hashtagsText}>
                  {kit?.hashtags_formatted || '#ViralShorts #Reels #Trending #MustWatch'}
                </Text>

                {/* Full Transcript Accordion */}
                <TouchableOpacity 
                  style={styles.transcriptToggle} 
                  onPress={() => toggleTranscript(item.clip_number)}
                >
                  <Text style={styles.transcriptToggleText}>
                    {isTranscriptOpen ? '▲ Hide Full Spoken Text' : '▼ View Full Spoken Text'}
                  </Text>
                </TouchableOpacity>

                {isTranscriptOpen && (
                  <View style={styles.transcriptContent}>
                    <Text style={styles.transcriptBodyText}>
                      {kit?.full_transcript || item.key_quote}
                    </Text>
                  </View>
                )}
              </View>

              {/* Action Buttons */}
              <TouchableOpacity 
                style={styles.selectButton} 
                onPress={() => onSelectClip(item)}
              >
                <Text style={styles.selectButtonText}>✂️ Select & Edit This Video</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F15' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#1A202C' },
  backButton: { marginRight: 15 },
  backText: { color: '#FFE600', fontWeight: '700', fontSize: 15 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  listContent: { padding: 20 },
  card: { backgroundColor: '#141822', borderRadius: 18, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#232938' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  scoreBadge: { backgroundColor: '#FF3B30', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  scoreText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  timeBadge: { color: '#8E9AA8', fontSize: 13, fontWeight: '600' },
  hookTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 12, lineHeight: 24 },

  /* Video Preview Box (Placeholder) */
  videoPreviewBox: { height: 160, backgroundColor: '#090B0E', borderRadius: 12, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#232938', justifyContent: 'center', alignItems: 'center' },
  videoPlayerFrame: { alignItems: 'center' },
  videoIcon: { fontSize: 40, marginBottom: 8 },
  videoStatusText: { color: '#FFE600', fontWeight: '700', fontSize: 13 },
  videoTimeTag: { marginTop: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  videoTimeTagText: { color: '#A0AEC0', fontSize: 11, fontWeight: '600' },

  /* Active Real Video Player View */
  activeVideoContainer: { height: 220, backgroundColor: '#000', borderRadius: 12, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#FFE600' },
  activeVideoView: { width: '100%', height: 180 },
  closeVideoButton: { height: 40, backgroundColor: '#1A202C', justifyContent: 'center', alignItems: 'center' },
  closeVideoText: { color: '#CBD5E1', fontSize: 12, fontWeight: '700' },

  quoteBox: { backgroundColor: '#0D0F15', borderRadius: 10, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#FFE600' },
  quoteLabel: { color: '#7E8B9B', fontSize: 11, fontWeight: '600', marginBottom: 3 },
  quoteText: { color: '#E2E8F0', fontSize: 13, fontStyle: 'italic' },
  reasonText: { color: '#94A3B8', fontSize: 12, marginBottom: 14, lineHeight: 18 },

  /* Social Kit Box */
  socialKitBox: { backgroundColor: '#0A0C10', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1F2937' },
  socialKitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  socialKitTitle: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  copyButtonText: { color: '#FFE600', fontWeight: '700', fontSize: 12 },
  captionText: { color: '#CBD5E1', fontSize: 12, lineHeight: 17, marginBottom: 8 },
  hashtagsText: { color: '#38BDF8', fontSize: 11, fontWeight: '600', lineHeight: 16, marginBottom: 8 },
  transcriptToggle: { paddingVertical: 4, alignItems: 'center' },
  transcriptToggleText: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  transcriptContent: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1F2937' },
  transcriptBodyText: { color: '#E2E8F0', fontSize: 12, lineHeight: 18, fontStyle: 'italic' },

  selectButton: { backgroundColor: '#FFE600', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  selectButtonText: { color: '#000', fontWeight: '800', fontSize: 14 }
});
