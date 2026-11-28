import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { analyzeYouTubeLink, getUserCredits, claimAdRewardCredit } from '../services/api';
import { ViralClip } from '../types';
import { AdBanner } from '../components/AdBanner';
import { showRewardedVideoAd } from '../services/admob';

interface HomeScreenProps {
  onClipsFound: (clips: ViralClip[], videoUrl: string) => void;
  userId: string;
}

const CLIP_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;

export const HomeScreen: React.FC<HomeScreenProps> = ({ onClipsFound, userId }) => {
  const [url, setUrl] = useState('');
  const [numClips, setNumClips] = useState<number>(3);
  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState(5);

  useEffect(() => {
    getUserCredits(userId).then(setCredits).catch(() => setCredits(5));
  }, [userId]);

  const handleAnalyze = async () => {
    const cleanUrl = url.trim().replace(/^['"]+|['"]+$/g, '');
    if (!cleanUrl) {
      Alert.alert('Missing URL', 'Please paste a valid YouTube video link.');
      return;
    }

    if (credits < 1) {
      Alert.alert('No Credits Left', 'Watch a quick 30s ad to get 1 free clip credit!', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Watch Ad (+1 Credit)', onPress: handleWatchAd }
      ]);
      return;
    }

    setLoading(true);
    try {
      const data = await analyzeYouTubeLink(cleanUrl, numClips);
      if (data.clips && data.clips.length > 0) {
        onClipsFound(data.clips, cleanUrl);
      } else {
        Alert.alert('No Viral Moments Found', 'Try another video with clear spoken audio.');
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message || 'Could not analyze video. Check your connection.';
      Alert.alert('Analysis Failed', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleWatchAd = async () => {
    try {
      await showRewardedVideoAd();
      const newBal = await claimAdRewardCredit(userId);
      setCredits(newBal);
      Alert.alert('🎉 Bonus Earned!', '+1 Free Clip Credit added to your balance.');
    } catch {
      Alert.alert('Ad Error', 'Could not load rewarded video. Please try again later.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header & Credit Balance */}
      <View style={styles.headerRow}>
        <Text style={styles.appTitle}>ClipSnap <Text style={styles.aiBadge}>AI</Text></Text>
        <TouchableOpacity style={styles.creditPill} onPress={handleWatchAd}>
          <Text style={styles.creditText}>⚡ {credits} Credits (+ Free)</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.tagline}>Turn Long YouTube Videos into Viral 9:16 Shorts in Seconds</Text>

      {/* Paste YouTube Link + Clip Count (Max 5) */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Paste YouTube / Podcast Link</Text>
        <TextInput
          style={styles.input}
          placeholder="https://youtube.com/watch?v=..."
          placeholderTextColor="#666"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
        />

        <Text style={styles.clipCountLabel}>Number of Shorts to Generate (Max 5)</Text>
        <View style={styles.clipCountRow}>
          {CLIP_COUNT_OPTIONS.map((count) => (
            <TouchableOpacity
              key={count}
              style={[styles.clipCountPill, numClips === count && styles.clipCountPillActive]}
              onPress={() => setNumClips(count)}
            >
              <Text style={[styles.clipCountText, numClips === count && styles.clipCountTextActive]}>
                {count} {count === 1 ? 'Clip' : 'Clips'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleAnalyze}
          disabled={loading}
        >
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#000" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>AI Finding {numClips} Hooks (~30s)...</Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>✨ Find {numClips} Viral Moments</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* AdMob Banner Dock */}
      <View style={{ marginTop: 22 }}>
        <AdBanner placement="inline" />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F15' },
  content: { padding: 20, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 15 },
  appTitle: { fontSize: 26, fontWeight: '800', color: '#FFF' },
  aiBadge: { color: '#FFE600' },
  creditPill: { backgroundColor: '#1E2330', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#FFE600' },
  creditText: { color: '#FFE600', fontWeight: '700', fontSize: 13 },
  tagline: { fontSize: 15, color: '#8E9AA8', marginBottom: 25 },
  card: { backgroundColor: '#141822', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#232938' },
  cardLabel: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 10 },
  input: { backgroundColor: '#0D0F15', borderRadius: 10, padding: 14, color: '#FFF', fontSize: 14, borderWidth: 1, borderColor: '#2A3142', marginBottom: 14 },
  clipCountLabel: { color: '#8E9AA8', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  clipCountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 16 },
  clipCountPill: { flex: 1, backgroundColor: '#0D0F15', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#2A3142' },
  clipCountPillActive: { backgroundColor: '#1F1B08', borderColor: '#FFE600' },
  clipCountText: { color: '#8E9AA8', fontSize: 11, fontWeight: '700' },
  clipCountTextActive: { color: '#FFE600' },
  primaryButton: { backgroundColor: '#FFE600', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#000', fontSize: 15, fontWeight: '700' },
});
