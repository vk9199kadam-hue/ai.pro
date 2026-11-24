import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { ViralClip, RenderManifest } from '../types';
import { prepareRenderManifest } from '../services/api';

interface EditorScreenProps {
  clip: ViralClip;
  videoUrl: string;
  onStartExport: (manifest: RenderManifest) => void;
  onBack: () => void;
}

export const EditorScreen: React.FC<EditorScreenProps> = ({ clip, videoUrl, onStartExport, onBack }) => {
  const [captionStyle, setCaptionStyle] = useState<'hype_yellow' | 'clean_white' | 'neon_glow'>('hype_yellow');
  const [creatorTag, setCreatorTag] = useState('@my_channel');
  const [preparing, setPreparing] = useState(false);

  const handleExport = async () => {
    setPreparing(true);
    try {
      const manifest = await prepareRenderManifest(
        `clip_${clip.clip_number}`,
        captionStyle,
        creatorTag
      );
      manifest.source_url = videoUrl;
      manifest.trim_start = clip.start_time_seconds;
      manifest.trim_end = clip.end_time_seconds;
      onStartExport(manifest);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not prepare render manifest');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Style & Captions</Text>
      </View>

      {/* 9:16 Vertical Preview Frame */}
      <View style={styles.previewBox}>
        <View style={styles.blurredBgSim}>
          <Text style={styles.bgLabel}>[ Blurred Background Layer ]</Text>
        </View>

        {/* Foreground Center Video Frame */}
        <View style={styles.fgVideoSim}>
          <Text style={styles.fgLabel}>Sharp 16:9 Video Centered</Text>
          <Text style={styles.timeTag}>{clip.start_time_formatted} - {clip.end_time_formatted}</Text>
        </View>

        {/* Subtitles Overlay Preview */}
        <View style={styles.subtitlesOverlay}>
          <Text style={[styles.captionWord, captionStyle === 'hype_yellow' && styles.hypeYellow]}>
            {clip.key_quote.split(' ').slice(0, 4).join(' ')}...
          </Text>
        </View>

        {/* Creator Tag Pill */}
        {creatorTag ? (
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>{creatorTag}</Text>
          </View>
        ) : null}
      </View>

      {/* Caption Style Options */}
      <Text style={styles.sectionTitle}>Animated Caption Style</Text>
      <View style={styles.styleRow}>
        <TouchableOpacity 
          style={[styles.styleOption, captionStyle === 'hype_yellow' && styles.styleSelected]}
          onPress={() => setCaptionStyle('hype_yellow')}
        >
          <Text style={styles.styleName}>⚡ Hype Yellow</Text>
          <Text style={styles.styleDesc}>Hormozi style with drop shadow</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.styleOption, captionStyle === 'clean_white' && styles.styleSelected]}
          onPress={() => setCaptionStyle('clean_white')}
        >
          <Text style={styles.styleName}>✨ Clean Minimal</Text>
          <Text style={styles.styleDesc}>Elegant white typography</Text>
        </TouchableOpacity>
      </View>

      {/* Watermark Tag Input */}
      <Text style={styles.sectionTitle}>Creator Watermark Tag</Text>
      <TextInput
        style={styles.tagInput}
        value={creatorTag}
        onChangeText={setCreatorTag}
        placeholder="@your_username"
        placeholderTextColor="#666"
      />

      {/* Start Render Button */}
      <TouchableOpacity 
        style={[styles.exportButton, preparing && styles.disabledButton]} 
        onPress={handleExport}
        disabled={preparing}
      >
        {preparing ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.exportButtonText}>🚀 Export 9:16 Reel (Media3)</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F15' },
  content: { padding: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 20, marginBottom: 15 },
  backText: { color: '#FFE600', fontWeight: '700', fontSize: 15, marginRight: 20 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  previewBox: { width: '100%', height: 360, backgroundColor: '#1A202C', borderRadius: 20, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginBottom: 20, position: 'relative' },
  blurredBgSim: { position: 'absolute', width: '100%', height: '100%', backgroundColor: '#2D3748', opacity: 0.5, justifyContent: 'center', alignItems: 'center' },
  bgLabel: { color: '#718096', fontSize: 11 },
  fgVideoSim: { width: '92%', height: 180, backgroundColor: '#000', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#4A5568' },
  fgLabel: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  timeTag: { color: '#FFE600', fontSize: 11, marginTop: 4 },
  subtitlesOverlay: { position: 'absolute', bottom: 40, paddingHorizontal: 15, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingVertical: 6 },
  captionWord: { fontSize: 16, fontWeight: '900', color: '#FFF', textAlign: 'center' },
  hypeYellow: { color: '#FFE600' },
  tagPill: { position: 'absolute', top: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#FFE600' },
  tagText: { color: '#FFE600', fontSize: 11, fontWeight: '700' },
  sectionTitle: { color: '#FFF', fontSize: 14, fontWeight: '700', marginBottom: 10, marginTop: 10 },
  styleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  styleOption: { flex: 0.48, backgroundColor: '#141822', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#232938' },
  styleSelected: { borderColor: '#FFE600', backgroundColor: '#1A2130' },
  styleName: { color: '#FFF', fontWeight: '700', fontSize: 13, marginBottom: 4 },
  styleDesc: { color: '#7E8B9B', fontSize: 11 },
  tagInput: { backgroundColor: '#141822', borderRadius: 10, padding: 14, color: '#FFF', fontSize: 14, borderWidth: 1, borderColor: '#232938', marginBottom: 25 },
  exportButton: { backgroundColor: '#FFE600', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  disabledButton: { opacity: 0.6 },
  exportButtonText: { color: '#000', fontWeight: '800', fontSize: 16 }
});

