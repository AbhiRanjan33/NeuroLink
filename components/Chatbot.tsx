import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
const API_URL = 'http://172.16.197.52:5000';

interface Props {
  onBack: () => void;
  userId: string;
  chatId?: string | null;
  onNewChatAssigned?: (chatId: string) => void;
  userName?: string | null;
}

type Msg = { role: 'user' | 'assistant'; text: string; createdAt?: string };

export default function Chatbot({ onBack, userId, chatId, onNewChatAssigned, userName }: Props) {
  const [currentChatId, setCurrentChatId] = useState<string | null>(chatId || null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const listRef = useRef<FlatList>(null);

  async function ensureChat() {
    if (currentChatId) return;
    const r = await fetch(`${API_URL}/chat/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const j = await r.json();
    if (j?.success && j.chatId) {
      setCurrentChatId(j.chatId);
      onNewChatAssigned && onNewChatAssigned(j.chatId);
    }
  }

  async function loadMessages(id: string) {
    const r = await fetch(`${API_URL}/chat/messages?userId=${encodeURIComponent(userId)}&chatId=${encodeURIComponent(id)}`);
    const j = await r.json();
    if (j?.success && j.chat?.messages) {
      setMessages(j.chat.messages);
    } else {
      setMessages([]);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        if (!currentChatId) await ensureChat();
        const id = currentChatId || (await (async () => {
          const r = await fetch(`${API_URL}/chat/list?userId=${encodeURIComponent(userId)}`);
          const j = await r.json();
          return (j?.chats?.[0]?.chatId) || null;
        })());
        if (id) {
          setCurrentChatId(id);
          await loadMessages(id);
        }
      } finally {
        setBooting(false);
      }
    })();
  }, [currentChatId, userId]);

  async function send() {
    const t = text.trim();
    if (!t || !currentChatId) return;
    setText('');
    setLoading(true);
    // optimistic update
    setMessages(prev => [...prev, { role: 'user', text: t, createdAt: new Date().toISOString() }]);
    try {
      const r = await fetch(`${API_URL}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, chatId: currentChatId, text: t, userName }),
      });
      const j = await r.json();
      if (j?.success && j.reply) {
        setMessages(prev => [...prev, { role: 'assistant', text: j.reply, createdAt: new Date().toISOString() }]);
      }
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  const renderItem = ({ item }: { item: Msg }) => {
    const self = item.role === 'user';
    return (
      <View style={[styles.bubble, self ? styles.bubbleSelf : styles.bubbleOther]}>
        <Text style={[styles.bubbleText, self ? styles.bubbleTextSelf : styles.bubbleTextOther]}>{item.text}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#6B5E4C" />
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AI Assistant</Text>
      </View>
      {booting ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#6B5E4C" />
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message…"
              placeholderTextColor="#999"
              value={text}
              onChangeText={setText}
              multiline
            />
            <TouchableOpacity style={[styles.sendBtn, (loading || !text.trim()) && styles.disabled]} onPress={send} disabled={loading || !text.trim()}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Ionicons name="send" size={18} color="#FFF" />}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F1E8' },
  headerRow: { paddingTop: 50, paddingBottom: 8, paddingHorizontal: 20, backgroundColor: '#F5F1E8' },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  backButtonText: { marginLeft: 8, fontSize: 16, color: '#6B5E4C', fontWeight: '500' },
  title: { fontSize: 22, fontWeight: '600', color: '#2C2416', marginTop: 6 },
  list: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 14, marginVertical: 6 },
  bubbleSelf: { alignSelf: 'flex-end', backgroundColor: '#E8DCC4' },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF' },
  bubbleText: { fontSize: 15 },
  bubbleTextSelf: { color: '#2C2416' },
  bubbleTextOther: { color: '#2C2416' },
  composer: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, backgroundColor: '#F5F1E8' },
  input: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E8DCC4', color: '#2C2416', maxHeight: 120 },
  sendBtn: { backgroundColor: '#4A5D3F', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 },
  disabled: { opacity: 0.6 },
});


