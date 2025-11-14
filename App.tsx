// App.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  Button,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import Journal from './components/Journal';
import JournalCard from './components/JournalCard';

interface User {
  name: string;
  email: string;
  userId: string;
  fingerprintId: string;
  journals?: { text: string; timestamp: string }[];
}

const API_URL = 'https://neurolink-auth-backend.onrender.com';

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'auth' | 'profile' | 'dashboard'>('landing');
  const [fingerprintId, setFingerprintId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [showJournal, setShowJournal] = useState(false);

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
  /*  UI                                                              */
  /* --------------------------------------------------------------- */
  if (screen === 'landing') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>NeuroLink</Text>
        <Text style={styles.subtitle}>Memory Companion</Text>
        <Button title="Login with Fingerprint" onPress={() => setScreen('auth')} />
      </View>
    );
  }

  if (screen === 'auth') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Touch to Login</Text>
        <Text style={styles.status}>{statusMsg}</Text>
        {loading && <ActivityIndicator size="large" color="#007bff" />}
        <Button title="Scan Fingerprint" onPress={authenticate} disabled={loading} />
        <Button title="Back" onPress={() => setScreen('landing')} />
      </View>
    );
  }

  if (screen === 'profile') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Complete Profile</Text>
        <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Button title={loading ? 'Saving…' : 'Save'} onPress={saveProfile} disabled={loading} />
      </View>
    );
  }

  // DASHBOARD
  if (screen === 'dashboard') {
    if (showJournal) {
      return (
        <View style={styles.container}>
          <Button title="Back to Home" onPress={() => setShowJournal(false)} color="#666" />
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
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>Welcome, {user?.name}!</Text>
        <Text style={styles.subtitle}>Email: {user?.email}</Text>

        {/* CLICKABLE JOURNAL CARD */}
        <JournalCard onPress={() => setShowJournal(true)} />

        <View style={{ marginTop: 30, width: '100%' }}>
          <Button title="Logout" onPress={() => setScreen('landing')} color="red" />
        </View>
      </ScrollView>
    );
  }

  return null; // fallback
}

// STYLES
const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    padding: 30,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
  },
  container: {
    flex: 1,
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#555',
    marginBottom: 15,
    textAlign: 'center',
  },
  status: {
    fontSize: 16,
    color: '#333',
    marginVertical: 10,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 14,
    width: '85%',
    borderRadius: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
    fontSize: 16,
  },
});