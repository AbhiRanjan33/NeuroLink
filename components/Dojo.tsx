// components/Dojo.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DojoProps {
  onBack: () => void;
  onOpenQuiz: () => void;
  onOpenMeditation: () => void;
  onOpenMemoryGame: () => void;
}

export default function Dojo({
  onBack,
  onOpenQuiz,
  onOpenMeditation,
  onOpenMemoryGame,
}: DojoProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#6B5E4C" />
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Dojo</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Choose a Practice</Text>

        <View style={styles.grid}>
          <TouchableOpacity style={styles.card} onPress={onOpenMemoryGame} activeOpacity={0.8}>
            <Ionicons name="apps-outline" size={44} color="#6B5E4C" />
            <Text style={styles.cardTitle}>Memory Game</Text>
            <Text style={styles.cardSubtitle}>A calm place to practice</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={onOpenQuiz} activeOpacity={0.8}>
            <Ionicons name="help-circle-outline" size={44} color="#6B5E4C" />
            <Text style={styles.cardTitle}>Quiz</Text>
            <Text style={styles.cardSubtitle}>Quick knowledge check</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={onOpenMeditation} activeOpacity={0.8}>
            <Ionicons name="leaf-outline" size={44} color="#6B5E4C" />
            <Text style={styles.cardTitle}>Meditation Room</Text>
            <Text style={styles.cardSubtitle}>Calm and focus practice</Text>
          </TouchableOpacity>
        </View>
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
    paddingBottom: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
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
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2416',
    marginBottom: 16,
    marginTop: 6,
  },
  grid: {
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2416',
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B5E4C',
    textAlign: 'center',
  },
});


