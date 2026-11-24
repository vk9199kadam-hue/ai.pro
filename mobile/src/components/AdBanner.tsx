import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ADMOB_CONFIG } from '../services/admob';

interface AdBannerProps {
  placement?: 'bottom_dock' | 'inline';
}

export const AdBanner: React.FC<AdBannerProps> = ({ placement = 'inline' }) => {
  return (
    <View style={[styles.container, placement === 'bottom_dock' && styles.bottomDock]}>
      <View style={styles.adPill}>
        <Text style={styles.adTag}>AD</Text>
        <Text style={styles.adTitle}>Google AdMob Test Banner</Text>
      </View>
      <Text style={styles.adUnit}>Unit: {ADMOB_CONFIG.BANNER_ID.slice(0, 24)}...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#141822',
    borderWidth: 1,
    borderColor: '#232938',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginVertical: 12,
  },
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 0,
    marginVertical: 0,
    borderTopWidth: 1,
    borderTopColor: '#232938',
    backgroundColor: '#0D0F15',
  },
  adPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  adTag: {
    backgroundColor: '#FFE600',
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    marginRight: 6,
  },
  adTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  adUnit: {
    color: '#667085',
    fontSize: 10,
  },
});
