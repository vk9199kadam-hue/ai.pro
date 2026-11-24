import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { analyzeYouTubeLink, getUserCredits, claimAdRewardCredit } from '../services/api';
import { ViralClip } from '../types';
import { AdBanner } from '../components/AdBanner';
import { showRewardedVideoAd } from '../services/admob';

interface HomeScreenProps {
  onClipsFound: (clips: ViralClip[], videoUrl: string) => void;
  userId: string;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onClipsFound, userId }) => {
  const [url, setUrl] = useState('');
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
      const data = await analyzeYouTubeLink(cleanUrl);
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

  const handlePickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      Alert.alert('Video Selected', `Local video ready: ${result.assets[0].fileName || 'MP4 video'}`);
    }
  };

  const handleWatchAd = async () => {
    try {
      // 1. Show Google AdMob Rewarded Video
      await showRewardedVideoAd();
      
      // 2. Claim credit on the backend ledger
      const newBal = await claimAdRewardCredit(userId);
      setCredits(newBal);
      Alert.alert('🎉 Bonus Earned!', '+1 Free Clip Credit added to your balance.');
    } catch (err) {
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

      <Text style={styles.tagline}>Turn Long Videos into Viral 9:16 Shorts in Seconds</Text>

      {/* Mode A: Paste YouTube Link */}
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

        <TouchableOpacity 
          style={[styles.primaryButton, loading && styles.buttonDisabled]} 
          onPress={handleAnalyze}
          disabled={loading}
        >
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#000" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>AI Finding Hooks (~30s)...</Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>✨ Find Viral Moments</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.dividerText}>── OR ──</Text>

      {/* Mode B: Direct MP4 Upload from Phone */}
      <TouchableOpacity style={styles.uploadCard} onPress={handlePickVideo}>
        <Text style={styles.uploadIcon}>📁</Text>
        <Text style={styles.uploadTitle}>Pick MP4 from Phone Gallery</Text>
        <Text style={styles.uploadSub}>100% reliable · No YouTube blocks · Works offline</Text>
      </TouchableOpacity>

      {/* AdMob Banner Dock */}
      <AdBanner placement="inline" />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F15' },
  content: { padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, marginBottom: 15 },
  appTitle: { fontSize: 26, fontWeight: '800', color: '#FFF' },
  aiBadge: { color: '#FFE600' },
  creditPill: { backgroundColor: '#1E2330', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#FFE600' },
  creditText: { color: '#FFE600', fontWeight: '700', fontSize: 13 },
  tagline: { fontSize: 15, color: '#8E9AA8', marginBottom: 25 },
  card: { backgroundColor: '#141822', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#232938' },
  cardLabel: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 10 },
  input: { backgroundColor: '#0D0F15', borderRadius: 10, padding: 14, color: '#FFF', fontSize: 14, borderWidth: 1, borderColor: '#2A3142', marginBottom: 15 },
  primaryButton: { backgroundColor: '#FFE600', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#000', fontSize: 15, fontWeight: '700' },
  dividerText: { textAlign: 'center', color: '#4E5768', marginVertical: 20, fontWeight: '700' },
  uploadCard: { backgroundColor: '#141822', borderRadius: 16, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: '#232938', borderStyle: 'dashed' },
  uploadIcon: { fontSize: 32, marginBottom: 8 },
  uploadTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  uploadSub: { color: '#7E8B9B', fontSize: 12, marginTop: 4 },
});
