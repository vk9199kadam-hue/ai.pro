import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { HomeScreen } from './src/screens/HomeScreen';
import { CarouselScreen } from './src/screens/CarouselScreen';
import { EditorScreen } from './src/screens/EditorScreen';
import { ExportScreen } from './src/screens/ExportScreen';
import { ViralClip, RenderManifest } from './src/types';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'HOME' | 'CAROUSEL' | 'EDITOR' | 'EXPORT'>('HOME');
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0F15" />
      {currentScreen === 'HOME' && (
        <HomeScreen onClipsFound={handleClipsFound} userId={userId} />
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
          onFinish={() => setCurrentScreen('HOME')}
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
});
