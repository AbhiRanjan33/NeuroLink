import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Switch, // Built-in React Native Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const API_URL = 'http://172.16.197.52:5000';

interface RemindersProps {
  onBack: () => void;
  userId: string;
}

type Reminder = {
  date: string;
  time: string;
  message: string;
  createdAt: string;
  createdBy?: string | null;
};

export default function Reminders({ onBack, userId }: RemindersProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Reminder[]>([]);
  const [parsed, setParsed] = useState<{ date: string; time: string; message: string } | null>(null);

  // Phone reminder states
  const [phoneToggle, setPhoneToggle] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);

  // Load reminder history
  async function loadHistory() {
    try {
      const r = await fetch(`${API_URL}/reminders/history?userId=${encodeURIComponent(userId)}`, {
        headers: { Accept: 'application/json' },
      });
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return;
      const j = await r.json();
      if (j?.success && Array.isArray(j.reminders)) {
        setHistory(j.reminders);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  // Load phone reminder settings
  async function loadPhoneSettings() {
    try {
      const r = await fetch(`${API_URL}/reminders/phone-settings?userId=${encodeURIComponent(userId)}`);
      if (!r.ok) return;
      const j = await r.json();
      if (j.success) {
        setPhoneToggle(!!j.phoneRemindersEnabled);
        setPhoneInput(j.phoneNumber || '');
        setShowPhoneInput(!!j.phoneRemindersEnabled && !!j.phoneNumber);
      }
    } catch (err) {
      console.error('Failed to load phone settings:', err);
    }
  }

  useEffect(() => {
    loadHistory();
    loadPhoneSettings();
  }, [userId]);

  // Analyze & Save reminder
  async function analyzeAndSave() {
    if (!text.trim()) {
      setError('Please enter some text.');
      return;
    }
    setError(null);
    setLoading(true);
    setParsed(null);
    try {
      const a = await fetch(`${API_URL}/reminders/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ text }),
      });
      const ca = a.headers.get('content-type') || '';
      if (!a.ok || !ca.includes('application/json')) {
        const raw = await a.text();
        throw new Error(raw.slice(0, 200) || 'Analyzer error');
      }
      const aj = await a.json();
      const result = aj?.result;
      if (!result) throw new Error('No result from analyzer');
      if (typeof result === 'string' && result.trim().toUpperCase() === 'NO') {
        setError('No reminder detected.');
        return;
      }
      const date = String(result.date || '').trim();
      const time = String(result.time || '').trim();
      const message = String(result.message || '').trim();
      if (!date || !time || !message) {
        setError('Analyzer returned incomplete reminder.');
        return;
      }
      setParsed({ date, time, message });

      const s = await fetch(`${API_URL}/reminders/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ userId, date, time, message }),
      });
      const cs = s.headers.get('content-type') || '';
      if (!cs.includes('application/json')) throw new Error('Save failed');
      const sj = await s.json();
      if (!sj?.success) throw new Error(sj?.error || 'Save failed');
      setHistory(sj.reminders || []);
      setText('');
    } catch (e: any) {
      setError(e?.message || 'Failed to create reminder');
    } finally {
      setLoading(false);
    }
  }

  // Save phone settings
  async function savePhoneSettings() {
    if (!phoneToggle) {
      setShowPhoneInput(false);
      setPhoneInput('');
      await sendPhoneUpdate(null, false);
      return;
    }

    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setError('Please enter a valid phone number.');
      setPhoneToggle(false);
      setShowPhoneInput(false);
      return;
    }

    await sendPhoneUpdate(trimmed, true);
  }

  async function sendPhoneUpdate(number: string | null, enabled: boolean) {
    setPhoneSaving(true);
    try {
      const r = await fetch(`${API_URL}/reminders/phone-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, phoneNumber: number, enabled }),
      });
      if (!r.ok) throw new Error('Failed to save phone settings');
      const j = await r.json();
      if (j.success) {
        setPhoneToggle(enabled);
        setShowPhoneInput(enabled && !!number);
        setPhoneInput(number || '');
        setError(null);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save phone settings');
    } finally {
      setPhoneSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Ionicons name="arrow-back" size={24} color="#6B5E4C" />
        <Text style={styles.backButtonText}>Back to Home</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Reminders</Text>

      <View style={styles.inputCard}>
        <Text style={styles.label}>Type your reminder in natural language</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Tomorrow at 9am call doctor"
          placeholderTextColor="#999"
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabledButton]}
          onPress={analyzeAndSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Analyze & Save</Text>
          )}
        </TouchableOpacity>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {!!parsed && (
          <View style={styles.preview}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#4A5D3F" />
            <Text style={styles.previewText}>
              {parsed.date} • {parsed.time} — {parsed.message}
            </Text>
          </View>
        )}

        {/* PHONE REMINDER TOGGLE */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Phone reminders</Text>
          <Switch
            value={phoneToggle}
            onValueChange={async (val) => {
              setPhoneToggle(val);
              if (!val) {
                await sendPhoneUpdate(null, false);
              } else {
                setShowPhoneInput(true);
              }
            }}
            disabled={phoneSaving}
            trackColor={{ false: '#CCC', true: '#4A5D3F' }}
            thumbColor="#FFF"
            ios_backgroundColor="#CCC"
          />
        </View>

        {showPhoneInput && (
          <View style={styles.phoneInputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="e.g. +1 555 123 4567"
              placeholderTextColor="#999"
              value={phoneInput}
              onChangeText={setPhoneInput}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.primaryButton, phoneSaving && styles.disabledButton]}
              onPress={savePhoneSettings}
              disabled={phoneSaving}
            >
              {phoneSaving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Save Number</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.historyCard}>
        <Text style={styles.historyTitle}>Reminder History</Text>
        {history.length === 0 ? (
          <Text style={styles.historyEmpty}>No reminders yet.</Text>
        ) : (
          <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
            {history.map((r, idx) => (
              <View key={idx} style={styles.historyRow}>
                <Ionicons name="time-outline" size={16} color="#6B5E4C" />
                <Text style={styles.historyText}>
                  {r.date} • {r.time} — {r.message}
                </Text>
              </View>
            ))}
          </ScrollView>
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
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#6B5E4C',
    fontWeight: '500',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: '#2C2416',
    marginBottom: 12,
    textAlign: 'center',
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  label: {
    color: '#6B5E4C',
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    minHeight: 60,
    borderWidth: 1,
    borderColor: '#E8DCC4',
    color: '#2C2416',
  },
  primaryButton: {
    backgroundColor: '#4A5D3F',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: '#B8423A',
    marginTop: 8,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  previewText: {
    color: '#2C2416',
  },

  // NEW STYLES FOR PHONE TOGGLE
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  toggleLabel: {
    fontSize: 15,
    color: '#2C2416',
    fontWeight: '600',
  },
  phoneInputWrapper: {
    marginTop: 12,
  },

  // HISTORY STYLES
  historyCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C2416',
    marginBottom: 8,
  },
  historyEmpty: {
    color: '#6B5E4C',
  },
  historyList: {
    maxHeight: 260,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8DCC4',
  },
  historyText: {
    marginLeft: 8,
    color: '#2C2416',
  },
});