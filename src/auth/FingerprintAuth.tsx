// src/auth/FingerprintAuth.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: string;
  name: string;
  role: 'patient' | 'caregiver';
  fingerprintId: string;
}

export default function FingerprintAuth({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Mock database of users (in real app: Firebase / backend)
  const KNOWN_USERS: User[] = [
    { id: '1', name: 'Mrs. Sharma', role: 'patient', fingerprintId: 'fingerprint_patient_1' },
    { id: '2', name: 'Arjun (Son)', role: 'caregiver', fingerprintId: 'fingerprint_caregiver_1' },
  ];

  const authenticate = async () => {
    setIsAuthenticating(true);

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert('Error', 'Fingerprint not set up on this device');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Touch the fingerprint sensor',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
      });

      if (result.success) {
        // Generate a unique fingerprint ID (simulated — in real app, use secure keychain)
        const fingerprintId = `fingerprint_${Date.now()}_${Math.random()}`;

        // Check if this fingerprint is already registered
        const storedId = await AsyncStorage.getItem('currentFingerprintId');
        let user: User | null = null;

        if (storedId) {
          user = KNOWN_USERS.find(u => u.fingerprintId === storedId) || null;
        }

        if (!user) {
          // First time? Let’s register
          Alert.alert(
            'New User Detected',
            'Is this Mrs. Sharma (Patient) or Arjun (Caregiver)?',
            [
              { text: 'Patient', onPress: () => registerUser('patient', fingerprintId) },
              { text: 'Caregiver', onPress: () => registerUser('caregiver', fingerprintId) },
            ]
          );
        } else {
          // Known user — auto login
          onAuthenticated(user);
        }
      } else {
        Alert.alert('Authentication Failed', 'Try again');
      }
    } catch (error) {
      Alert.alert('Error', 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const registerUser = async (role: 'patient' | 'caregiver', fingerprintId: string) => {
    const name = role === 'patient' ? 'Mrs. Sharma' : 'Arjun (Son)';
    const newUser: User = {
      id: Date.now().toString(),
      name,
      role,
      fingerprintId,
    };

    // Save fingerprint ID for future logins
    await AsyncStorage.setItem('currentFingerprintId', fingerprintId);
    Alert.alert('Welcome!', `Logged in as ${name} (${role})`);
    onAuthenticated(newUser);
  };

  useEffect(() => {
    authenticate();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NeuroLink</Text>
      <Text style={styles.subtitle}>Touch to Remember</Text>
      <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />
      <Text style={styles.hint}>Place your finger on the sensor...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f8ff', padding: 20 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#007bff' },
  subtitle: { fontSize: 18, color: '#555', marginTop: 10 },
  hint: { marginTop: 20, color: '#777', fontStyle: 'italic' },
});