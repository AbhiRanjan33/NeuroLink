// components/Journal.tsx
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
const API_URL = 'http://172.16.196.91:5000'; 

const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/drqhllyex/upload';
const ASSEMBLYAI_API_KEY = '0b720f5b3a994bba9608e74b657aa750';

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

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

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
      setText('Error: Check internet or API key');
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>My Journal</Text>

          {/* VOICE RECORDING CARD */}
          <View style={styles.voiceCard}>
            <View style={styles.voiceHeader}>
              <Ionicons name="mic" size={24} color="#6B5E4C" />
              <Text style={styles.voiceTitle}>Voice Note</Text>
            </View>
            
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordingButton]}
              onPress={isRecording ? stopRecording : startRecording}
              disabled={uploading || saving || isTranscribing}
            >
              <Ionicons 
                name={isRecording ? "stop-circle" : "mic-circle"} 
                size={28} 
                color="#FFFFFF" 
              />
              <Text style={styles.recordButtonText}>
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </Text>
            </TouchableOpacity>

            {isTranscribing && (
              <View style={styles.transcribingContainer}>
                <ActivityIndicator size="small" color="#6B5E4C" />
                <Text style={styles.transcribingText}>Transcribing your voice...</Text>
              </View>
            )}
          </View>

          {/* TEXT INPUT CARD */}
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Your Memory</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Your voice note will appear here or write manually..."
              placeholderTextColor="#999"
              value={text}
              onChangeText={setText}
              multiline
              numberOfLines={6}
              editable={!isTranscribing}
            />
          </View>

          {/* MEDIA SECTION */}
          <View style={styles.mediaCard}>
            <View style={styles.mediaHeader}>
              <Ionicons name="images" size={24} color="#6B5E4C" />
              <Text style={styles.mediaTitle}>Add Media</Text>
            </View>
            
            {!mediaUri ? (
              <TouchableOpacity
                style={styles.addMediaButton}
                onPress={pickMedia}
                disabled={uploading || isRecording || isTranscribing}
              >
                <Ionicons name="add-circle-outline" size={32} color="#6B5E4C" />
                <Text style={styles.addMediaText}>
                  {uploading ? 'Uploading...' : 'Add Photo or Video'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.mediaPreview}>
                <Image source={{ uri: mediaUri }} style={styles.mediaThumbnail} />
                <TextInput
                  style={styles.captionInput}
                  placeholder="Add a caption (optional)"
                  placeholderTextColor="#999"
                  value={caption}
                  onChangeText={setCaption}
                />
                <TouchableOpacity style={styles.removeMediaButton} onPress={removeMedia}>
                  <Ionicons name="trash-outline" size={20} color="#DC3545" />
                  <Text style={styles.removeMediaText}>Remove Media</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* SAVE BUTTON */}
          <TouchableOpacity
            style={[styles.saveButton, (saving || uploading || isRecording || isTranscribing) && styles.saveButtonDisabled]}
            onPress={saveJournal}
            disabled={saving || uploading || isRecording || isTranscribing}
          >
            {saving ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.saveButtonText}>  Saving...</Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>  Save Memory</Text>
              </>
            )}
          </TouchableOpacity>

          {/* JOURNAL ENTRIES LIST */}
          <View style={styles.memoriesSection}>
            <Text style={styles.memoriesTitle}>Past Memories</Text>
            <ScrollView style={styles.memoriesList} showsVerticalScrollIndicator={false}>
              {journals.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="journal-outline" size={48} color="#CCC" />
                  <Text style={styles.emptyText}>No memories yet</Text>
                  <Text style={styles.emptySubtext}>Start by recording your first voice note!</Text>
                </View>
              ) : (
                journals
                  .slice()
                  .reverse()
                  .map((entry, i) => (
                    <View key={i} style={styles.memoryCard}>
                      {entry.mediaUrl && (
                        <View style={styles.memoryMediaContainer}>
                          {entry.mediaUrl.includes('/image/') ? (
                            <Image source={{ uri: entry.mediaUrl }} style={styles.memoryMedia} />
                          ) : (
                            <VideoEntry url={entry.mediaUrl} />
                          )}
                        </View>
                      )}
                      {entry.caption && (
                        <Text style={styles.memoryCaption}>{entry.caption}</Text>
                      )}
                      <Text style={styles.memoryText}>{entry.text}</Text>
                      <View style={styles.memoryFooter}>
                        <Ionicons name="time-outline" size={14} color="#999" />
                        <Text style={styles.memoryTimestamp}>
                          {new Date(entry.timestamp).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  ))
              )}
            </ScrollView>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

// === VIDEO PLAYER ===
function VideoEntry({ url }: { url: string }) {
  const video = useRef<any>(null);
  const [status, setStatus] = useState<any>({});

  return (
    <View style={styles.videoContainer}>
      <Video
        ref={video}
        source={{ uri: url }}
        style={styles.memoryMedia}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        isLooping
        onPlaybackStatusUpdate={setStatus}
      />
      <TouchableOpacity
        style={styles.videoPlayButton}
        onPress={() => (status.isPlaying ? video.current?.pauseAsync() : video.current?.playAsync())}
      >
        <Ionicons 
          name={status.isPlaying ? "pause-circle" : "play-circle"} 
          size={56} 
          color="#FFFFFF" 
        />
      </TouchableOpacity>
    </View>
  );
}

// === STYLES - MINDBLOOM THEME ===
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F5F1E8',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#2C2416',
    marginBottom: 20,
    textAlign: 'center',
  },
  
  // Voice Recording Card
  voiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  voiceTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2416',
    marginLeft: 10,
  },
  recordButton: {
    backgroundColor: '#6B5E4C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
  },
  recordingButton: {
    backgroundColor: '#DC3545',
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  transcribingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F5F1E8',
    borderRadius: 12,
  },
  transcribingText: {
    marginLeft: 10,
    color: '#6B5E4C',
    fontSize: 14,
    fontWeight: '500',
  },

  // Text Input Card
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2416',
    marginBottom: 12,
  },
  textInput: {
    fontSize: 15,
    color: '#2C2416',
    lineHeight: 22,
    textAlignVertical: 'top',
    minHeight: 120,
  },

  // Media Card
  mediaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  mediaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  mediaTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2416',
    marginLeft: 10,
  },
  addMediaButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderWidth: 2,
    borderColor: '#E8DCC4',
    borderRadius: 16,
    borderStyle: 'dashed',
  },
  addMediaText: {
    marginTop: 8,
    fontSize: 15,
    color: '#6B5E4C',
    fontWeight: '500',
  },
  mediaPreview: {
    alignItems: 'center',
  },
  mediaThumbnail: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    marginBottom: 12,
  },
  captionInput: {
    width: '100%',
    backgroundColor: '#F5F1E8',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#2C2416',
    marginBottom: 12,
  },
  removeMediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FFF5F5',
  },
  removeMediaText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#DC3545',
    fontWeight: '600',
  },

  // Save Button
  saveButton: {
    backgroundColor: '#4A5D3F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },

  // Memories Section
  memoriesSection: {
    flex: 1,
  },
  memoriesTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C2416',
    marginBottom: 16,
  },
  memoriesList: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#BBB',
    marginTop: 6,
  },
  memoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  memoryMediaContainer: {
    marginBottom: 12,
  },
  memoryMedia: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  videoContainer: {
    position: 'relative',
  },
  videoPlayButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -28 }, { translateY: -28 }],
  },
  memoryCaption: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#6B5E4C',
    marginBottom: 8,
  },
  memoryText: {
    fontSize: 15,
    color: '#2C2416',
    lineHeight: 22,
    marginBottom: 12,
  },
  memoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memoryTimestamp: {
    fontSize: 12,
    color: '#999',
    marginLeft: 6,
  },
});