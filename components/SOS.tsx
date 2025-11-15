import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const API_URL = 'http://172.16.197.52:5000';

interface SOSProps {
  onBack: () => void;
  userId: string;
  userName?: string | null;
}

export default function SOS({ onBack, userId, userName }: SOSProps) {
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function triggerSOS() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sos/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      // Check if response is OK and has JSON content
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = `Server error: ${res.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Check content type before parsing JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Expected JSON but got: ${contentType}. Response: ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      if (data.success) {
        const message = data.callsPlaced > 0
          ? `Emergency calls have been placed to ${data.callsPlaced} out of ${data.totalContacts} family member(s).`
          : `Failed to place calls to any family members. Please check your family contacts.`;
        
        Alert.alert(
          'SOS Sent',
          message,
          [{ text: 'OK', onPress: () => { setConfirmed(false); onBack(); } }]
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to send SOS');
        setConfirmed(false);
      }
    } catch (e: any) {
      console.error('SOS trigger error:', e);
      Alert.alert('Error', e?.message || 'Network error. Please check your connection and try again.');
      setConfirmed(false);
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

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="warning" size={80} color="#DC3545" />
        </View>

        <Text style={styles.title}>Emergency SOS</Text>
        <Text style={styles.subtitle}>
          {confirmed
            ? 'Are you sure you want to call your family members for emergency help?'
            : 'Press the button below to send an emergency alert to your family members.'}
        </Text>

        {!confirmed ? (
          <TouchableOpacity
            style={styles.sosButton}
            onPress={triggerSOS}
            disabled={loading}
          >
            <Ionicons name="call" size={32} color="#FFFFFF" />
            <Text style={styles.sosButtonText}>SOS Emergency</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.confirmationBox}>
            <Text style={styles.confirmationText}>
              This will call all registered family members immediately.
            </Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setConfirmed(false)}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={triggerSOS}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="call" size={20} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>Continue to SOS</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F1E8',
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#6B5E4C',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#DC3545',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B5E4C',
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  sosButton: {
    backgroundColor: '#DC3545',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#DC3545',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  confirmationBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmationText: {
    fontSize: 16,
    color: '#2C2416',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#E8DCC4',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6B5E4C',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#DC3545',
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});