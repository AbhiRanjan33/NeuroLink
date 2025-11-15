// components/FamilyInfo.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const API_URL = 'http://172.16.197.52:5000';

interface FamilyInfoProps {
  onBack: () => void;
  userId: string;
}

type Remark = {
  text: string;
  fromUserId: string;
  fromName: string;
  fromRelation: string;
  fromImage?: string;
  createdAt: string;
};

export default function FamilyInfo({ onBack, userId }: FamilyInfoProps) {
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRemarks();
  }, [userId]);

  const fetchRemarks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/remarks?userId=${encodeURIComponent(userId)}`, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch remarks: ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Expected JSON but got: ${contentType}`);
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.remarks)) {
        setRemarks(data.remarks);
      } else {
        setRemarks([]);
      }
    } catch (e: any) {
      console.error('Failed to fetch remarks:', e);
      setError(e?.message || 'Failed to load family remarks');
      setRemarks([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#6B5E4C" />
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Info from the Family</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#6B5E4C" />
            <Text style={styles.loadingText}>Loading remarks...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#DC3545" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchRemarks}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : remarks.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="heart-outline" size={48} color="#6B5E4C" />
            <Text style={styles.emptyText}>No remarks from family yet.</Text>
            <Text style={styles.emptySubtext}>Your family members can leave messages for you here.</Text>
          </View>
        ) : (
          <View style={styles.remarksContainer}>
            {remarks.map((remark, index) => (
              <View key={index} style={styles.remarkCard}>
                {/* Header with sender info */}
                <View style={styles.cardHeader}>
                  <View style={styles.senderInfo}>
                    {remark.fromImage ? (
                      <Image
                        source={{ uri: remark.fromImage }}
                        style={styles.senderImage}
                      />
                    ) : (
                      <View style={styles.senderImagePlaceholder}>
                        <Ionicons name="person" size={24} color="#6B5E4C" />
                      </View>
                    )}
                    <View style={styles.senderDetails}>
                      <Text style={styles.senderName}>{remark.fromName || 'Family Member'}</Text>
                      <Text style={styles.senderRelation}>{remark.fromRelation || 'Family'}</Text>
                    </View>
                  </View>
                  <View style={styles.dateContainer}>
                    <Ionicons name="time-outline" size={14} color="#6B5E4C" />
                    <Text style={styles.dateText}>{formatDate(remark.createdAt)}</Text>
                  </View>
                </View>

                {/* Remark text */}
                <View style={styles.remarkContent}>
                  <Text style={styles.remarkText}>{remark.text}</Text>
                </View>

                {/* Footer with metadata */}
                <View style={styles.cardFooter}>
                  <View style={styles.metadataItem}>
                    <Ionicons name="person-outline" size={14} color="#6B5E4C" />
                    <Text style={styles.metadataText}>From: {remark.fromUserId}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F1E8',
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#F5F1E8',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#6B5E4C',
    fontWeight: '500',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#2C2416',
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B5E4C',
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#DC3545',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#6B5E4C',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2416',
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B5E4C',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  remarksContainer: {
    gap: 16,
  },
  remarkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  senderImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  senderImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8DCC4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  senderDetails: {
    flex: 1,
  },
  senderName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2416',
    marginBottom: 4,
  },
  senderRelation: {
    fontSize: 14,
    color: '#6B5E4C',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#6B5E4C',
  },
  remarkContent: {
    marginBottom: 16,
  },
  remarkText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#2C2416',
  },
  cardFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8DCC4',
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metadataText: {
    fontSize: 12,
    color: '#6B5E4C',
  },
});

