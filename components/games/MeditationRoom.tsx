// components/games/MeditationRoom.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Easing, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
const API_URL = 'http://172.16.196.91:5000'; 

interface MeditationRoomProps {
  onBack: () => void;
  userId: string;
}

// A more structured breathing cycle (in milliseconds)
const BREATHE_IN_DURATION = 4000;
const HOLD_DURATION = 4000;
const BREATHE_OUT_DURATION = 4000;

type BreathingPhase = 'Begin' | 'Breathe In' | 'Hold' | 'Breathe Out';
type MeditationSession = { durationSeconds: number; startedAt: string; endedAt?: string };

export default function MeditationRoom({ onBack, userId }: MeditationRoomProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [breathingPhase, setBreathingPhase] = useState<BreathingPhase>('Begin');
  // Pulse animation driver (0 -> 1 loop)
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const startedAtRef = useRef<string | null>(null);
  const [history, setHistory] = useState<MeditationSession[]>([]);
  const [saving, setSaving] = useState(false);

  async function fetchJson(input: RequestInfo | URL, init?: RequestInit): Promise<any> {
    const res = await fetch(input, {
      headers: { Accept: 'application/json', ...(init?.headers || {}) },
      ...init,
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!res.ok || (data && data.success === false)) {
      throw new Error((data && data.error) || `Request failed with ${res.status}`);
    }
    return data;
  }

  // Fetch existing history
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchJson(`${API_URL}/meditation/history?userId=${encodeURIComponent(userId)}`);
        if (mounted && Array.isArray(data.meditationSessions)) setHistory(data.meditationSessions);
      } catch (e: any) {
        console.warn('History load failed:', e?.message || e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  async function saveSession() {
    if (!userId || seconds <= 0 || saving) return;
    setSaving(true);
    try {
      const payload = {
        userId,
        durationSeconds: seconds,
        startedAt: startedAtRef.current,
        endedAt: new Date().toISOString(),
      };
      await fetchJson(`${API_URL}/meditation/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const hist = await fetchJson(`${API_URL}/meditation/history?userId=${encodeURIComponent(userId)}`);
      if (Array.isArray(hist.meditationSessions)) setHistory(hist.meditationSessions);

      // Reset state after successful save
      setIsRunning(false);
      setSeconds(0);
      setBreathingPhase('Begin');
      startedAtRef.current = null;
    } catch (e: any) {
      console.warn(e?.message || e);
      Alert.alert('Save Failed', e?.message || 'Could not save session. Check server connectivity.');
    } finally {
      setSaving(false);
    }
  }

  // Timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isRunning) {
      timer = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning]);

  // Animation effect (pulsing blob)
  useEffect(() => {
    if (isRunning) {
      startPulse();
      breatheLoop();
    } else {
      // Reset animation when paused or stopped
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);
    }
  }, [isRunning]);

  function startPulse() {
    pulseAnim.setValue(0);
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      })
    ).start();
  }

  // The main phase loop for breathing text
  function breatheLoop() {
    // 1. Breathe In
    setBreathingPhase('Breathe In');
    setTimeout(() => {
      if (!isRunning) return;
      // 2. Hold
      setBreathingPhase('Hold');
      setTimeout(() => {
        if (!isRunning) return;
        // 3. Breathe Out
        setBreathingPhase('Breathe Out');
        setTimeout(() => {
          if (!isRunning) return;
          // 4. Bottom hold then loop
          setTimeout(() => {
            if (isRunning) breatheLoop();
          }, HOLD_DURATION / 2);
        }, BREATHE_OUT_DURATION);
      }, HOLD_DURATION);
    }, BREATHE_IN_DURATION);
  }

  const toggleTimer = () => {
    if (!isRunning) {
      setBreathingPhase('Breathe In'); // Set initial phase
      startedAtRef.current = new Date().toISOString();
    } else {
      setBreathingPhase('Begin');
      // Explicit save is done via button; no auto-save on pause
    }
    setIsRunning(r => !r);
  };

  const resetTimer = () => {
    setIsRunning(false);
    // Do not auto-save on reset; rely on explicit save
    setSeconds(0);
    setBreathingPhase('Begin');
    startedAtRef.current = null;
  };

  const formattedMinutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const formattedSeconds = (seconds % 60).toString().padStart(2, '0');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#6B5E4C" />
          <Text style={styles.backButtonText}>Back to Dojo</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Meditation Room</Text>
      </View>

      {/* Main Visualizer Card */}
      <View style={styles.visualizerCard}>
        <View style={styles.loaderWrapper}>
          {/* Outer expanding pulse */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulseRing,
              {
                transform: [
                  {
                    scale: pulseAnim.interpolate({
                      inputRange: [0, 0.7, 1],
                      outputRange: [1, 1.6, 1.8],
                    }),
                  },
                ],
                opacity: pulseAnim.interpolate({
                  inputRange: [0, 0.7, 1],
                  outputRange: [0.7, 0.1, 0],
                }),
              },
            ]}
          />
          {/* Core blob */}
          <Animated.View
            style={[
              styles.pulseCore,
              {
                transform: [
                  {
                    scale: pulseAnim.interpolate({
                      inputRange: [0, 0.7, 1],
                      outputRange: [0.95, 1.2, 0.95],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
        <Text style={styles.circleText}>{isRunning ? breathingPhase : 'Begin'}</Text>
      </View>

      {/* Timer and Controls Card */}
      <View style={styles.controlsCard}>
        <Text style={styles.timerText}>{formattedMinutes}:{formattedSeconds}</Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryButton, isRunning && styles.runningButton]}
            onPress={toggleTimer}
            activeOpacity={0.8}
          >
            <Ionicons name={isRunning ? "pause" : "play"} size={22} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{isRunning ? 'Pause' : 'Start'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={resetTimer}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={22} color="#6B5E4C" />
            <Text style={styles.secondaryButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, (seconds === 0 || saving) && styles.saveButtonDisabled]}
          onPress={saveSession}
          disabled={seconds === 0 || saving}
          activeOpacity={0.8}
        >
          <Ionicons name="save-outline" size={20} color="#FFFFFF" />
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'End & Save Session'}</Text>
        </TouchableOpacity>
      </View>

      {/* History */}
      <View style={styles.historyCard}>
        <Text style={styles.historyTitle}>Past Sessions</Text>
        {history.length === 0 ? (
          <Text style={styles.historyEmpty}>No sessions yet. Start a session to log it.</Text>
        ) : (
          <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
            {history.map((s, i) => {
              const d = new Date(s.startedAt);
              const mins = Math.floor(s.durationSeconds / 60);
              const secs = s.durationSeconds % 60;
              return (
                <View key={i} style={styles.historyItem}>
                  <Ionicons name="leaf-outline" size={18} color="#6B5E4C" />
                  <Text style={styles.historyText}>
                    {d.toLocaleString()} • {mins.toString().padStart(2,'0')}:{secs.toString().padStart(2,'0')}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// === STYLES - MINDBLOOM THEME ===
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F1E8',
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#6B5E4C',
    fontWeight: '500',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#2C2416',
    textAlign: 'center',
  },
  visualizerCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  loaderWrapper: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(106, 143, 63, 0.7)', // mehendi green with alpha
  },
  pulseCore: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#6A8F3F', // mehendi green
  },
  circleText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#4A5D3F', // Darker green text for contrast
  },
  controlsCard: {
    padding: 20,
    paddingBottom: 40,
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  timerText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#2C2416',
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#6B5E4C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
  },
  runningButton: {
    backgroundColor: '#4A5D3F', // Theme's accent green when running
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: '#E8DCC4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
  },
  secondaryButtonText: {
    color: '#6B5E4C',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  saveButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6B5E4C',
    paddingVertical: 12,
    borderRadius: 14,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  historyCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C2416',
    marginBottom: 10,
  },
  historyEmpty: {
    color: '#6B5E4C',
    fontSize: 14,
  },
  historyList: {
    maxHeight: 180,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8DCC4',
  },
  historyText: {
    marginLeft: 8,
    color: '#2C2416',
    fontSize: 14,
  },
});