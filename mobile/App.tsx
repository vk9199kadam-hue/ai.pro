import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { HomeScreen } from './src/screens/HomeScreen';
import { DownloadsScreen } from './src/screens/DownloadsScreen';
import { CarouselScreen } from './src/screens/CarouselScreen';
import { EditorScreen } from './src/screens/EditorScreen';
import { ExportScreen } from './src/screens/ExportScreen';
import { ViralClip, RenderManifest } from './src/types';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'HOME' | 'CAROUSEL' | 'EDITOR' | 'EXPORT'>('HOME');
  const [activeTab, setActiveTab] = useState<'HOME' | 'DOWNLOADS'>('HOME');
  const [clips, setClips] = useState<ViralClip[]>([]);
  const [selectedClip, setSelectedClip] = useState<ViralClip | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [renderManifest, setRenderManifest] = useState<RenderManifest | null>(null);
  const [userId] = useState<string>('usr_dev_01');

  const handleClipsFound = (foundClips: ViralClip[], sourceUrl: string) => {
    setClips(foundClips);
    setVideoUrl(sourceUrl);
    setCurrentScreen('CAROUSEL');
  };

  const handleSelectClip = (clip: ViralClip) => {
    setSelectedClip(clip);
    setCurrentScreen('EDITOR');
  };

  const handleStartExport = (manifest: RenderManifest) => {
    setRenderManifest(manifest);
    setCurrentScreen('EXPORT');
  };

  const handleExportFinish = () => {
    setActiveTab('DOWNLOADS');
    setCurrentScreen('HOME');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {currentScreen === 'HOME' && (
        <View style={styles.mainShell}>
          <View style={styles.tabContent}>
            {activeTab === 'HOME' ? (
              <HomeScreen onClipsFound={handleClipsFound} userId={userId} />
            ) : (
              <DownloadsScreen />
            )}
          </View>

          {/* 2-Tab Bottom Navigation Bar */}
          <View style={styles.bottomNav}>
            <TouchableOpacity
              style={[styles.navItem, activeTab === 'HOME' && styles.navItemActive]}
              onPress={() => setActiveTab('HOME')}
            >
              <Text style={styles.navIcon}>🏠</Text>
              <Text style={[styles.navLabel, activeTab === 'HOME' && styles.navLabelActive]}>
                Home
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navItem, activeTab === 'DOWNLOADS' && styles.navItemActive]}
              onPress={() => setActiveTab('DOWNLOADS')}
            >
              <Text style={styles.navIcon}>🎬</Text>
              <Text style={[styles.navLabel, activeTab === 'DOWNLOADS' && styles.navLabelActive]}>
                Downloads
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {currentScreen === 'CAROUSEL' && (
        <CarouselScreen
          clips={clips}
          onSelectClip={handleSelectClip}
          onBack={() => setCurrentScreen('HOME')}
        />
      )}
      {currentScreen === 'EDITOR' && selectedClip && (
        <EditorScreen
          clip={selectedClip}
          videoUrl={videoUrl}
          onStartExport={handleStartExport}
          onBack={() => setCurrentScreen('CAROUSEL')}
        />
      )}
      {currentScreen === 'EXPORT' && renderManifest && selectedClip && (
        <ExportScreen
          manifest={renderManifest}
          clip={selectedClip}
          onFinish={handleExportFinish}
          onBackToCarousel={() => setCurrentScreen('CAROUSEL')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F15',
  },
  mainShell: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#141822',
    borderTopWidth: 1,
    borderTopColor: '#232938',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 12,
  },
  navItemActive: {
    backgroundColor: '#1F1B08',
  },
  navIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E9AA8',
  },
  navLabelActive: {
    color: '#FFE600',
  },
});
