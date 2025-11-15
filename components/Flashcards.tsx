import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, PanResponder, Dimensions, StatusBar, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
const API_URL = 'http://172.16.197.52:5000'; 

interface FlashItem {
  title?: string;
  summary: string;
  mediaUrl?: string | null;
}

interface FlashcardsProps {
  onBack: () => void;
  items?: FlashItem[];
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_WIDTH;
const SWIPE_OUT_DURATION = 180;

export default function Flashcards({ onBack, items = [] }: FlashcardsProps) {
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverItems, setServerItems] = useState<FlashItem[]>([]);
  const position = useRef(new Animated.ValueXY()).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_evt, gesture) => {
          position.setValue({ x: gesture.dx, y: gesture.dy });
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dx > SWIPE_THRESHOLD) {
            forceSwipe('right');
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            forceSwipe('left');
          } else {
            resetPosition();
          }
        },
      }),
    []
  );

  function forceSwipe(direction: 'left' | 'right') {
    const x = direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: true,
    }).start(() => onSwipeComplete());
  }

  function onSwipeComplete() {
    position.setValue({ x: 0, y: 0 });
    setIndex(i => Math.min(i + 1, serverItems.length - 1));
  }

  function resetPosition() {
    Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
  }

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  const curr = serverItems[index];

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000);
        const r = await fetch(`${API_URL}/flash/run-script`, { headers: { Accept: 'application/json' }, signal: controller.signal });
        clearTimeout(timeoutId);
        // Try to parse JSON regardless of content-type to avoid false negatives
        if (r.ok) {
          const data = await r.json().catch(() => ({} as any));
          // Map possible shapes → FlashItem[]
          let raw: any[] = [];
          if (Array.isArray(data.flashcards)) raw = data.flashcards;
          else if (Array.isArray(data.cards)) raw = data.cards;
          else if (Array.isArray(data.questions)) raw = data.questions;

          const mapped: FlashItem[] = raw
            .map((x: any) => ({
              title: x.title || x.tag || 'Card',
              summary: x.summary || x.caption || '',
              mediaUrl: x.mediaUrl || x.mediaUri || null,
            }))
            .filter((x: FlashItem) => typeof x.summary === 'string' && x.summary.trim().length > 0);

          if (mapped.length) {
            setServerItems(mapped);
            setIndex(0);
            position.setValue({ x: 0, y: 0 });
          }
        } else {
          setError('Failed to load flashcards.');
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load flashcards.');
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Ionicons name="arrow-back" size={24} color="#6B5E4C" />
        <Text style={styles.backButtonText}>Back to Home</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Flashcards</Text>

      {loading ? (
        <View style={styles.cardCenter}>
          <ActivityIndicator size="large" color="#4A5D3F" />
          <Text style={{ marginTop: 10, color: '#6B5E4C' }}>Loading flashcards…</Text>
          {!!error && <Text style={{ marginTop: 6, color: '#6B5E4C' }}>{error}</Text>}
        </View>
      ) : curr ? (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.card,
            {
              transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }],
            },
          ]}
        >
          {!!curr.title && <Text style={styles.cardLabel}>{curr.title}</Text>}
          {!!curr.mediaUrl && (
            <Image source={{ uri: curr.mediaUrl }} style={styles.cardImage} resizeMode="cover" />
          )}
          {!!curr.summary && <Text style={styles.cardText}>{curr.summary}</Text>}
        </Animated.View>
      ) : (
        <View style={styles.cardCenter}>
          <Ionicons name="information-circle-outline" size={42} color="#4A5D3F" />
          <Text style={styles.doneText}>{error ? 'Failed to load flashcards.' : 'No flashcards available.'}</Text>
          <TouchableOpacity
            style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            onPress={async () => {
              try {
                setLoading(true);
                setError(null);
                setServerItems([]);
                setIndex(0);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 180000);
                const r = await fetch(`${API_URL}/flash/run-script`, { headers: { Accept: 'application/json' }, signal: controller.signal });
                clearTimeout(timeoutId);
                if (r.ok) {
                  const data = await r.json().catch(() => ({} as any));
                  let raw: any[] = [];
                  if (Array.isArray(data.flashcards)) raw = data.flashcards;
                  else if (Array.isArray(data.cards)) raw = data.cards;
                  else if (Array.isArray(data.questions)) raw = data.questions;
                  const mapped: FlashItem[] = raw
                    .map((x: any) => ({
                      title: x.title || x.tag || 'Card',
                      summary: x.summary || x.caption || '',
                      mediaUrl: x.mediaUrl || x.mediaUri || null,
                    }))
                    .filter((x: FlashItem) => typeof x.summary === 'string' && x.summary.trim().length > 0);
                  setServerItems(mapped);
                  setIndex(0);
                  position.setValue({ x: 0, y: 0 });
                } else {
                  setError('Failed to load flashcards.');
                }
              } catch (e: any) {
                setError(e?.message || 'Failed to load flashcards.');
              } finally {
                setLoading(false);
              }
            }}
          >
            <Ionicons name="refresh" size={20} color="#6B5E4C" />
            <Text style={{ color: '#6B5E4C', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerBtn} onPress={() => forceSwipe('left')}>
          <Ionicons name="arrow-back-circle" size={28} color="#6B5E4C" />
          <Text style={styles.footerText}>Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBtn} onPress={() => forceSwipe('right')}>
          <Text style={styles.footerText}>Next</Text>
          <Ionicons name="arrow-forward-circle" size={28} color="#6B5E4C" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F1E8', paddingHorizontal: 20, paddingTop: 50 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, alignSelf: 'flex-start' },
  backButtonText: { marginLeft: 8, fontSize: 16, color: '#6B5E4C', fontWeight: '500' },
  title: { fontSize: 26, fontWeight: '600', color: '#2C2416', marginBottom: 12, textAlign: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    minHeight: 300,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardImage: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: '#EEE7DA',
  },
  cardLabel: { color: '#6B5E4C', fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', fontSize: 12 },
  cardText: { color: '#2C2416', fontSize: 18, lineHeight: 24 },
  cardCenter: { alignItems: 'center', justifyContent: 'center', padding: 30 },
  doneText: { color: '#2C2416', marginTop: 8, fontSize: 16, fontWeight: '600' },
  footer: { marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  footerText: { color: '#6B5E4C', fontWeight: '600' },
});


