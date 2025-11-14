// components/games/QuizGame.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
const API_URL = 'http://172.16.196.91:5000'; 

interface QuizGameProps {
  onBack: () => void;
  journals?: { text?: string; caption?: string; timestamp?: string }[];
  userId?: string;
}

type Q = { q: string; options: string[]; answer: number };

export default function QuizGame({ onBack, journals = [], userId }: QuizGameProps) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<{ score: number; total: number; createdAt: string }[]>([]);
  const current = questions[idx];
  const finished = questions.length > 0 ? idx >= questions.length : false;

  useEffect(() => {
    async function fetchQuiz() {
      try {
        setLoading(true);
        setError(null);
        // First, ask backend to run the local python script to generate quiz
        const autoResp = await fetch(`${API_URL}/quiz/run-script`, { method: 'GET', headers: { Accept: 'application/json' } });
        let data: any | null = null;
        if (autoResp.ok && (autoResp.headers.get('content-type') || '').includes('application/json')) {
          data = await autoResp.json();
        }

        // Fallback: use generator service directly (Flask)
        if (!data || !data.questions) {
          // Try auto endpoint first
          const autoFlask = await fetch('http://127.0.0.1:5001/generate-memory-quiz-auto', { method: 'GET', headers: { Accept: 'application/json' } });
          if (autoFlask.ok && (autoFlask.headers.get('content-type') || '').includes('application/json')) {
            data = await autoFlask.json();
          }
        }
        if (!data || !data.questions) {
          // Final fallback: post journals
          const resp = await fetch('http://127.0.0.1:5001/generate-memory-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ journals }),
          });
          const contentType = resp.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const text = await resp.text();
            throw new Error(`Non-JSON from generator (${resp.status}): ${text.slice(0, 200)}`);
          }
          data = await resp.json();
        }
        if (!data?.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
          throw new Error('Generator returned no questions');
        }
        const mapped: Q[] = data.questions
          .map((q: any) => {
            const options: string[] = Array.isArray(q.options) ? q.options : [];
            const correctText: string = q.correct ?? '';
            const answerIdx = options.findIndex((o) => o === correctText);
            return {
              q: typeof q.question === 'string' && q.question.trim().length ? q.question : 'Question',
              options: options.length ? options : ['A', 'B', 'C', 'D'],
              answer: answerIdx >= 0 ? answerIdx : 0,
            };
          })
          .filter((q: Q) => Array.isArray(q.options) && q.options.length > 0);
        if (mapped.length === 0) {
          throw new Error('No valid questions after parsing');
        }
        setQuestions(mapped);
        setIdx(0);
        setSelected(null);
        setScore(0);
      } catch (e: any) {
        setError(e?.message || 'Failed to load quiz');
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    }
    if (ready) {
      fetchQuiz();
    } else {
      setLoading(false);
    }
  }, [ready, JSON.stringify(journals)]);

  useEffect(() => {
    async function fetchHistory() {
      if (!userId) return;
      try {
        const r = await fetch(`${API_URL}/quiz/history?userId=${encodeURIComponent(userId)}`);
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return;
        const j = await r.json();
        if (j?.success && Array.isArray(j.quizScores)) {
          setHistory(j.quizScores);
        }
      } catch {}
    }
    fetchHistory();
  }, [userId, finished]);

  async function saveScore() {
    if (!userId) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/quiz/save-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, score, total: questions.length }),
      });
      const j = await r.json();
      if (j?.success && Array.isArray(j.quizScores)) {
        setHistory(j.quizScores);
      }
      setSaved(true);
    } catch {}
    finally {
      setSaving(false);
    }
  }

  // Auto-save when finished
  useEffect(() => {
    if (finished && userId && !saved && questions.length > 0) {
      saveScore();
    }
  }, [finished, userId, saved, questions.length]);

  function pick(i: number) {
    if (selected !== null || finished) return;
    setSelected(i);
    if (i === current.answer) setScore(s => s + 1);
    setTimeout(() => {
      setIdx(i => i + 1);
      setSelected(null);
    }, 700);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#6B5E4C" />
          <Text style={styles.backButtonText}>Back to Dojo</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Quiz</Text>
      </View>

      {!ready ? (
        <View style={styles.cardCenter}>
          <Text style={styles.introTitle}>Ready to take your quiz?</Text>
          <Text style={styles.introSubtitle}>We’ll generate questions from your recent memories.</Text>
          <TouchableOpacity style={styles.startBtn} onPress={() => setReady(true)}>
            <Text style={styles.startBtnText}>I’m Ready</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={styles.cardCenter}>
          <ActivityIndicator size="large" color="#4A5D3F" />
          {error ? <Text style={{ marginTop: 10, color: '#6B5E4C' }}>{error}</Text> : null}
        </View>
      ) : !questions.length ? (
        <View style={styles.cardCenter}>
          <Text style={styles.introTitle}>Couldn’t load your quiz</Text>
          {!!error && <Text style={styles.introSubtitle}>{error}</Text>}
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => {
              // retrigger fetch
              setLoading(true);
              setReady((r) => !r);
              setTimeout(() => setReady(true), 0);
            }}
          >
            <Text style={styles.startBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : !finished ? (
        <View style={styles.card}>
          <Text style={styles.question}>{current?.q ?? ''}</Text>
          <View style={styles.options}>
            {current?.options?.map((opt, i) => {
              const isSel = selected === i;
              const isCorrect = selected !== null && i === (current?.answer ?? -1);
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.option,
                    isSel && styles.optionSelected,
                    isCorrect && styles.optionCorrect,
                    isSel && !isCorrect && styles.optionWrong,
                  ]}
                  onPress={() => pick(i)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.optionText}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.progress}>Question {idx + 1} of {questions.length}</Text>
        </View>
      ) : (
        <View style={styles.cardCenter}>
          <Ionicons name="trophy-outline" size={48} color="#4A5D3F" />
          <Text style={styles.scoreTitle}>Your Score</Text>
          <Text style={styles.scoreValue}>{score} / {questions.length}</Text>
          <Text style={{ marginTop: 8, color: '#6B5E4C' }}>
            {saving ? 'Saving…' : saved ? 'Saved' : 'Finalizing…'}
          </Text>
        </View>
      )}

      {/* Always-visible history (scrollable) */}
      <View style={styles.historyCard}>
        <Text style={styles.historyTitle}>Past Quiz Scores</Text>
        {history.length === 0 ? (
          <Text style={styles.historyEmpty}>No scores yet.</Text>
        ) : (
          <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
            {history.map((h, i) => (
              <View key={i} style={styles.historyRow}>
                <Ionicons name="time-outline" size={16} color="#6B5E4C" />
                <Text style={styles.historyText}>
                  {new Date(h.createdAt).toLocaleString()} • {h.score}/{h.total}
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
  container: { flex: 1, backgroundColor: '#F5F1E8' },
  header: { paddingTop: 50, paddingHorizontal: 20, paddingBottom: 10 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backButtonText: { marginLeft: 8, fontSize: 16, color: '#6B5E4C', fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '600', color: '#2C2416' },
  card: {
    margin: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardCenter: {
    margin: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  question: { fontSize: 18, color: '#2C2416', fontWeight: '600', marginBottom: 16 },
  options: { gap: 10 },
  option: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E8DCC4',
  },
  optionSelected: { borderColor: '#6B5E4C' },
  optionCorrect: { backgroundColor: '#E8F0E5', borderColor: '#4A5D3F' },
  optionWrong: { backgroundColor: '#FFF5F5', borderColor: '#DC3545' },
  optionText: { color: '#2C2416', fontSize: 16, fontWeight: '500' },
  progress: { marginTop: 14, color: '#6B5E4C', fontSize: 13, textAlign: 'right' },
  scoreTitle: { marginTop: 10, fontSize: 16, color: '#2C2416' },
  scoreValue: { marginTop: 6, fontSize: 22, color: '#4A5D3F', fontWeight: '700' },
  introTitle: { fontSize: 20, color: '#2C2416', fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  introSubtitle: { fontSize: 14, color: '#6B5E4C', marginBottom: 16, textAlign: 'center' },
  startBtn: { backgroundColor: '#4A5D3F', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 8 },
  startBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  historyCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  historyTitle: { fontSize: 14, fontWeight: '700', color: '#2C2416', marginBottom: 8 },
  historyEmpty: { color: '#6B5E4C' },
  historyList: { maxHeight: 220 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8DCC4' },
  historyText: { marginLeft: 8, color: '#2C2416' },
});


