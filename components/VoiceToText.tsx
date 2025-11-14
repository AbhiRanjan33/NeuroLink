// components/VoiceToText.tsx
import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { WebView } from 'react-native-webview';

interface VoiceToTextProps {
  onText: (text: string) => void;
  onStart: () => void;
  onEnd: () => void;
}

export default function VoiceToText({ onText, onStart, onEnd }: VoiceToTextProps) {
  const [recording, setRecording] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { margin: 0; padding: 20px; background: #f0f8ff; }
          button { padding: 15px; font-size: 18px; background: #007bff; color: white; border: none; border-radius: 50%; width: 70px; height: 70px; }
        </style>
      </head>
      <body>
        <button id="mic">Microphone</button>
        <script>
          const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
          recognition.lang = 'en-US';
          recognition.continuous = true;
          recognition.interimResults = true;

          const mic = document.getElementById('mic');
          let finalTranscript = '';

          recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'final', text: finalTranscript }));
              } else {
                interim += transcript;
              }
            }
          };

          recognition.onerror = (e) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: e.error }));
          };

          recognition.onstart = () => {
            mic.style.background = '#dc3545';
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'start' }));
          };

          recognition.onend = () => {
            mic.style.background = '#007bff';
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'end' }));
          };

          mic.onclick = () => {
            if (recognition.running) {
              recognition.stop();
            } else {
              finalTranscript = '';
              recognition.start();
            }
          };
        </script>
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        key={webViewKey}
        source={{ html }}
        style={{ height: 0, width: 0 }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'final') {
              onText(data.text.trim());
            } else if (data.type === 'start') {
              onStart();
              setRecording(true);
            } else if (data.type === 'end') {
              onEnd();
              setRecording(false);
            } else if (data.type === 'error') {
              Alert.alert('Speech Error', data.message);
              onEnd();
              setRecording(false);
            }
          } catch (e) {}
        }}
      />
      <TouchableOpacity
        style={[styles.micButton, recording && styles.recording]}
        onPress={() => {
          setWebViewKey(webViewKey + 1);
        }}
      >
        <Text style={styles.micIcon}>{recording ? 'Stop' : 'Microphone'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  micButton: {
    backgroundColor: '#007bff',
    padding: 14,
    borderRadius: 50,
  },
  recording: { backgroundColor: '#dc3545' },
  micIcon: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});