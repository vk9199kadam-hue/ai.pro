import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  Image,
  Dimensions,
  Platform,
  StatusBar,
  Switch,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ViralClip, RenderManifest, EditorSession, CaptionWord } from '../types';
import { saveProjectDraft, loadLatestProjectDraft } from '../services/storage';
import { resolveMediaUrl } from '../services/api';

interface EditorScreenProps {
  clip: ViralClip;
  videoUrl: string;
  onStartExport: (manifest: RenderManifest) => void;
  onBack: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_WIDTH = Math.min(SCREEN_WIDTH - 60, 240);
const CANVAS_HEIGHT = Math.round(CANVAS_WIDTH * (16 / 9)); // Exactly 9:16 aspect ratio
const STATUSBAR_OFFSET = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight || 0, 48) + 24 : 54;

export const EditorScreen: React.FC<EditorScreenProps> = ({
  clip,
  videoUrl,
  onStartExport,
  onBack,
}) => {
  // Unique clip identifier (e.g. JTwu8i9Ys5U_1) preventing collisions across different videos
  const uniqueClipId = useMemo(() => {
    if (clip.clip_id) return clip.clip_id;
    if (clip.preview_url) {
      const parts = clip.preview_url.split('/');
      return parts[parts.length - 1].replace('.mp4', '');
    }
    return `clip_${clip.clip_number}`;
  }, [clip]);

  // Resolve streaming video URL via direct local Wi-Fi connection
  const streamUrl = useMemo(() => {
    return resolveMediaUrl(clip.preview_url || `/media/clips/fgkPdZd7pXM_${clip.clip_number}.mp4`);
  }, [clip]);

  // Video Player for Live WYSIWYG Preview
  const player = useVideoPlayer(
    {
      uri: streamUrl,
    },
    (p) => {
      p.loop = true;
      p.play();
    }
  );

  useEffect(() => {
    if (streamUrl) {
      try {
        player.replace({ uri: streamUrl });
        player.play();
      } catch (err) {
        console.log('[EditorScreen] Video player replace error:', err);
      }
    }
  }, [streamUrl, player]);

  // Initial words from transcript
  const initialWords: CaptionWord[] = useMemo(() => {
    const rawText = clip.social_kit?.full_transcript || clip.key_quote || 'Viral short clip';
    const wordsList = rawText.split(/\s+/).filter(Boolean);
    const duration = clip.duration_seconds || 45;
    const timePerWord = duration / Math.max(wordsList.length, 1);

    return wordsList.map((w, idx) => ({
      id: `w_${idx}`,
      word: w,
      start: Number((idx * timePerWord).toFixed(2)),
      end: Number(((idx + 1) * timePerWord).toFixed(2)),
      isDeleted: false,
    }));
  }, [clip]);

  // Active Tool Tab State
  type ToolTab = 'layout' | 'captions' | 'hook' | 'brand' | 'trim';
  const [activeTab, setActiveTab] = useState<ToolTab>('captions');

  // Core Editor Session State
  const [session, setSession] = useState<EditorSession>({
    projectId: `proj_${clip.clip_number}_${Date.now()}`,
    clipId: `clip_${clip.clip_number}`,
    sourceVideoUri: streamUrl,
    originalDuration: clip.duration_seconds || 45,
    lastModifiedTimestamp: Date.now(),
    trimRange: {
      startSeconds: 0,
      endSeconds: clip.duration_seconds || 45,
    },
    layout: {
      mode: 'blur_9_16',
      blurRadius: 18,
      horizontalOffset: 0,
    },
    hook: {
      enabled: true,
      text: clip.hook_title || '100 वर्षांपासून एकच चव!',
      displayDuration: 3.5,
      positionNormalizedY: 0.08,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      textColor: '#FFE600',
    },
    captions: {
      enabled: true,
      style: 'hype_yellow',
      positionNormalizedY: 0.72,
      fontSizeRatio: 0.038,
      words: initialWords,
    },
    branding: {
      enabled: true,
      type: 'text',
      watermarkText: '@ClipSnapAI',
      logoUri: null,
      position: 'bottom_right',
      opacity: 0.75,
      normalizedScale: 0.12,
    },
    audio: {
      voiceVolume: 1.0,
      bgmTrackId: null,
      bgmVolume: 0.18,
      duckingRatio: 0.18,
    },
    exportPreset: {
      resolution: '1080p',
      fps: 30,
      bitrateMbps: 12,
      platform: 'youtube_shorts',
    },
  });

  // Playback position tracker (for active word highlight and hook banner visibility)
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStatusText, setExportStatusText] = useState<string>('');

  // Manual Word Editor Modal State
  const [isWordEditorOpen, setIsWordEditorOpen] = useState<boolean>(false);
  const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null);
  const [editWordText, setEditWordText] = useState<string>('');

  // Undo / Redo Stacks
  const undoStack = useRef<EditorSession[]>([]);
  const redoStack = useRef<EditorSession[]>([]);

  const pushStateChange = (newSession: EditorSession) => {
    undoStack.current.push({ ...session });
    redoStack.current = []; // Clear redo on new action
    setSession(newSession);
    saveProjectDraft(newSession); // Auto-save to SQLite
  };

  const handleUndo = () => {
    if (undoStack.current.length > 0) {
      const prev = undoStack.current.pop()!;
      redoStack.current.push({ ...session });
      setSession(prev);
    }
  };

  const handleRedo = () => {
    if (redoStack.current.length > 0) {
      const next = redoStack.current.pop()!;
      undoStack.current.push({ ...session });
      setSession(next);
    }
  };

  // Poll video player time update
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        if (player) {
          const t = player.currentTime || 0;
          setCurrentTime(t);
          setIsPlaying(player.playing);
        }
      } catch {}
    }, 150);
    return () => clearInterval(interval);
  }, [player]);

  // Reset session and load previous draft ONLY if it matches the current clip's unique ID and video stream
  useEffect(() => {
    (async () => {
      try {
        const draft = await loadLatestProjectDraft(uniqueClipId);
        if (draft && (draft.clipId === uniqueClipId || draft.sourceVideoUri === streamUrl)) {
          setSession({
            ...draft,
            clipId: uniqueClipId,
            sourceVideoUri: streamUrl,
          });
          return;
        }
      } catch (e) {
        console.log('[EditorScreen] Draft load notice:', e);
      }

      // Fresh session for new clip
      setSession({
        projectId: `proj_${uniqueClipId}_${Date.now()}`,
        clipId: uniqueClipId,
        sourceVideoUri: streamUrl,
        originalDuration: clip.duration_seconds || 45,
        lastModifiedTimestamp: Date.now(),
        trimRange: {
          startSeconds: 0,
          endSeconds: clip.duration_seconds || 45,
        },
        layout: {
          mode: 'blur_9_16',
          blurRadius: 18,
          horizontalOffset: 0,
        },
        hook: {
          enabled: true,
          text: clip.hook_title || 'Viral Short',
          displayDuration: 3.5,
          positionNormalizedY: 0.08,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          textColor: '#FFE600',
        },
        captions: {
          enabled: true,
          style: 'hype_yellow',
          positionNormalizedY: 0.72,
          fontSizeRatio: 0.038,
          words: initialWords,
        },
        branding: {
          enabled: true,
          type: 'text',
          watermarkText: '@ClipSnapAI',
          logoUri: null,
          position: 'bottom_right',
          opacity: 0.8,
          normalizedScale: 0.12,
        },
        audio: {
          voiceVolume: 1.0,
          bgmTrackId: null,
          bgmVolume: 0.2,
          duckingRatio: 0.18,
        },
        exportPreset: {
          resolution: '1080p',
          fps: 30,
          bitrateMbps: 8,
          platform: 'youtube_shorts',
        },
      });
    })();
  }, [clip, uniqueClipId, streamUrl]);

  // Active Spoken Caption Words (Grouped into chunks of 3-4 words for dynamic popping)
  const currentSpokenPhrase = useMemo(() => {
    if (!session.captions.enabled) return '';
    const activeWords = session.captions.words.filter(w => !w.isDeleted);
    const activeWord = activeWords.find(w => currentTime >= w.start && currentTime <= w.end);
    if (!activeWord) {
      // Find closest word in window
      const closestIdx = activeWords.findIndex(w => w.start > currentTime);
      if (closestIdx > 0) {
        return activeWords[closestIdx - 1]?.word || '';
      }
      return activeWords[0]?.word || '';
    }
    return activeWord.word;
  }, [session.captions, currentTime]);

  // 1-Tap Rule-Based "Magic Auto-Edit" Preset
  const handleMagicAutoEdit = () => {
    const updated: EditorSession = {
      ...session,
      layout: {
        mode: 'blur_9_16',
        blurRadius: 20,
        horizontalOffset: 0,
      },
      hook: {
        ...session.hook,
        enabled: true,
        text: clip.hook_title || '100 वर्षांपासून एकच चव!',
        displayDuration: 3.5,
        backgroundColor: 'rgba(0,0,0,0.85)',
        textColor: '#FFE600',
      },
      captions: {
        ...session.captions,
        enabled: true,
        style: 'hype_yellow',
        positionNormalizedY: 0.72,
        fontSizeRatio: 0.040,
      },
      branding: {
        ...session.branding,
        enabled: true,
        position: 'bottom_right',
        opacity: 0.8,
      },
    };
    pushStateChange(updated);
    Alert.alert('✨ Magic Auto-Edit Applied!', 'Optimal 9:16 blurred background, Hype Yellow captions, and attention hook configured!');
  };

  // Reset to Original AI Settings
  const handleResetToAI = () => {
    const resetSession: EditorSession = {
      ...session,
      trimRange: { startSeconds: 0, endSeconds: clip.duration_seconds || 45 },
      layout: { mode: 'blur_9_16', blurRadius: 18, horizontalOffset: 0 },
      hook: {
        enabled: true,
        text: clip.hook_title,
        displayDuration: 3.5,
        positionNormalizedY: 0.08,
        backgroundColor: 'rgba(0,0,0,0.85)',
        textColor: '#FFE600',
      },
      captions: {
        enabled: true,
        style: 'hype_yellow',
        positionNormalizedY: 0.72,
        fontSizeRatio: 0.038,
        words: initialWords,
      },
      branding: {
        ...session.branding,
        enabled: true,
      },
    };
    pushStateChange(resetSession);
  };

  // Logo PNG Picker from Phone Gallery
  const handlePickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedUri = result.assets[0].uri;
      const updated: EditorSession = {
        ...session,
        branding: {
          ...session.branding,
          type: 'logo',
          logoUri: selectedUri,
          enabled: true,
        },
      };
      pushStateChange(updated);
    }
  };

  // Save edited word
  const handleSaveWordEdit = () => {
    if (editingWordIndex !== null) {
      const updatedWords = [...session.captions.words];
      updatedWords[editingWordIndex] = {
        ...updatedWords[editingWordIndex],
        word: editWordText.trim(),
      };
      const updated: EditorSession = {
        ...session,
        captions: {
          ...session.captions,
          words: updatedWords,
        },
      };
      pushStateChange(updated);
      setIsWordEditorOpen(false);
      setEditingWordIndex(null);
    }
  };

  // Delete word (filler word suppression)
  const handleDeleteWord = (index: number) => {
    const updatedWords = [...session.captions.words];
    updatedWords[index] = {
      ...updatedWords[index],
      isDeleted: true,
    };
    const updated: EditorSession = {
      ...session,
      captions: {
        ...session.captions,
        words: updatedWords,
      },
    };
    pushStateChange(updated);
    setIsWordEditorOpen(false);
  };

  // Trigger MP4 Export with 9:16 layout, captions & hook
  const handleExportFinal = async () => {
    const targetLayout = session.layout.mode === 'fill_crop'
      ? 'center_crop'
      : session.layout.mode === 'fit_black'
      ? 'fit_black'
      : 'blurred_fill';

    let logoBase64: string | undefined = undefined;
    if (session.branding.enabled && session.branding.logoUri) {
      try {
        logoBase64 = await FileSystem.readAsStringAsync(session.branding.logoUri, {
          encoding: 'base64',
        });
      } catch (e) {
        console.warn('[EditorScreen] Could not read logoUri as base64:', e);
      }
    }

    // Construct final RenderManifest for saver
    const manifest: RenderManifest = {
      clip_id: uniqueClipId,
      source_url: clip.preview_url ? resolveMediaUrl(clip.preview_url) : streamUrl,
      trim_start: session.trimRange.startSeconds,
      trim_end: session.trimRange.endSeconds,
      target_width: session.exportPreset.resolution === '1080p' ? 1080 : 720,
      target_height: session.exportPreset.resolution === '1080p' ? 1920 : 1280,
      layout: targetLayout,
      caption_style: session.captions.style === 'clean_white' ? 'clean_white' : 'hype_yellow',
      captions_enabled: session.captions.enabled,
      creator_tag: session.branding.enabled ? session.branding.watermarkText : undefined,
      hook_text: session.hook.enabled ? session.hook.text : undefined,
      hook_enabled: session.hook.enabled,
      watermark_text: session.branding.enabled ? session.branding.watermarkText : undefined,
      watermark_enabled: session.branding.enabled,
      watermark_position: session.branding.position,
      logo_uri: session.branding.enabled && session.branding.logoUri ? session.branding.logoUri : undefined,
      logo_base64: logoBase64,
      words: session.captions.words
        .filter(w => !w.isDeleted)
        .map(w => ({
          word: w.word,
          start: w.start,
          end: w.end,
          highlight: true,
        })),
    };

    console.log('[EditorScreen] Launching export with manifest:', {
      clip_id: manifest.clip_id,
      source_url: manifest.source_url,
      hook_text: manifest.hook_text,
      layout: manifest.layout,
      wordsCount: manifest.words.length,
    });

    onStartExport(manifest);
  };

  // Helper for 4-corner watermark styling
  const getWatermarkPositionStyle = (pos: string) => {
    switch (pos) {
      case 'top_left':
        return { top: 12, left: 12 };
      case 'top_right':
        return { top: 12, right: 12 };
      case 'bottom_left':
        return { bottom: 12, left: 12 };
      case 'bottom_right':
      default:
        return { bottom: 12, right: 12 };
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. Header with Undo/Redo & Export */}
      <View style={styles.topHeader}>
        <TouchableOpacity 
          onPress={() => {
            console.log('[EditorScreen] Back tapped -> navigating to carousel');
            onBack();
          }} 
          style={styles.headerBtn}
          hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
          activeOpacity={0.7}
        >
          <Text style={styles.headerBtnText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.historyControls}>
          <TouchableOpacity 
            onPress={handleUndo} 
            disabled={undoStack.current.length === 0}
            style={[styles.historyBtn, undoStack.current.length === 0 && styles.btnDisabled]}
            hitSlop={{ top: 20, bottom: 20, left: 15, right: 15 }}
          >
            <Text style={styles.historyBtnText}>↩</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleRedo} 
            disabled={redoStack.current.length === 0}
            style={[styles.historyBtn, redoStack.current.length === 0 && styles.btnDisabled]}
            hitSlop={{ top: 20, bottom: 20, left: 15, right: 15 }}
          >
            <Text style={styles.historyBtnText}>↪</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          onPress={() => {
            console.log('[EditorScreen] Export tapped -> starting render pipeline');
            handleExportFinal();
          }} 
          style={styles.exportHeaderBtn}
          hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
          activeOpacity={0.75}
        >
          <Text style={styles.exportHeaderBtnText}>🚀 Export</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* 2. WYSIWYG 9:16 PREVIEW CANVAS */}
        <View style={styles.canvasWrapper}>
          <View style={[styles.canvasBox, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }]}>
            
            {/* Background Layer: Aesthetic Ambient Glowing 9:16 Gradient */}
            {session.layout.mode === 'blur_9_16' ? (
              <LinearGradient
                colors={['#1E1B4B', '#0F172A', '#312E81']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
            ) : (
              <View style={[
                styles.canvasBgSolid, 
                { backgroundColor: session.layout.mode === 'fill_crop' ? '#000' : '#0F172A' }
              ]} />
            )}

            {/* Foreground Main Video (Single clean hardware surface) */}
            <View style={[
              styles.canvasFgVideo,
              session.layout.mode === 'fill_crop' && styles.canvasFgVideoFull
            ]}>
              <VideoView
                style={styles.fgVideoElement}
                player={player}
                nativeControls={true}
                contentFit={session.layout.mode === 'fill_crop' ? 'cover' : 'contain'}
              />
            </View>

            {/* Opening Hook Headline Banner (0 to 3.5s) */}
            {session.hook.enabled && currentTime <= session.hook.displayDuration ? (
              <View style={[
                styles.hookBannerContainer, 
                { backgroundColor: session.hook.backgroundColor }
              ]}>
                <Text style={[styles.hookBannerText, { color: session.hook.textColor }]}>
                  🔥 {session.hook.text}
                </Text>
              </View>
            ) : null}

            {/* Dynamic Animated Subtitle Banner */}
            {session.captions.enabled && currentSpokenPhrase ? (
              <View style={[
                styles.captionContainer,
                session.captions.style === 'hype_yellow' && styles.captionContainerYellow,
                session.captions.style === 'clean_white' && styles.captionContainerWhite,
              ]}>
                <Text style={[
                  styles.captionText,
                  session.captions.style === 'hype_yellow' && styles.captionTextYellow,
                  session.captions.style === 'clean_white' && styles.captionTextWhite,
                ]}>
                  {currentSpokenPhrase}
                </Text>
              </View>
            ) : null}

            {/* Watermark / Creator Branding Overlay */}
            {session.branding.enabled ? (
              <View style={[
                styles.watermarkOverlay, 
                getWatermarkPositionStyle(session.branding.position),
                { opacity: session.branding.opacity, alignItems: session.branding.position.includes('left') ? 'flex-start' : 'flex-end' }
              ]}>
                {session.branding.logoUri ? (
                  <Image 
                    source={{ uri: session.branding.logoUri }} 
                    style={styles.watermarkLogoImage} 
                    resizeMode="contain" 
                  />
                ) : null}
                {session.branding.watermarkText.trim() ? (
                  <View style={styles.watermarkTextBadge}>
                    <Text style={styles.watermarkTextLabel}>
                      {session.branding.watermarkText}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Video Playhead Overlay */}
            <View style={styles.timeTicker}>
              <Text style={styles.timeTickerText}>
                ⏱️ {currentTime.toFixed(1)}s / {clip.duration_seconds}s
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Magic 1-Tap Auto-Edit & Reset Bar */}
        <View style={styles.magicBar}>
          <TouchableOpacity style={styles.magicBtn} onPress={handleMagicAutoEdit}>
            <Text style={styles.magicBtnText}>✨ Magic Auto-Edit (1-Tap)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetBtn} onPress={handleResetToAI}>
            <Text style={styles.resetBtnText}>🔄 Reset AI</Text>
          </TouchableOpacity>
        </View>

        {/* 4. Tool Category Pills Navigation */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillBar}>
          <TouchableOpacity 
            style={[styles.pill, activeTab === 'captions' && styles.pillActive]} 
            onPress={() => setActiveTab('captions')}
          >
            <Text style={[styles.pillText, activeTab === 'captions' && styles.pillTextActive]}>
              💬 Captions
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.pill, activeTab === 'layout' && styles.pillActive]} 
            onPress={() => setActiveTab('layout')}
          >
            <Text style={[styles.pillText, activeTab === 'layout' && styles.pillTextActive]}>
              🔘 Layout
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.pill, activeTab === 'brand' && styles.pillActive]} 
            onPress={() => setActiveTab('brand')}
          >
            <Text style={[styles.pillText, activeTab === 'brand' && styles.pillTextActive]}>
              ✨ Watermark
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.pill, activeTab === 'hook' && styles.pillActive]} 
            onPress={() => setActiveTab('hook')}
          >
            <Text style={[styles.pillText, activeTab === 'hook' && styles.pillTextActive]}>
              🏷️ Hook Banner
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.pill, activeTab === 'trim' && styles.pillActive]} 
            onPress={() => setActiveTab('trim')}
          >
            <Text style={[styles.pillText, activeTab === 'trim' && styles.pillTextActive]}>
              ✂️ Trimmer
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* 5. DYNAMIC CONTEXTUAL TOOL CONTROLS */}
        <View style={styles.toolControlCard}>
          
          {/* TAB 1: CAPTIONS & SUBTITLES */}
          {activeTab === 'captions' && (
            <View>
              <View style={styles.toggleHeaderRow}>
                <Text style={[styles.toolTitle, { marginBottom: 0 }]}>Animated Subtitles</Text>
                <View style={styles.toggleWrap}>
                  <Text style={styles.toggleLabel}>{session.captions.enabled ? 'ON' : 'OFF'}</Text>
                  <Switch
                    value={session.captions.enabled}
                    onValueChange={(val) => {
                      pushStateChange({
                        ...session,
                        captions: { ...session.captions, enabled: val },
                      });
                    }}
                    trackColor={{ false: '#2A3142', true: '#FFE600' }}
                    thumbColor={session.captions.enabled ? '#000' : '#8E9AA8'}
                  />
                </View>
              </View>
              <View style={[styles.optionRow, !session.captions.enabled && { opacity: 0.45 }]}>
                <TouchableOpacity 
                  style={[styles.stylePill, session.captions.style === 'hype_yellow' && styles.stylePillActive]}
                  onPress={() => {
                    pushStateChange({
                      ...session,
                      captions: { ...session.captions, style: 'hype_yellow', enabled: true },
                    });
                  }}
                >
                  <Text style={styles.stylePillTitle}>🟡 Hype Yellow</Text>
                  <Text style={styles.stylePillSub}>Alex Hormozi viral look</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.stylePill, session.captions.style === 'clean_white' && styles.stylePillActive]}
                  onPress={() => {
                    pushStateChange({
                      ...session,
                      captions: { ...session.captions, style: 'clean_white', enabled: true },
                    });
                  }}
                >
                  <Text style={styles.stylePillTitle}>⚪ Clean White</Text>
                  <Text style={styles.stylePillSub}>Modern minimalist text</Text>
                </TouchableOpacity>
              </View>

              {/* Tap to Edit Spoken Words */}
              <TouchableOpacity 
                style={styles.actionRowBtn} 
                onPress={() => setIsWordEditorOpen(true)}
              >
                <Text style={styles.actionRowBtnText}>✍️ Edit Individual Spoken Words ({session.captions.words.length})</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* TAB 2: LAYOUT & BACKGROUND BLUR */}
          {activeTab === 'layout' && (
            <View>
              <Text style={styles.toolTitle}>9:16 Vertical Composition</Text>
              <View style={styles.optionRow}>
                <TouchableOpacity 
                  style={[styles.stylePill, session.layout.mode === 'blur_9_16' && styles.stylePillActive]}
                  onPress={() => {
                    pushStateChange({
                      ...session,
                      layout: { ...session.layout, mode: 'blur_9_16' },
                    });
                  }}
                >
                  <Text style={styles.stylePillTitle}>🌟 Blurred Fill</Text>
                  <Text style={styles.stylePillSub}>Aesthetic background video</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.stylePill, session.layout.mode === 'fit_black' && styles.stylePillActive]}
                  onPress={() => {
                    pushStateChange({
                      ...session,
                      layout: { ...session.layout, mode: 'fit_black' },
                    });
                  }}
                >
                  <Text style={styles.stylePillTitle}>⬛ Solid Black</Text>
                  <Text style={styles.stylePillSub}>Clean letterbox bars</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.stylePill, session.layout.mode === 'fill_crop' && styles.stylePillActive]}
                  onPress={() => {
                    pushStateChange({
                      ...session,
                      layout: { ...session.layout, mode: 'fill_crop' },
                    });
                  }}
                >
                  <Text style={styles.stylePillTitle}>🔍 Full Crop</Text>
                  <Text style={styles.stylePillSub}>Fills entire vertical canvas</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* TAB 3: WATERMARK & BRANDING */}
          {activeTab === 'brand' && (
            <View>
              <View style={styles.toggleHeaderRow}>
                <Text style={[styles.toolTitle, { marginBottom: 0 }]}>Watermark & Brand Suite</Text>
                <View style={styles.toggleWrap}>
                  <Text style={styles.toggleLabel}>{session.branding.enabled ? 'ON' : 'OFF'}</Text>
                  <Switch
                    value={session.branding.enabled}
                    onValueChange={(val) => {
                      pushStateChange({
                        ...session,
                        branding: { ...session.branding, enabled: val },
                      });
                    }}
                    trackColor={{ false: '#2A3142', true: '#FFE600' }}
                    thumbColor={session.branding.enabled ? '#000' : '#8E9AA8'}
                  />
                </View>
              </View>
              
              <Text style={styles.subLabel}>Social Handle Text (shown with Logo)</Text>
              <TextInput
                style={styles.textInput}
                value={session.branding.watermarkText}
                onChangeText={(text) => {
                  setSession({
                    ...session,
                    branding: { ...session.branding, watermarkText: text, enabled: true },
                  });
                }}
                placeholder="@my_channel"
                placeholderTextColor="#666"
              />

              {/* 4-Corner Placement */}
              <Text style={styles.subLabel}>Watermark Position</Text>
              <View style={styles.cornerGrid}>
                {(['top_left', 'top_right', 'bottom_left', 'bottom_right'] as const).map((pos) => (
                  <TouchableOpacity
                    key={pos}
                    style={[
                      styles.cornerBtn,
                      session.branding.position === pos && styles.cornerBtnActive,
                    ]}
                    onPress={() => {
                      pushStateChange({
                        ...session,
                        branding: { ...session.branding, position: pos },
                      });
                    }}
                  >
                    <Text style={styles.cornerBtnText}>
                      {pos.replace('_', ' ').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Pick PNG Logo */}
              <View style={styles.logoActionRow}>
                <TouchableOpacity style={[styles.pickLogoBtn, { flex: 1 }]} onPress={handlePickLogo}>
                  <Text style={styles.pickLogoBtnText}>
                    {session.branding.logoUri ? '🔄 Change PNG Logo' : '📁 Pick PNG Logo'}
                  </Text>
                </TouchableOpacity>
                {session.branding.logoUri ? (
                  <TouchableOpacity
                    style={styles.removeLogoBtn}
                    onPress={() => {
                      pushStateChange({
                        ...session,
                        branding: { ...session.branding, logoUri: null, type: 'text' },
                      });
                    }}
                  >
                    <Text style={styles.removeLogoBtnText}>✕ Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {session.branding.logoUri ? (
                <View style={styles.logoPreviewBar}>
                  <Image source={{ uri: session.branding.logoUri }} style={styles.logoThumbSmall} resizeMode="contain" />
                  <Text style={styles.logoPreviewNote}>PNG Logo + Social Handle will appear together</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* TAB 4: HOOK HEADLINE BANNER */}
          {activeTab === 'hook' && (
            <View>
              <Text style={styles.toolTitle}>Opening Attention Hook Banner</Text>
              <Text style={styles.subLabel}>Banner Text (Appears 0–3.5s)</Text>
              <TextInput
                style={styles.textInput}
                value={session.hook.text}
                onChangeText={(text) => {
                  setSession({
                    ...session,
                    hook: { ...session.hook, text, enabled: true },
                  });
                }}
                placeholder="Hook Headline..."
                placeholderTextColor="#666"
              />
              <View style={styles.hookToggleRow}>
                <Text style={styles.subLabel}>Banner Active:</Text>
                <TouchableOpacity 
                  style={[styles.toggleBtn, session.hook.enabled && styles.toggleBtnActive]}
                  onPress={() => {
                    pushStateChange({
                      ...session,
                      hook: { ...session.hook, enabled: !session.hook.enabled },
                    });
                  }}
                >
                  <Text style={styles.toggleBtnText}>{session.hook.enabled ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* TAB 5: TRIMMER */}
          {activeTab === 'trim' && (
            <View>
              <Text style={styles.toolTitle}>Clip Trimmer & Cut Boundaries</Text>
              <Text style={styles.subLabel}>
                Start: {session.trimRange.startSeconds.toFixed(1)}s  ·  End: {session.trimRange.endSeconds.toFixed(1)}s
              </Text>
              <View style={styles.trimButtonsRow}>
                <TouchableOpacity 
                  style={styles.trimNudgeBtn}
                  onPress={() => {
                    const newStart = Math.max(0, session.trimRange.startSeconds - 1);
                    pushStateChange({
                      ...session,
                      trimRange: { ...session.trimRange, startSeconds: newStart },
                    });
                  }}
                >
                  <Text style={styles.trimNudgeBtnText}>-1s Start</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.trimNudgeBtn}
                  onPress={() => {
                    const newStart = Math.min(session.trimRange.endSeconds - 5, session.trimRange.startSeconds + 1);
                    pushStateChange({
                      ...session,
                      trimRange: { ...session.trimRange, startSeconds: newStart },
                    });
                  }}
                >
                  <Text style={styles.trimNudgeBtnText}>+1s Start</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.trimNudgeBtn}
                  onPress={() => {
                    const newEnd = Math.max(session.trimRange.startSeconds + 5, session.trimRange.endSeconds - 1);
                    pushStateChange({
                      ...session,
                      trimRange: { ...session.trimRange, endSeconds: newEnd },
                    });
                  }}
                >
                  <Text style={styles.trimNudgeBtnText}>-1s End</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.trimNudgeBtn}
                  onPress={() => {
                    const newEnd = Math.min(clip.duration_seconds || 45, session.trimRange.endSeconds + 1);
                    pushStateChange({
                      ...session,
                      trimRange: { ...session.trimRange, endSeconds: newEnd },
                    });
                  }}
                >
                  <Text style={styles.trimNudgeBtnText}>+1s End</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

        </View>
      </ScrollView>

      {/* 6. MODAL: Manual Word-Level Caption Editor */}
      <Modal visible={isWordEditorOpen} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>✍️ Edit Spoken Words</Text>
            <TouchableOpacity onPress={() => setIsWordEditorOpen(false)}>
              <Text style={styles.modalCloseText}>✕ Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.wordsList}>
            {session.captions.words.map((item, idx) => {
              if (item.isDeleted) return null;
              return (
                <View key={item.id} style={styles.wordItemRow}>
                  <View style={styles.wordInfo}>
                    <Text style={styles.wordText}>{item.word}</Text>
                    <Text style={styles.wordTime}>{item.start}s - {item.end}s</Text>
                  </View>
                  <View style={styles.wordActions}>
                    <TouchableOpacity 
                      style={styles.editWordBtn}
                      onPress={() => {
                        setEditingWordIndex(idx);
                        setEditWordText(item.word);
                      }}
                    >
                      <Text style={styles.editWordBtnText}>✏️ Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.deleteWordBtn}
                      onPress={() => handleDeleteWord(idx)}
                    >
                      <Text style={styles.deleteWordBtnText}>🗑️ Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Sub-Editor popup for single word text input */}
          {editingWordIndex !== null && (
            <View style={styles.wordEditPopup}>
              <Text style={styles.subLabel}>Edit Word Text:</Text>
              <TextInput
                style={styles.textInput}
                value={editWordText}
                onChangeText={setEditWordText}
                autoFocus
              />
              <View style={styles.popupActionRow}>
                <TouchableOpacity 
                  style={styles.popupCancelBtn} 
                  onPress={() => setEditingWordIndex(null)}
                >
                  <Text style={styles.popupCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.popupSaveBtn} 
                  onPress={handleSaveWordEdit}
                >
                  <Text style={styles.popupSaveText}>Save Word</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* 7. MODAL: Exporting & 5-Point Verification Progress */}
      <Modal visible={isExporting} transparent animationType="fade">
        <View style={styles.exportModalBg}>
          <View style={styles.exportModalCard}>
            <ActivityIndicator size="large" color="#FFE600" />
            <Text style={styles.exportProgressTitle}>Rendering 1080p MP4...</Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${exportProgress}%` }]} />
            </View>
            <Text style={styles.exportProgressPercent}>{exportProgress}%</Text>
            <Text style={styles.exportProgressStatus}>{exportStatusText}</Text>
            <TouchableOpacity 
              style={styles.cancelExportBtn} 
              onPress={() => setIsExporting(false)}
            >
              <Text style={styles.cancelExportText}>Cancel Export</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0C10' },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: STATUSBAR_OFFSET,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A202C',
    backgroundColor: '#0A0C10',
    zIndex: 999,
    elevation: 10,
  },
  headerBtn: { 
    paddingVertical: 10, 
    paddingHorizontal: 16,
    backgroundColor: '#141822',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#232938',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  headerBtnText: { color: '#FFE600', fontWeight: '800', fontSize: 14 },
  historyControls: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  historyBtn: { backgroundColor: '#1A202C', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  btnDisabled: { opacity: 0.25 },
  historyBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  exportHeaderBtn: { 
    backgroundColor: '#FFE600', 
    paddingHorizontal: 20, 
    paddingVertical: 10, 
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFE600',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 1000,
  },
  exportHeaderBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },

  scrollArea: { flex: 1 },
  scrollContent: { alignItems: 'center', paddingVertical: 14 },

  /* WYSIWYG 9:16 Canvas Box */
  canvasWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 12,
  },
  canvasBox: {
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: '#232938',
  },
  canvasBgBlur: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  bgVideoElement: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 2.2 }],
    opacity: 0.5,
  },
  blurTintOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  canvasBgSolid: {
    ...StyleSheet.absoluteFill,
  },
  canvasFgVideo: {
    position: 'absolute',
    top: '25%',
    width: '100%',
    height: '50%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvasFgVideoFull: {
    top: 0,
    height: '100%',
  },
  fgVideoElement: {
    width: '100%',
    height: '100%',
  },

  /* Overlay: Hook Banner */
  hookBannerContainer: {
    position: 'absolute',
    top: 10,
    left: 8,
    right: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 230, 0, 0.4)',
  },
  hookBannerText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },

  /* Overlay: Subtitle */
  captionContainer: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    maxWidth: '90%',
  },
  captionContainerYellow: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: '#FFE600',
  },
  captionContainerWhite: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  captionText: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  captionTextYellow: { color: '#FFE600' },
  captionTextWhite: { color: '#FFFFFF' },

  /* Overlay: Watermark */
  watermarkOverlay: {
    position: 'absolute',
    zIndex: 10,
  },
  watermarkLogoImage: {
    width: 36,
    height: 36,
    marginBottom: 4,
  },
  toggleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  toggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    color: '#FFE600',
    fontSize: 12,
    fontWeight: '800',
  },
  logoActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  removeLogoBtn: {
    backgroundColor: '#2A1820',
    borderWidth: 1,
    borderColor: '#FF5C77',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  removeLogoBtnText: {
    color: '#FF5C77',
    fontSize: 13,
    fontWeight: '700',
  },
  logoPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0F15',
    borderRadius: 10,
    padding: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#232938',
    gap: 10,
  },
  logoThumbSmall: {
    width: 30,
    height: 30,
  },
  logoPreviewNote: {
    color: '#8E9AA8',
    fontSize: 12,
    flex: 1,
  },
  watermarkTextBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFE600',
  },
  watermarkTextLabel: {
    color: '#FFE600',
    fontSize: 10,
    fontWeight: '800',
  },

  timeTicker: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timeTickerText: {
    color: '#CBD5E1',
    fontSize: 9,
    fontWeight: '600',
  },

  /* Magic Auto-Edit Bar */
  magicBar: {
    flexDirection: 'row',
    width: '92%',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  magicBtn: {
    flex: 1,
    backgroundColor: '#FFE600',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  magicBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },
  resetBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  resetBtnText: { color: '#94A3B8', fontWeight: '700', fontSize: 12 },

  /* Tool Category Pills Bar */
  pillBar: {
    flexDirection: 'row',
    width: '94%',
    marginBottom: 12,
  },
  pill: {
    backgroundColor: '#141822',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#232938',
  },
  pillActive: {
    backgroundColor: '#1E293B',
    borderColor: '#FFE600',
  },
  pillText: { color: '#94A3B8', fontWeight: '700', fontSize: 12 },
  pillTextActive: { color: '#FFE600' },

  /* Dynamic Tool Card */
  toolControlCard: {
    width: '94%',
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#232938',
  },
  toolTitle: { color: '#FFF', fontWeight: '800', fontSize: 14, marginBottom: 12 },
  subLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  optionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stylePill: {
    flex: 1,
    backgroundColor: '#0D0F15',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#232938',
  },
  stylePillActive: {
    borderColor: '#FFE600',
    backgroundColor: '#1E2430',
  },
  stylePillTitle: { color: '#FFF', fontWeight: '800', fontSize: 12, marginBottom: 2 },
  stylePillSub: { color: '#718096', fontSize: 10 },
  actionRowBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  actionRowBtnText: { color: '#FFE600', fontWeight: '700', fontSize: 12 },

  textInput: {
    backgroundColor: '#0D0F15',
    color: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#232938',
    fontSize: 13,
    marginBottom: 10,
  },
  cornerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  cornerBtn: {
    flexBasis: '48%',
    backgroundColor: '#0D0F15',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#232938',
  },
  cornerBtnActive: { borderColor: '#FFE600', backgroundColor: '#1E2430' },
  cornerBtnText: { color: '#CBD5E1', fontSize: 10, fontWeight: '700' },
  pickLogoBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  pickLogoBtnText: { color: '#38BDF8', fontWeight: '700', fontSize: 12 },

  hookToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  toggleBtn: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  toggleBtnActive: { backgroundColor: '#FFE600' },
  toggleBtnText: { color: '#000', fontWeight: '800', fontSize: 11 },

  trimButtonsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  trimNudgeBtn: {
    flex: 1,
    backgroundColor: '#0D0F15',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#232938',
  },
  trimNudgeBtnText: { color: '#FFE600', fontSize: 11, fontWeight: '700' },

  /* Modal Styles */
  modalContainer: { flex: 1, backgroundColor: '#0D0F15', padding: 20 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  modalHeaderTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  modalCloseText: { color: '#FFE600', fontWeight: '800', fontSize: 14 },
  wordsList: { flex: 1, marginTop: 10 },
  wordItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#141822',
  },
  wordInfo: { flex: 1 },
  wordText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  wordTime: { color: '#64748B', fontSize: 11, marginTop: 2 },
  wordActions: { flexDirection: 'row', gap: 8 },
  editWordBtn: { backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  editWordBtnText: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },
  deleteWordBtn: { backgroundColor: '#2D1515', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  deleteWordBtnText: { color: '#EF4444', fontSize: 11, fontWeight: '700' },

  wordEditPopup: {
    backgroundColor: '#1A202C',
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#374151',
  },
  popupActionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  popupCancelBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  popupCancelText: { color: '#94A3B8', fontWeight: '700' },
  popupSaveBtn: { backgroundColor: '#FFE600', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6 },
  popupSaveText: { color: '#000', fontWeight: '800' },

  /* Export Progress Modal */
  exportModalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportModalCard: {
    width: '80%',
    backgroundColor: '#141822',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#232938',
  },
  exportProgressTitle: { color: '#FFF', fontWeight: '800', fontSize: 16, marginTop: 14, marginBottom: 12 },
  progressBarTrack: { width: '100%', height: 8, backgroundColor: '#1E293B', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#FFE600' },
  exportProgressPercent: { color: '#FFE600', fontWeight: '800', fontSize: 14, marginTop: 8 },
  exportProgressStatus: { color: '#94A3B8', fontSize: 11, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  cancelExportBtn: { paddingVertical: 6 },
  cancelExportText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
});
