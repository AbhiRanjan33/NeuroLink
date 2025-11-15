import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
const API_URL = 'http://172.16.197.52:5000';

interface Props {
  onBack: () => void;
  userId: string;
}

export default function FaceRecognition({ onBack, userId }: Props) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ personName?: string; journalText?: string | null; journalImageUrl?: string | null; confidence?: number } | null>(null);

  async function takePhoto() {
    setResult(null);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera permission is required to take a photo.');
      return;
    }
    const photo = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (!photo.canceled) {
      const asset = photo.assets[0];
      setImageUri(asset.uri);
      setImageBase64(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null);
    }
  }

  async function recognize() {
    if (!imageBase64 && !imageUri) {
      Alert.alert('No image', 'Please take a photo first.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch(`${API_URL}/people/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, imageBase64 }),
      });
      const j = await resp.json();
      if (!j?.success) {
        throw new Error(j?.error || 'Recognition failed');
      }
      const match = j.match;
      const journal = j.journal;
      setResult({
        personName: match?.personName,
        journalText: journal?.text || null,
        journalImageUrl: journal?.mediaUrl || null,
        confidence: match?.confidence,
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to recognize');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Ionicons name="arrow-back" size={24} color="#6B5E4C" />
        <Text style={styles.backButtonText}>Back to Home</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Face Recognition</Text>

      <View style={styles.card}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} />
        ) : (
          <View style={[styles.preview, styles.previewPlaceholder]}>
            <Ionicons name="camera-outline" size={40} color="#6B5E4C" />
            <Text style={{ color: '#6B5E4C', marginTop: 8 }}>No image captured</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TouchableOpacity style={styles.primaryButton} onPress={takePhoto}>
            <Text style={styles.primaryButtonText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, (!imageBase64 && !imageUri) && styles.disabled]} onPress={recognize} disabled={!imageBase64 && !imageUri || loading}>
            {loading ? <ActivityIndicator color="#6B5E4C" /> : <Text style={styles.secondaryButtonText}>Recognize</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Result</Text>
        {!result ? (
          <Text style={{ color: '#6B5E4C' }}>No result yet.</Text>
        ) : result.personName ? (
          <View>
            <Text style={{ color: '#2C2416', marginBottom: 6 }}>Person: {result.personName}</Text>
            {typeof result.confidence === 'number' && (
              <Text style={{ color: '#6B5E4C', marginBottom: 6 }}>Confidence: {(result.confidence * 100).toFixed(1)}%</Text>
            )}
            {result.journalText ? (
              <View style={styles.journalBox}>
                <Text style={styles.journalTitle}>Related Journal</Text>
                <Text style={styles.journalText}>{result.journalText}</Text>
              </View>
            ) : (
              <Text style={{ color: '#6B5E4C' }}>No related journal text found.</Text>
            )}
            {result.journalImageUrl ? (
              <Image source={{ uri: result.journalImageUrl }} style={styles.journalImage} />
            ) : null}
          </View>
        ) : (
          <Text style={{ color: '#6B5E4C' }}>No match found.</Text>
        )}
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
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 16,
  },
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#EEE' },
  previewPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  primaryButton: { backgroundColor: '#4A5D3F', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  secondaryButton: { backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#6B5E4C' },
  secondaryButtonText: { color: '#6B5E4C', fontWeight: '700' },
  disabled: { opacity: 0.6 },
  sectionTitle: { fontWeight: '700', color: '#2C2416', marginBottom: 6 },
  journalBox: { marginTop: 8, backgroundColor: '#F9F5ED', borderRadius: 10, padding: 10 },
  journalTitle: { color: '#2C2416', fontWeight: '700', marginBottom: 6 },
  journalText: { color: '#2C2416' },
  journalImage: { marginTop: 10, width: '100%', height: 180, borderRadius: 10, backgroundColor: '#EEE' },
});


