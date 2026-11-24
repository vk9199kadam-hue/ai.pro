import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Dimensions } from 'react-native';
import { ViralClip } from '../types';

interface CarouselScreenProps {
  clips: ViralClip[];
  onSelectClip: (clip: ViralClip) => void;
  onBack: () => void;
}

const { width } = Dimensions.get('window');

export const CarouselScreen: React.FC<CarouselScreenProps> = ({ clips, onSelectClip, onBack }) => {
  return (
    <View style={styles.container}>
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
        renderItem={({ item }) => (
          <View style={styles.card}>
            {/* Virality Score Badge */}
            <View style={styles.cardHeader}>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreText}>🔥 {item.viral_score}/100 VIRAL</Text>
              </View>
              <Text style={styles.timeBadge}>{item.start_time_formatted} - {item.end_time_formatted} ({item.duration_seconds}s)</Text>
            </View>

            {/* Hook Headline */}
            <Text style={styles.hookTitle}>"{item.hook_title}"</Text>

            {/* Key Quote */}
            <View style={styles.quoteBox}>
              <Text style={styles.quoteLabel}>Attention Hook:</Text>
              <Text style={styles.quoteText}>{item.key_quote}</Text>
            </View>

            {/* Reason */}
            <Text style={styles.reasonText}>💡 {item.virality_reason}</Text>

            {/* Select Button */}
            <TouchableOpacity style={styles.selectButton} onPress={() => onSelectClip(item)}>
              <Text style={styles.selectButtonText}>✂️ Create Reel with this Moment</Text>
            </TouchableOpacity>
          </View>
        )}
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
  card: { backgroundColor: '#141822', borderRadius: 18, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#232938' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  scoreBadge: { backgroundColor: '#FF3B30', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  scoreText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  timeBadge: { color: '#8E9AA8', fontSize: 13, fontWeight: '600' },
  hookTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 12, lineHeight: 24 },
  quoteBox: { backgroundColor: '#0D0F15', borderRadius: 10, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#FFE600' },
  quoteLabel: { color: '#7E8B9B', fontSize: 11, fontWeight: '600', marginBottom: 3 },
  quoteText: { color: '#E2E8F0', fontSize: 13, fontStyle: 'italic' },
  reasonText: { color: '#94A3B8', fontSize: 12, marginBottom: 16, lineHeight: 18 },
  selectButton: { backgroundColor: '#FFE600', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  selectButtonText: { color: '#000', fontWeight: '700', fontSize: 14 }
});
