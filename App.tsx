// App.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Animated,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import Journal from './components/Journal';
import Dojo from './components/Dojo';
import QuizGame from './components/games/QuizGame';
import MeditationRoom from './components/games/MeditationRoom';
import MemoryGame from './components/games/MemoryGame';
import Flashcards from './components/Flashcards';
import Reminders from './components/Reminders';
import Chatbot from './components/Chatbot';
import FaceRecognition from './components/FaceRecognition';
import ShareLocationButton from './components/ShareLocationButton';
import SOS from './components/SOS';
import GeoLocation from './components/GeoLocation';
import FamilyInfo from './components/FamilyInfo';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
const API_URL = 'http://172.16.197.52:5000'; 

interface User {
  name: string;
  email: string;
  userId: string;
  fingerprintId: string;
  journals?: { text: string; timestamp: string }[];
}

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'auth' | 'profile' | 'dashboard' | 'chatbot' | 'dojo' | 'quiz' | 'meditation' | 'memoryGame' | 'flashcards' | 'reminders' | 'face' | 'sos' | 'geolocation' | 'familyinfo'>('landing');
  const [fingerprintId, setFingerprintId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [showJournal, setShowJournal] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Chat state for drawer integration
  const [chatList, setChatList] = useState<Array<{ chatId: string; title: string; createdAt: string }>>([]);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  
  // Audio management for Dojo rooms - store both audio files
  const dojoAudioRef1 = useRef<Audio.Sound | null>(null);
  const dojoAudioRef2 = useRef<Audio.Sound | null>(null);
  
  // Animated value for drawer
  const drawerTranslateX = useRef(new Animated.Value(-280)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Animate drawer open/close
  useEffect(() => {
    if (isDrawerOpen) {
      Animated.parallel([
        Animated.spring(drawerTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(drawerTranslateX, {
          toValue: -280,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isDrawerOpen]);

  // Load chat list when drawer opens
  useEffect(() => {
    (async () => {
      if (isDrawerOpen && user?.userId) {
        try {
          const r = await fetch(`${API_URL}/chat/list?userId=${encodeURIComponent(user.userId)}`);
          const j = await r.json();
          if (j?.success && Array.isArray(j.chats)) {
            setChatList(j.chats.map((c: any) => ({ chatId: c.chatId, title: c.title || 'New Chat', createdAt: c.createdAt })));
          }
        } catch {}
      }
    })();
  }, [isDrawerOpen, user?.userId]);

  // Load Dojo audio files
  useEffect(() => {
    loadDojoAudio();
    return () => {
      unloadDojoAudio();
    };
  }, []);

  const loadDojoAudio = async () => {
    try {
      // Load first audio file (123.mp3)
      const audioUri1 = require('./123.mp3');
      const { sound: sound1 } = await Audio.Sound.createAsync(
        audioUri1,
        { shouldPlay: false, isLooping: true }
      );
      dojoAudioRef1.current = sound1;
    } catch (error) {
      console.error('Failed to load Dojo audio 1 (123.mp3):', error);
    }

    try {
      // Load second audio file (234.mp3)
      const audioUri2 = require('./234.mp3');
      const { sound: sound2 } = await Audio.Sound.createAsync(
        audioUri2,
        { shouldPlay: false, isLooping: true }
      );
      dojoAudioRef2.current = sound2;
    } catch (error) {
      console.error('Failed to load Dojo audio 2 (234.mp3):', error);
    }
  };

  const unloadDojoAudio = async () => {
    try {
      if (dojoAudioRef1.current) {
        await dojoAudioRef1.current.unloadAsync();
        dojoAudioRef1.current = null;
      }
      if (dojoAudioRef2.current) {
        await dojoAudioRef2.current.unloadAsync();
        dojoAudioRef2.current = null;
      }
    } catch (error) {
      console.error('Failed to unload Dojo audio:', error);
    }
  };

  // Track which audio is currently playing
  const currentPlayingAudioRef = useRef<Audio.Sound | null>(null);

  const playDojoAudio = async () => {
    try {
      // Stop any currently playing audio first
      if (currentPlayingAudioRef.current) {
        try {
          await currentPlayingAudioRef.current.stopAsync();
        } catch (e) {
          // Ignore errors if already stopped
        }
      }

      // Randomly select one of the two audio files
      const randomChoice = Math.random() < 0.5;
      let selectedAudio: Audio.Sound | null = null;

      if (randomChoice && dojoAudioRef1.current) {
        selectedAudio = dojoAudioRef1.current;
      } else if (!randomChoice && dojoAudioRef2.current) {
        selectedAudio = dojoAudioRef2.current;
      } else {
        // Fallback to whichever is available
        selectedAudio = dojoAudioRef1.current || dojoAudioRef2.current;
      }

      if (selectedAudio) {
        currentPlayingAudioRef.current = selectedAudio;
        await selectedAudio.playAsync();
      }
    } catch (error) {
      console.error('Failed to play Dojo audio:', error);
    }
  };

  const stopDojoAudio = async () => {
    try {
      if (currentPlayingAudioRef.current) {
        await currentPlayingAudioRef.current.stopAsync();
        currentPlayingAudioRef.current = null;
      }
    } catch (error) {
      console.error('Failed to stop Dojo audio:', error);
    }
  };

    // Register background reminder caller (runs even when app is closed)
    

  /* --------------------------------------------------------------- */
  /*  GET OR CREATE PERSISTENT FINGERPRINT ID                         */
  /* --------------------------------------------------------------- */
  const getOrCreateFingerprintId = async (): Promise<string> => {
    let fpId = await SecureStore.getItemAsync('fingerprintId');
    if (!fpId) {
      fpId = `fp_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      await SecureStore.setItemAsync('fingerprintId', fpId);
    }
    return fpId;
  };

  /* --------------------------------------------------------------- */
  /*  AUTHENTICATE                                                    */
  /* --------------------------------------------------------------- */
  const authenticate = async () => {
    setLoading(true);
    setStatusMsg('Checking sensor…');

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) throw new Error('No biometric sensor');

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) throw new Error('No fingerprint enrolled');

      setStatusMsg('Touch sensor…');
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Touch to login',
      });

      if (!result.success) throw new Error('Authentication failed');

      const fpId = await getOrCreateFingerprintId();
      setFingerprintId(fpId);
      setStatusMsg('Fingerprint verified');

      await checkUserOnServer(fpId);
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setLoading(false);
    }
  };

  /* --------------------------------------------------------------- */
  /*  CHECK USER ON SERVER (ONLY MONGO DB)                            */
  /* --------------------------------------------------------------- */
  const checkUserOnServer = async (fpId: string) => {
    try {
      const res = await fetch(`${API_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprintId: fpId }),
      });

      const data = await res.json();

      if (data.success && data.user) {
        setUser(data.user);
        setScreen('dashboard');
      } else if (data.newUser) {
        setScreen('profile');
      } else {
        Alert.alert('Error', data.error || 'Unknown error');
      }
    } catch (err) {
      Alert.alert('Server Error', 'Cannot connect to server');
    } finally {
      setLoading(false);
    }
  };

  /* --------------------------------------------------------------- */
  /*  SAVE PROFILE (CHECK EMAIL UNIQUENESS)                           */
  /* --------------------------------------------------------------- */
  const saveProfile = async () => {
    if (!name.trim()) return Alert.alert('Error', 'Name required');
    if (!email.includes('@')) return Alert.alert('Error', 'Valid email required');

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/save-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprintId, name, email }),
      });

      const data = await res.json();

      if (data.success && data.user) {
        setUser(data.user);
        setScreen('dashboard');
      } else {
        Alert.alert('Error', data.error || 'Failed to save');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
    } finally {
      setLoading(false);
    }
  };

  /* --------------------------------------------------------------- */
  /*  UI COMPONENTS                                                   */
  /* --------------------------------------------------------------- */

  // DashboardCard Component
  const DashboardCard = ({ icon, title, onPress }: { icon: string; title: string; onPress: () => void }) => (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon as any} size={48} color="#6B5E4C" />
      <Text style={styles.cardTitle}>{title}</Text>
    </TouchableOpacity>
  );

  /* --------------------------------------------------------------- */
  /*  SCREENS                                                         */
  /* --------------------------------------------------------------- */

  if (screen === 'landing') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.appTitle}>Mindbloom</Text>
        <Text style={styles.appSubtitle}>Memory Companion</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('auth')}>
          <Text style={styles.primaryButtonText}>Login with Fingerprint</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screen === 'auth') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.title}>Touch to Login</Text>
        <Text style={styles.statusText}>{statusMsg}</Text>
        {loading && <ActivityIndicator size="large" color="#8B7355" style={{ marginVertical: 20 }} />}
        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabledButton]}
          onPress={authenticate}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>Scan Fingerprint</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setScreen('landing')}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screen === 'profile') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.title}>Complete Profile</Text>
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabledButton]}
          onPress={saveProfile}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>{loading ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // DASHBOARD - Mindbloom Style
  if (screen === 'dashboard') {
    if (showJournal) {
      return (
        <View style={styles.container}>
          <StatusBar barStyle="dark-content" />
          <TouchableOpacity style={[styles.backButton, { marginTop: 20 }]} onPress={() => setShowJournal(false)}>
            <Ionicons name="arrow-back" size={24} color="#6B5E4C" />
            <Text style={styles.backButtonText}>Back to Home</Text>
          </TouchableOpacity>
          <Journal
            userId={user!.userId}
            journals={user!.journals || []}
            onJournalSaved={(journals) => {
              setUser({ ...user!, journals });
              setShowJournal(false);
            }}
          />
        </View>
      );
    }

    return (
      <View style={styles.dashboardContainer}>
        <StatusBar barStyle="dark-content" />
         {/* Header */}
         <View style={styles.header}>
          <TouchableOpacity onPress={() => setIsDrawerOpen(true)}>
            <Ionicons name="menu" size={28} color="#6B5E4C" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>NeuroLink</Text>
          {user && <ShareLocationButton userId={user.userId} />}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Daily Insights Section */}
          <Text style={styles.sectionTitle}>Welcome, {user?.name}!</Text>

          {/* Top Row - Flashcard and Suggestion */}
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.flashcardCard} activeOpacity={0.8} onPress={() => setScreen('flashcards')}>
              <Text style={styles.flashcardLabel}>Flashcard</Text>
              <View style={styles.flashcardContent}>
                <Text style={styles.flashcardTitle}>Gratitude</Text>
                <Ionicons name="leaf-outline" size={24} color="#6B5E4C" />
              </View>
            </TouchableOpacity>
            <View style={styles.suggestionCard}>
              <Text style={styles.suggestionTitle}>Suggestion</Text>
              <Text style={styles.suggestionText}>Meditate for 5 min today</Text>
            </View>
          </View>

          {/* Grid Cards */}
          <View style={styles.gridContainer}>
            <DashboardCard icon="book-outline" title="Journal Page" onPress={() => setShowJournal(true)} />
            <DashboardCard icon="sunny-outline" title="Dojo Page" onPress={() => setScreen('dojo')} />
            <DashboardCard icon="notifications-outline" title="Reminders Page" onPress={() => setScreen('reminders')} />
            <DashboardCard icon="person-outline" title="Face Recognition" onPress={() => setScreen('face')} />
            <DashboardCard icon="location-outline" title="Geo Location" onPress={() => setScreen('geolocation')} />
            <DashboardCard icon="people-outline" title="Info from the Family" onPress={() => setScreen('familyinfo')} />
          </View>

        </ScrollView>

        {/* Sidebar Drawer with Animation */}
        {isDrawerOpen && (
          <View style={styles.drawerOverlay} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.drawer,
                {
                  transform: [{ translateX: drawerTranslateX }],
                },
              ]}
            >
              <View style={styles.drawerHeader}>
                <View>
                  <Text style={styles.drawerTitle}>Mindbloom</Text>
                  <Text style={styles.drawerSubtitle}>{user?.name}</Text>
                </View>
                <TouchableOpacity onPress={() => setIsDrawerOpen(false)}>
                  <Ionicons name="close-circle-outline" size={28} color="#6B5E4C" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.drawerContent} showsVerticalScrollIndicator={false}>
                {/* User Info Card */}
                <View style={styles.drawerUserCard}>
                  <View style={styles.drawerUserAvatar}>
                    <Ionicons name="person" size={32} color="#6B5E4C" />
                  </View>
                  <View style={styles.drawerUserInfo}>
                    <Text style={styles.drawerUserName}>{user?.name}</Text>
                    <Text style={styles.drawerUserEmail}>{user?.email}</Text>
                  </View>
                </View>

                {/* Menu Items */}
                <View style={styles.drawerMenu}>
                  <Text style={styles.drawerSectionTitle}>Navigation</Text>
                  
                  <TouchableOpacity
                    style={styles.drawerItem}
                    onPress={() => {
                      setIsDrawerOpen(false);
                      setShowJournal(true);
                    }}
                  >
                    <View style={styles.drawerItemIconContainer}>
                      <Ionicons name="book-outline" size={24} color="#6B5E4C" />
                    </View>
                    <Text style={styles.drawerItemText}>My Journal</Text>
                    <Ionicons name="chevron-forward" size={20} color="#999" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.drawerItem}
                    onPress={() => {
                      setIsDrawerOpen(false);
                      setScreen('chatbot');
                    }}
                  >
                    <View style={styles.drawerItemIconContainer}>
                      <Ionicons name="chatbubble-ellipses-outline" size={24} color="#6B5E4C" />
                    </View>
                    <Text style={styles.drawerItemText}>AI Assistant</Text>
                    <Ionicons name="chevron-forward" size={20} color="#999" />
                  </TouchableOpacity>

                  {/* Expandable Chat History */}
                  <TouchableOpacity
                    style={[styles.drawerItem, { justifyContent: 'space-between' }]}
                    onPress={() => setChatExpanded((s) => !s)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={styles.drawerItemIconContainer}>
                        <Ionicons name="albums-outline" size={22} color="#6B5E4C" />
                      </View>
                      <Text style={styles.drawerItemText}>Chat History</Text>
                    </View>
                    <Ionicons name={chatExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#999" />
                  </TouchableOpacity>

                  {chatExpanded && (
                    <View style={{ marginLeft: 16, marginBottom: 8 }}>
                      <TouchableOpacity
                        style={[styles.drawerItem, { marginBottom: 6 }]}
                        onPress={async () => {
                          try {
                            const r = await fetch(`${API_URL}/chat/new`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: user!.userId }),
                            });
                            const j = await r.json();
                            if (j?.success && j.chatId) {
                              setActiveChatId(j.chatId);
                              setScreen('chatbot');
                              setIsDrawerOpen(false);
                              setChatList(j.chats || []);
                            }
                          } catch {}
                        }}
                      >
                        <View style={styles.drawerItemIconContainer}>
                          <Ionicons name="add-circle-outline" size={22} color="#6B5E4C" />
                        </View>
                        <Text style={styles.drawerItemText}>New Chat</Text>
                        <Ionicons name="chevron-forward" size={20} color="#999" />
                      </TouchableOpacity>
                      {chatList.map((c) => (
                        <TouchableOpacity
                          key={c.chatId}
                          style={[styles.drawerItem, { marginBottom: 6 }]}
                          onPress={() => {
                            setActiveChatId(c.chatId);
                            setScreen('chatbot');
                            setIsDrawerOpen(false);
                          }}
                        >
                          <View style={styles.drawerItemIconContainer}>
                            <Ionicons name="chatbox-ellipses-outline" size={20} color="#6B5E4C" />
                          </View>
                          <Text style={styles.drawerItemText} numberOfLines={1}>{c.title || 'Chat'}</Text>
                          <Ionicons name="chevron-forward" size={20} color="#999" />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.drawerItem}
                    onPress={() => {
                      setIsDrawerOpen(false);
                      setScreen('reminders');
                    }}
                  >
                    <View style={styles.drawerItemIconContainer}>
                      <Ionicons name="notifications-outline" size={24} color="#6B5E4C" />
                    </View>
                    <Text style={styles.drawerItemText}>Reminders</Text>
                    <Ionicons name="chevron-forward" size={20} color="#999" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.drawerItem}
                    onPress={() => {
                      setIsDrawerOpen(false);
                      setScreen('face');
                    }}
                  >
                    <View style={styles.drawerItemIconContainer}>
                      <Ionicons name="person-outline" size={24} color="#6B5E4C" />
                    </View>
                    <Text style={styles.drawerItemText}>Face Recognition</Text>
                    <Ionicons name="chevron-forward" size={20} color="#999" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.drawerItem}
                    onPress={() => {
                      setIsDrawerOpen(false);
                      setScreen('geolocation');
                    }}
                  >
                    <View style={styles.drawerItemIconContainer}>
                      <Ionicons name="location-outline" size={24} color="#6B5E4C" />
                    </View>
                    <Text style={styles.drawerItemText}>Geo Location</Text>
                    <Ionicons name="chevron-forward" size={20} color="#999" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.drawerItem, styles.drawerSOSItem]}
                    onPress={() => {
                      setIsDrawerOpen(false);
                      setScreen('sos');
                    }}
                  >
                    <View style={[styles.drawerItemIconContainer, styles.sosIconContainer]}>
                      <Ionicons name="warning" size={24} color="#DC3545" />
                    </View>
                    <Text style={[styles.drawerItemText, styles.sosText]}>Emergency SOS</Text>
                    <Ionicons name="chevron-forward" size={20} color="#DC3545" />
                  </TouchableOpacity>

                  <Text style={[styles.drawerSectionTitle, { marginTop: 24 }]}>Settings</Text>

                  <TouchableOpacity
                    style={styles.drawerItem}
                    onPress={() => {
                      setIsDrawerOpen(false);
                      setScreen('profile');
                    }}
                  >
                    <View style={styles.drawerItemIconContainer}>
                      <Ionicons name="person-circle-outline" size={24} color="#6B5E4C" />
                    </View>
                    <Text style={styles.drawerItemText}>Edit Profile</Text>
                    <Ionicons name="chevron-forward" size={20} color="#999" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.drawerItem, styles.drawerLogoutItem]}
                    onPress={() => {
                      setIsDrawerOpen(false);
                      Alert.alert(
                        'Logout',
                        'Are you sure you want to logout?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Logout',
                            style: 'destructive',
                            onPress: () => {
                              setUser(null);
                              setScreen('landing');
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <View style={[styles.drawerItemIconContainer, styles.logoutIconContainer]}>
                      <Ionicons name="log-out-outline" size={24} color="#DC3545" />
                    </View>
                    <Text style={[styles.drawerItemText, styles.logoutText]}>Logout</Text>
                    <Ionicons name="chevron-forward" size={20} color="#DC3545" />
                  </TouchableOpacity>
        </View>
      </ScrollView>
            </Animated.View>
            
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setIsDrawerOpen(false)}
            >
              <Animated.View
                style={[
                  styles.drawerBackdrop,
                  {
                    opacity: backdropOpacity,
                  },
                ]}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // CHATBOT
  if (screen === 'chatbot') {
    return <Chatbot onBack={() => setScreen('dashboard')} userId={user!.userId} chatId={activeChatId} onNewChatAssigned={(id) => setActiveChatId(id)} userName={user?.name || null} />;
  }

  // DOJO
  if (screen === 'dojo') {
    return (
      <Dojo
        onBack={() => setScreen('dashboard')}
        onOpenQuiz={async () => {
          await playDojoAudio();
          setScreen('quiz');
        }}
        onOpenMeditation={async () => {
          await playDojoAudio();
          setScreen('meditation');
        }}
        onOpenMemoryGame={async () => {
          await playDojoAudio();
          setScreen('memoryGame');
        }}
      />
    );
  }

  if (screen === 'quiz') {
    return (
      <QuizGame 
        onBack={async () => {
          await stopDojoAudio();
          setScreen('dojo');
        }} 
        journals={user?.journals || []} 
        userId={user!.userId} 
      />
    );
  }

  // MEDITATION
  if (screen === 'meditation') {
    return (
      <MeditationRoom 
        onBack={async () => {
          await stopDojoAudio();
          setScreen('dojo');
        }} 
        userId={user!.userId} 
      />
    );
  }

  // MEMORY GAME (blank room)
  if (screen === 'memoryGame') {
    return (
      <MemoryGame 
        onBack={async () => {
          await stopDojoAudio();
          setScreen('dojo');
        }} 
      />
    );
  }

  // FLASHCARDS
  if (screen === 'flashcards') {
    return <Flashcards onBack={() => setScreen('dashboard')} />;
  }

  // REMINDERS
  if (screen === 'reminders') {
    return <Reminders onBack={() => setScreen('dashboard')} userId={user!.userId} />;
}

  // FACE
  if (screen === 'face') {
    return <FaceRecognition onBack={() => setScreen('dashboard')} userId={user!.userId} />;
  }

  // SOS
  if (screen === 'sos') {
    return <SOS onBack={() => setScreen('dashboard')} userId={user!.userId} userName={user?.name || null} />;
  }

  // GEO LOCATION
  if (screen === 'geolocation') {
    return <GeoLocation onBack={() => setScreen('dashboard')} userId={user!.userId} />;
  }

  // FAMILY INFO
  if (screen === 'familyinfo') {
    return <FamilyInfo onBack={() => setScreen('dashboard')} userId={user!.userId} />;
  }

  return null;
}

/* --------------------------------------------------------------- */
/*  STYLES - MINDBLOOM THEME                                        */
/* --------------------------------------------------------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F1E8',
  },
  dashboardContainer: {
    flex: 1,
    backgroundColor: '#F5F1E8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#F5F1E8',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '400',
    color: '#6B5E4C',
    fontFamily: 'Georgia',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2C2416',
    marginBottom: 16,
    marginTop: 10,
  },
  topRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  flashcardCard: {
    flex: 1,
    backgroundColor: '#E8DCC4',
    borderRadius: 20,
    padding: 16,
    minHeight: 100,
  },
  flashcardLabel: {
    fontSize: 13,
    color: '#6B5E4C',
    marginBottom: 8,
  },
  flashcardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flashcardTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#4A5D3F',
  },
  suggestionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    justifyContent: 'center',
    minHeight: 100,
  },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2C2416',
    marginBottom: 6,
  },
  suggestionText: {
    fontSize: 13,
    color: '#6B5E4C',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '500',
    color: '#2C2416',
    textAlign: 'center',
  },
  appTitle: {
    fontSize: 48,
    fontWeight: '400',
    color: '#6B5E4C',
    marginBottom: 8,
    fontFamily: 'Georgia',
  },
  appSubtitle: {
    fontSize: 18,
    color: '#8B7355',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#2C2416',
    marginBottom: 20,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#6B5E4C',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    fontSize: 16,
    color: '#2C2416',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8DCC4',
  },
  primaryButton: {
    backgroundColor: '#6B5E4C',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    minWidth: 200,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    minWidth: 200,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6B5E4C',
  },
  secondaryButtonText: {
    color: '#6B5E4C',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  backButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#6B5E4C',
    fontWeight: '500',
  },
  
  // Drawer Styles
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 90, // Starts below the header
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    backgroundColor: '#F5F1E8',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 16,
    zIndex: 1000,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8DCC4',
  },
  drawerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#2C2416',
    fontFamily: 'Georgia',
  },
  drawerSubtitle: {
    fontSize: 13,
    color: '#6B5E4C',
    marginTop: 2,
  },
  drawerContent: {
    flex: 1,
  },
  drawerUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  drawerUserAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8DCC4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  drawerUserInfo: {
    flex: 1,
  },
  drawerUserName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2C2416',
    marginBottom: 4,
  },
  drawerUserEmail: {
    fontSize: 13,
    color: '#6B5E4C',
  },
  drawerMenu: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24,
  },
  drawerSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  drawerItemIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F5F1E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  drawerItemText: {
    flex: 1,
    fontSize: 16,
    color: '#2C2416',
    fontWeight: '500',
  },
  drawerLogoutItem: {
    marginTop: 16,
    backgroundColor: '#FFF5F5',
  },
  logoutIconContainer: {
    backgroundColor: '#FFE5E8',
  },
  logoutText: {
    color: '#DC3545',
  },
  drawerSOSItem: {
    marginTop: 8,
    backgroundColor: '#FFF5F5',
  },
  sosIconContainer: {
    backgroundColor: '#FFE5E8',
  },
  sosText: {
    color: '#DC3545',
    fontWeight: '600',
  },
});