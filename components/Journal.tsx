// components/Journal.tsx
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/drqhllyex/upload';
const API_URL = 'https://neurolink-auth-backend.onrender.com';

// REPLACE WITH YOUR ASSEMBLYAI KEY
const ASSEMBLYAI_API_KEY = '0b720f5b3a994bba9608e74b657aa750'; // ← PUT HERE

interface JournalEntry {
  text: string;
  mediaUrl?: string;
  caption?: string;
  timestamp: string;
}

interface JournalProps {
  userId: string;
  journals: JournalEntry[];
  onJournalSaved: (journals: JournalEntry[]) => void;
}

export default function Journal({ userId, journals, onJournalSaved }: JournalProps) {
  const [text, setText] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // RECORD AUDIO
  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Allow mic in settings');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording');
    }
  }

  // STOP + TRANSCRIBE WITH ASSEMBLYAI
  async function stopRecording() {
    if (!recording) return;
    setIsRecording(false);
    setIsTranscribing(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) throw new Error('No audio file');

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Upload to AssemblyAI
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          authorization: ASSEMBLYAI_API_KEY,
          'content-type': 'application/octet-stream',
        },
        body: FileSystem.EncodingType.Base64.decode(base64),
      });

      const uploadData = await uploadRes.json();
      if (!uploadData.upload_url) throw new Error('Upload failed');

      // Start transcription
      const transcribeRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          authorization: ASSEMBLYAI_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: uploadData.upload_url,
          language_code: 'en',
        }),
      });

      const transcribeData = await transcribeRes.json();
      const transcriptId = transcribeData.id;

      // Poll for result
      let result;
      do {
        await new Promise(r => setTimeout(r, 1500));
        const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
          headers: { authorization: ASSEMBLYAI_API_KEY },
        });
        result = await poll.json();
      } while (result.status !== 'completed' && result.status !== 'error');

      if (result.status === 'completed') {
        setText(result.text || 'No text recognized');
      } else {
        setText('Transcription failed. Try again.');
      }
    } catch (err) {
      console.error(err);
      setText('Error: Check internet or API key390 key');
    } finally {
      setIsTranscribing(false);
    }
  }

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);
    }
  };

  const removeMedia = () => {
    setMediaUri(null);
    setCaption('');
  };

  const uploadToCloudinary = async (uri: string): Promise<string | null> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri,
        type: uri.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
        name: `journal_${Date.now()}`,
      } as any);

      formData.append('upload_preset', 'ml_default');

      const res = await fetch(CLOUDINARY_URL, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      return data.secure_url || null;
    } catch (err) {
      Alert.alert('Upload Error', 'Failed to upload media');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const saveJournal = async () => {
    if (!text.trim() && !mediaUri) {
      Alert.alert('Error', 'Add text or media');
      return;
    }

    setSaving(true);
    let mediaUrl = null;
    if (mediaUri) {
      mediaUrl = await uploadToCloudinary(mediaUri);
      if (!mediaUrl) {
        setSaving(false);
        return;
      }
    }

    try {
      const res = await fetch(`${API_URL}/save-journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          text: text.trim(),
          mediaUrl,
          caption: caption.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setText('');
        setCaption('');
        setMediaUri(null);
        onJournalSaved(data.journals);
      } else {
        Alert.alert('Error', data.error);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Journal</Text>

      {/* VOICE RECORDING */}
      <View style={styles.voiceRow}>
        <TouchableOpacity
          style={[styles.micButton, isRecording && styles.recording]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={uploading || saving || isTranscribing}
        >
          <Text style={styles.micText}>
            {isRecording ? 'Stop Recording' : 'Start Voice Note'}
          </Text>
        </TouchableOpacity>
        {isTranscribing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#007bff" />
            <Text style={styles.loadingText}>Transcribing...</Text>
          </View>
        )}
      </View>

      {/* TEXT INPUT */}
      <TextInput
        style={styles.input}
        placeholder="Your voice note will appear here..."
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={4}
        editable={!isTranscribing}
      />

      {/* MEDIA BUTTON */}
      <TouchableOpacity
        style={styles.mediaButton}
        onPress={pickMedia}
        disabled={uploading || isRecording || isTranscribing}
      >
        <Text style={styles.mediaButtonText}>
          {uploading ? 'Uploading...' : mediaUri ? 'Change Media' : 'Add Photo/Video'}
        </Text>
      </TouchableOpacity>

      {/* MEDIA PREVIEW */}
      {mediaUri && (
        <View style={styles.preview}>
          <Image source={{ uri: mediaUri }} style={styles.thumbnail} />
          <TextInput
            style={styles.captionInput}
            placeholder="Add caption (optional)"
            value={caption}
            onChangeText={setCaption}
          />
          <TouchableOpacity style={styles.removeButton} onPress={removeMedia}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SAVE BUTTON */}
      <Button
        title={saving ? 'Saving...' : 'Save Memory'}
        onPress={saveJournal}
        disabled={saving || uploading || isRecording || isTranscribing}
        color="#28a745"
      />

      {/* JOURNAL LIST */}
      <ScrollView style={styles.list}>
        {journals.length === 0 ? (
          <Text style={styles.empty}>No memories yet. Start speaking!</Text>
        ) : (
          journals
            .slice()
            .reverse()
            .map((entry, i) => (
              <View key={i} style={styles.entry}>
                {entry.mediaUrl && (
                  <View style={styles.mediaContainer}>
                    {entry.mediaUrl.includes('/image/') ? (
                      <Image source={{ uri: entry.mediaUrl }} style={styles.media} />
                    ) : (
                      <VideoEntry url={entry.mediaUrl} />
                    )}
                  </View>
                )}
                {entry.caption && <Text style={styles.caption}>{entry.caption}</Text>}
                <Text style={styles.entryText}>{entry.text}</Text>
                <Text style={styles.timestamp}>
                  {new Date(entry.timestamp).toLocaleString()}
                </Text>
              </View>
            ))
        )}
      </ScrollView>
    </View>
  );
}

// === VIDEO PLAYER ===
function VideoEntry({ url }: { url: string }) {
  const video = useRef<any>(null);
  const [status, setStatus] = useState<any>({});

  return (
    <View style={styles.videoWrapper}>
      <Video
        ref={video}
        source={{ uri: url }}
        style={styles.media}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        isLooping
        onPlaybackStatusUpdate={setStatus}
      />
      <TouchableOpacity
        style={styles.playButton}
        onPress={() => (status.isPlaying ? video.current?.pauseAsync() : video.current?.playAsync())}
      >
        <Text style={styles.playIcon}>{status.isPlaying ? 'Pause' : 'Play'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// === STYLES ===
const styles = StyleSheet.create({
  container: { marginTop: 30, width: '100%' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#007bff', marginBottom: 10 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  micButton: {
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  recording: { backgroundColor: '#dc3545' },
  micText: { color: 'white', fontWeight: 'bold' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 15 },
  loadingText: { marginLeft: 8, color: '#007bff', fontWeight: 'bold' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 10,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  mediaButton: {
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  mediaButtonText: { color: 'white', fontWeight: 'bold' },
  preview: { alignItems: 'center', marginVertical: 10 },
  thumbnail: { width: 200, height: 200, borderRadius: 10 },
  captionInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    width: 200,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginTop: 5,
  },
  removeButton: {
    backgroundColor: '#dc3545',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  removeText: { color: 'white', fontWeight: 'bold' },
  list: { maxHeight: 300, marginTop: 15 },
  entry: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#007bff',
  },
  mediaContainer: { position: 'relative', marginBottom: 8 },
  media: { width: '100%', height: 200, borderRadius: 10 },
  videoWrapper: { position: 'relative' },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -40 }, { translateY: -40 }],
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 15,
    borderRadius: 50,
  },
  playIcon: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  caption: { fontStyle: 'italic', color: '#666', marginBottom: 5 },
  entryText: { fontSize: 16, color: '#333' },
  timestamp: { fontSize: 12, color: '#777', marginTop: 5 },
  empty: { color: '#999', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
});