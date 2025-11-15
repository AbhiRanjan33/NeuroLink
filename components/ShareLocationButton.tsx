import React, { useState } from 'react';
import { TouchableOpacity, Text, Alert, ActivityIndicator, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

// UPDATE WITH YOUR NGROK URL
const API_URL = 'http://172.16.197.52:5000'; 

interface Props {
  userId: string;
}

export default function ShareLocationButton({ userId }: Props) {
  const [isSharing, setIsSharing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [watcher, setWatcher] = useState<Location.LocationSubscription | null>(null);
  const [lastCoords, setLastCoords] = useState<string | null>(null);

  const startSharing = async () => {
    setLoading(true);

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Location access required.');
      setLoading(false);
      return;
    }

    try {
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 10,
        },
        async (location) => {
          const { latitude, longitude } = location.coords;
          const coordsStr = `${longitude.toFixed(6)}, ${latitude.toFixed(6)}`;

          console.log('Sending:', { userId, latitude, longitude });

          try {
            const res = await fetch(`${API_URL}/update-location`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, latitude, longitude }),
            });

            const data = await res.json();
            if (res.ok) {
              setLastCoords(coordsStr);
              console.log('Saved to DB:', data);
            } else {
              console.log('Server error:', data);
            }
          } catch (err: any) {
            console.log('Network failed:', err?.message || err);
          }
        }
      );

      setWatcher(subscription);
      setIsSharing(true);
      Alert.alert('Live Tracking ON', 'Keep app open.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to start live location');
    } finally {
      setLoading(false);
    }
  };

  const stopSharing = () => {
    watcher?.remove();
    setWatcher(null);
    setIsSharing(false);
    setLastCoords(null);
    Alert.alert('Tracking OFF');
  };

  return (
    <View>
      <TouchableOpacity
        style={{
          backgroundColor: isSharing ? '#DC3545' : '#6B5E4C',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          justifyContent: 'center',
        }}
        onPress={isSharing ? stopSharing : startSharing}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Ionicons name={isSharing ? 'location' : 'location-outline'} size={20} color="#FFF" />
        )}
        <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>
          {isSharing ? 'Sharing...' : 'Share'}
        </Text>
      </TouchableOpacity>

      {lastCoords && (
        <Text style={{ marginTop: 6, fontSize: 12, color: '#6B5E4C', textAlign: 'center' }}>
          Last: {lastCoords}
        </Text>
      )}
    </View>
  );
}