import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Marker, Region, Polyline } from 'react-native-maps';

const API_URL = 'http://172.16.197.52:5000';
const { width } = Dimensions.get('window');

interface GeoLocationProps {
  onBack: () => void;
  userId: string;
}

export default function GeoLocation({ onBack, userId }: GeoLocationProps) {
  const [loading, setLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [savedLocation, setSavedLocation] = useState<{ latitude: number; longitude: number; updatedAt: string } | null>(null);
  const [homeLocation, setHomeLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [watcher, setWatcher] = useState<Location.LocationSubscription | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [fetchingHome, setFetchingHome] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [fetchingRoute, setFetchingRoute] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  
  // Default home location coordinates
  const DEFAULT_HOME_LOCATION = {
    latitude: 21.2380912,
    longitude: 81.6336993,
  };
  
  const GEOAPIFY_KEY = '1fd754d0edba4df593f2c1d4ac0c6d7e';

  const fetchSavedLocation = useCallback(async () => {
    setFetchingLocation(true);
    try {
      const res = await fetch(`${API_URL}/get-patient-location?patientId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (data.success && data.location?.coordinates) {
        const [longitude, latitude] = data.location.coordinates;
        setSavedLocation({
          latitude,
          longitude,
          updatedAt: data.updatedAt || 'Unknown',
        });
      }
    } catch (e: any) {
      console.error('Failed to fetch location:', e);
    } finally {
      setFetchingLocation(false);
    }
  }, [userId]);

  const fetchHomeLocation = useCallback(async () => {
    setFetchingHome(true);
    try {
      const res = await fetch(`${API_URL}/get-patient-home?patientId=${encodeURIComponent(userId)}`);
      
      // Check if response is OK
      if (!res.ok) {
        // If 404, home location is not set - use default
        if (res.status === 404) {
          console.log('Home location not set, using default');
          setHomeLocation(DEFAULT_HOME_LOCATION);
          setFetchingHome(false);
          return;
        }
        // For other errors, try to parse error message
        const errorText = await res.text();
        let errorMessage = `Server error: ${res.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        console.error('Failed to fetch home location:', errorMessage);
        // Use default on error
        setHomeLocation(DEFAULT_HOME_LOCATION);
        setFetchingHome(false);
        return;
      }

      // Check content type before parsing JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('Expected JSON but got:', contentType, text.slice(0, 200));
        // Use default on error
        setHomeLocation(DEFAULT_HOME_LOCATION);
        setFetchingHome(false);
        return;
      }

      const data = await res.json();
      if (data.success && data.homeLocation?.coordinates && Array.isArray(data.homeLocation.coordinates)) {
        const [longitude, latitude] = data.homeLocation.coordinates;
        // Validate coordinates are valid numbers
        if (typeof latitude === 'number' && typeof longitude === 'number' && 
            latitude !== 0 && longitude !== 0) {
          setHomeLocation({ latitude, longitude });
          console.log('Home location fetched:', { latitude, longitude });
        } else {
          console.log('Home location coordinates are invalid or default (0,0), using default');
          setHomeLocation(DEFAULT_HOME_LOCATION);
        }
      } else {
        // Use default if no valid data
        setHomeLocation(DEFAULT_HOME_LOCATION);
      }
    } catch (e: any) {
      console.error('Failed to fetch home location:', e?.message || e);
      // Use default on error
      setHomeLocation(DEFAULT_HOME_LOCATION);
    } finally {
      setFetchingHome(false);
    }
  }, [userId]);

  const updateMapRegion = useCallback(() => {
    const locations: { latitude: number; longitude: number }[] = [];
    
    if (currentLocation) locations.push(currentLocation);
    if (savedLocation) locations.push(savedLocation);
    if (homeLocation) locations.push(homeLocation);

    if (locations.length === 0) {
      // Default region (can be set to a default location)
      setMapRegion({
        latitude: 28.6139, // Default to a common location (e.g., Delhi)
        longitude: 77.2090,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
      return;
    }

    if (locations.length === 1) {
      setMapRegion({
        latitude: locations[0].latitude,
        longitude: locations[0].longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      return;
    }

    // Calculate bounds for multiple locations
    const lats = locations.map(loc => loc.latitude);
    const lngs = locations.map(loc => loc.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latDelta = (maxLat - minLat) * 1.5 || 0.01;
    const lngDelta = (maxLng - minLng) * 1.5 || 0.01;

    setMapRegion({
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(latDelta, 0.01),
      longitudeDelta: Math.max(lngDelta, 0.01),
    });
  }, [currentLocation, savedLocation, homeLocation]);

  // Fetch saved location and home location from backend
  useEffect(() => {
    fetchSavedLocation();
    fetchHomeLocation();
  }, [fetchSavedLocation, fetchHomeLocation]);

  // Update map region when locations change
  useEffect(() => {
    updateMapRegion();
  }, [updateMapRegion]);

  // Fetch route when both home and current locations are available
  useEffect(() => {
    const locationToUse = currentLocation || savedLocation;
    if (locationToUse && homeLocation) {
      fetchRoute(locationToUse, homeLocation);
    } else {
      setRouteCoordinates([]);
    }
  }, [currentLocation, savedLocation, homeLocation]);

  const getCurrentLocation = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required to use this feature.');
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;
      setCurrentLocation({ latitude, longitude });

      // Update location on server
      try {
        const res = await fetch(`${API_URL}/update-location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, latitude, longitude }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          Alert.alert('Success', 'Location updated successfully!');
          fetchSavedLocation();
        } else {
          Alert.alert('Error', data.error || 'Failed to update location');
        }
      } catch (err: any) {
        Alert.alert('Error', 'Failed to save location to server');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to get current location');
    } finally {
      setLoading(false);
    }
  };

  const startLiveSharing = async () => {
    setLoading(true);

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Location access is required for live sharing.');
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
          setCurrentLocation({ latitude, longitude });

          try {
            const res = await fetch(`${API_URL}/update-location`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, latitude, longitude }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
              fetchSavedLocation();
            }
          } catch (err: any) {
            console.error('Failed to update location:', err);
          }
        }
      );

      setWatcher(subscription);
      setIsSharing(true);
      Alert.alert('Live Sharing ON', 'Your location is being shared. Keep the app open.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to start live sharing');
    } finally {
      setLoading(false);
    }
  };

  const stopLiveSharing = () => {
    watcher?.remove();
    setWatcher(null);
    setIsSharing(false);
    Alert.alert('Live Sharing OFF', 'Location sharing has been stopped.');
  };

  const fetchRoute = async (
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number }
  ) => {
    setFetchingRoute(true);
    try {
      // Geoapify routing API
      const waypoints = `${start.longitude},${start.latitude}|${end.longitude},${end.latitude}`;
      const url = `https://api.geoapify.com/v1/routing?waypoints=${waypoints}&mode=drive&apiKey=${GEOAPIFY_KEY}`;

      const res = await fetch(url);
      
      if (!res.ok) {
        console.error('Failed to fetch route:', res.status);
        setRouteCoordinates([]);
        setRouteInfo(null);
        setFetchingRoute(false);
        return;
      }

      const data = await res.json();
      
      if (data.features && data.features.length > 0) {
        // Extract coordinates from the route geometry
        const route = data.features[0];
        const coordinates = route.geometry?.coordinates || [];
        
        // Convert from [lng, lat] to {latitude, longitude} format
        const routePoints = coordinates.map((coord: [number, number]) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));
        
        setRouteCoordinates(routePoints);
        
        // Extract distance and duration from route properties
        const properties = route.properties || {};
        const distance = properties.distance || 0; // in meters
        const time = properties.time || 0; // in seconds
        
        setRouteInfo({
          distance: distance,
          duration: time,
        });
        
        console.log('Route fetched successfully:', routePoints.length, 'points', distance, 'm', time, 's');
      } else {
        console.log('No route found');
        setRouteCoordinates([]);
        setRouteInfo(null);
      }
    } catch (e: any) {
      console.error('Failed to fetch route:', e?.message || e);
      setRouteCoordinates([]);
      setRouteInfo(null);
    } finally {
      setFetchingRoute(false);
    }
  };

  const formatCoordinates = (lat: number, lng: number) => {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Ionicons name="arrow-back" size={24} color="#6B5E4C" />
        <Text style={styles.backButtonText}>Back to Home</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="location" size={80} color="#6B5E4C" />
          </View>

          <Text style={styles.title}>Geo Location</Text>
          <Text style={styles.subtitle}>
            Manage your location sharing and view your current coordinates.
          </Text>

          {/* Map Card */}
          <View style={styles.mapCard}>
            <View style={styles.mapCardHeader}>
              <View style={styles.cardHeader}>
                <Ionicons name="map-outline" size={24} color="#6B5E4C" />
                <Text style={styles.cardTitle}>Location Map</Text>
              </View>
              {(currentLocation || savedLocation) && homeLocation && (
                <TouchableOpacity
                  style={styles.refreshRouteButton}
                  onPress={() => {
                    const locationToUse = currentLocation || savedLocation;
                    if (locationToUse && homeLocation) {
                      fetchRoute(locationToUse, homeLocation);
                    }
                  }}
                  disabled={fetchingRoute}
                >
                  {fetchingRoute ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={16} color="#FFFFFF" />
                      <Text style={styles.refreshRouteButtonText}>Refresh Route</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            
            {/* Route Info */}
            {routeInfo && (
              <View style={styles.routeInfoContainer}>
                <View style={styles.routeInfoItem}>
                  <Ionicons name="navigate" size={18} color="#6B5E4C" />
                  <Text style={styles.routeInfoText}>
                    Distance: <Text style={styles.routeInfoValue}>{(routeInfo.distance / 1000).toFixed(1)} km</Text>
                  </Text>
                </View>
                <View style={styles.routeInfoItem}>
                  <Ionicons name="time" size={18} color="#6B5E4C" />
                  <Text style={styles.routeInfoText}>
                    ETA: <Text style={styles.routeInfoValue}>{Math.round(routeInfo.duration / 60)} min</Text>
                  </Text>
                </View>
              </View>
            )}
            {mapRegion ? (
              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  region={mapRegion}
                  showsUserLocation={false}
                  showsMyLocationButton={false}
                  showsCompass={false}
                  toolbarEnabled={false}
                >
                  {/* Route polyline */}
                  {routeCoordinates.length > 0 && (
                    <Polyline
                      coordinates={routeCoordinates}
                      strokeColor="#6B5E4C"
                      strokeWidth={4}
                      lineDashPattern={[5, 5]}
                    />
                  )}
                  
                  {(currentLocation || savedLocation) && (
                    <Marker
                      coordinate={{
                        latitude: currentLocation?.latitude || savedLocation!.latitude,
                        longitude: currentLocation?.longitude || savedLocation!.longitude,
                      }}
                      title={currentLocation ? "Current Location" : "Saved Location"}
                      description={currentLocation ? "Your current position" : "Last saved position"}
                    >
                      <View style={styles.currentMarker}>
                        <Ionicons name="location" size={32} color="#6B5E4C" />
                      </View>
                    </Marker>
                  )}
                  {homeLocation && (
                    <Marker
                      coordinate={{
                        latitude: homeLocation.latitude,
                        longitude: homeLocation.longitude,
                      }}
                      title="Home"
                      description="Your home location"
                    >
                      <View style={styles.homeMarker}>
                        <Ionicons name="home" size={32} color="#DC3545" />
                      </View>
                    </Marker>
                  )}
                </MapView>
              </View>
            ) : (
              <View style={styles.mapPlaceholder}>
                <ActivityIndicator size="large" color="#6B5E4C" />
                <Text style={styles.mapPlaceholderText}>Loading map...</Text>
              </View>
            )}
            <View style={styles.mapLegend}>
              {(currentLocation || savedLocation) && (
                <View style={styles.legendItem}>
                  <Ionicons name="location" size={20} color="#6B5E4C" />
                  <Text style={styles.legendText}>
                    {currentLocation ? "Current Location" : "Saved Location"}
                  </Text>
                </View>
              )}
              {homeLocation && (
                <View style={styles.legendItem}>
                  <Ionicons name="home" size={20} color="#DC3545" />
                  <Text style={styles.legendText}>Home</Text>
                </View>
              )}
            </View>
          </View>

          {/* Current Location Card */}
          {currentLocation && (
            <View style={styles.infoCard}>
              <View style={styles.cardHeader}>
                <Ionicons name="navigate" size={24} color="#6B5E4C" />
                <Text style={styles.cardTitle}>Current Location</Text>
              </View>
              <Text style={styles.coordinateText}>
                {formatCoordinates(currentLocation.latitude, currentLocation.longitude)}
              </Text>
              <Text style={styles.coordinateLabel}>
                Lat: {currentLocation.latitude.toFixed(6)}, Lng: {currentLocation.longitude.toFixed(6)}
              </Text>
            </View>
          )}

          {/* Saved Location Card */}
          <View style={styles.infoCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="save-outline" size={24} color="#6B5E4C" />
              <Text style={styles.cardTitle}>Saved Location</Text>
            </View>
            {fetchingLocation ? (
              <ActivityIndicator size="small" color="#6B5E4C" style={{ marginVertical: 10 }} />
            ) : savedLocation ? (
              <>
                <Text style={styles.coordinateText}>
                  {formatCoordinates(savedLocation.latitude, savedLocation.longitude)}
                </Text>
                <Text style={styles.coordinateLabel}>
                  Lat: {savedLocation.latitude.toFixed(6)}, Lng: {savedLocation.longitude.toFixed(6)}
                </Text>
                <Text style={styles.dateText}>
                  Last updated: {formatDate(savedLocation.updatedAt)}
                </Text>
              </>
            ) : (
              <Text style={styles.noDataText}>No location saved yet</Text>
            )}
          </View>

          {/* Home Location Card */}
          <View style={styles.infoCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="home-outline" size={24} color="#DC3545" />
              <Text style={styles.cardTitle}>Home Location</Text>
            </View>
            {fetchingHome ? (
              <ActivityIndicator size="small" color="#6B5E4C" style={{ marginVertical: 10 }} />
            ) : homeLocation ? (
              <>
                <Text style={styles.coordinateText}>
                  {formatCoordinates(homeLocation.latitude, homeLocation.longitude)}
                </Text>
                <Text style={styles.coordinateLabel}>
                  Lat: {homeLocation.latitude.toFixed(6)}, Lng: {homeLocation.longitude.toFixed(6)}
                </Text>
              </>
            ) : (
              <Text style={styles.noDataText}>Loading home location...</Text>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton]}
              onPress={getCurrentLocation}
              disabled={loading || isSharing}
            >
              {loading && !isSharing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="locate" size={24} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Get Current Location</Text>
                </>
              )}
            </TouchableOpacity>

            {!isSharing ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={startLiveSharing}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#6B5E4C" />
                ) : (
                  <>
                    <Ionicons name="radio-button-on" size={24} color="#6B5E4C" />
                    <Text style={[styles.buttonText, styles.secondaryButtonText]}>Start Live Sharing</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionButton, styles.stopButton]}
                onPress={stopLiveSharing}
                disabled={loading}
              >
                <Ionicons name="stop-circle" size={24} color="#FFFFFF" />
                <Text style={styles.buttonText}>Stop Live Sharing</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionButton, styles.refreshButton]}
              onPress={() => {
                fetchSavedLocation();
                fetchHomeLocation();
              }}
              disabled={fetchingLocation || fetchingHome}
            >
              <Ionicons name="refresh" size={24} color="#6B5E4C" />
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>Refresh All</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 20,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2C2416',
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
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2416',
  },
  coordinateText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#6B5E4C',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  coordinateLabel: {
    fontSize: 14,
    color: '#8B7355',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  dateText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  noDataText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginVertical: 10,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
    marginTop: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButton: {
    backgroundColor: '#6B5E4C',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#6B5E4C',
  },
  stopButton: {
    backgroundColor: '#DC3545',
  },
  refreshButton: {
    backgroundColor: '#E8DCC4',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#6B5E4C',
  },
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  mapContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E8DCC4',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: '#F5F1E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E8DCC4',
  },
  mapPlaceholderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B5E4C',
  },
  currentMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8DCC4',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendText: {
    fontSize: 14,
    color: '#6B5E4C',
    fontWeight: '500',
  },
  mapCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  refreshRouteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#6B5E4C',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  refreshRouteButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  routeInfoContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F5F1E8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DCC4',
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeInfoText: {
    fontSize: 13,
    color: '#6B5E4C',
  },
  routeInfoValue: {
    fontWeight: '700',
    color: '#2C2416',
  },
});

