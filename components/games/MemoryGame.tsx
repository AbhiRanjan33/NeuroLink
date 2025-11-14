import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
interface MemoryBlocksProps {
onBack: () => void;
}
type Cell = { id: number; shown: boolean; matched: boolean; symbol: string };
export default function MemoryBlocks({ onBack }: MemoryBlocksProps) {
const [cells, setCells] = useState<Cell[]>([]);
const [selection, setSelection] = useState<number[]>([]);
const [locked, setLocked] = useState(false);
const size = 12;
const symbols = useMemo(() => ['🍀','🌿','🍂','🌸','🌻','🌙'], []);
useEffect(() => {
const pool = [...symbols, ...symbols];
const shuffled = pool
.sort(() => Math.random() - 0.5)
.map((symbol, i) => ({ id: i, shown: false, matched: false, symbol }));
setCells(shuffled);
setSelection([]);
setLocked(false);
}, [symbols]);
function onPressCell(index: number) {
if (locked) return;
const cell = cells[index];
if (cell.matched || cell.shown) return;

const next = cells.slice();
next[index] = { ...cell, shown: true };
setCells(next);

const nextSel = [...selection, index];
setSelection(nextSel);

if (nextSel.length === 2) {
  setLocked(true);
  const [a, b] = nextSel;
  setTimeout(() => {
    const first = next[a];
    const second = next[b];
    if (first.symbol === second.symbol) {
      next[a] = { ...first, matched: true };
      next[b] = { ...second, matched: true };
    } else {
      next[a] = { ...first, shown: false };
      next[b] = { ...second, shown: false };
    }
    setCells(next);
    setSelection([]);
    setLocked(false);
  }, 700);
}
}
const done = cells.length > 0 && cells.every(c => c.matched);
return (
<View style={styles.container}>
<View style={styles.header}>
<TouchableOpacity style={styles.backButton} onPress={onBack}>
<Ionicons name="arrow-back" size={24} color="#6B5E4C" />
<Text style={styles.backButtonText}>Back to Dojo</Text>
</TouchableOpacity>
<Text style={styles.title}>Memory Blocks</Text>
</View>
<View style={styles.grid}>
    {cells.map((c, idx) => (
      <TouchableOpacity
        key={c.id}
        style={[styles.cell, c.matched && styles.cellMatched]}
        onPress={() => onPressCell(idx)}
        activeOpacity={0.8}
      >
        <Text style={styles.cellText}>{c.shown || c.matched ? c.symbol : '•'}</Text>
      </TouchableOpacity>
    ))}
  </View>

  {done && (
    <View style={styles.footer}>
      <Ionicons name="checkmark-circle" size={22} color="#4A5D3F" />
      <Text style={styles.footerText}>Great job! All pairs matched.</Text>
    </View>
  )}
</View>
);
}
const styles = StyleSheet.create({
container: { flex: 1, backgroundColor: '#F5F1E8' },
header: { paddingTop: 50, paddingHorizontal: 20, paddingBottom: 10 },
backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
backButtonText: { marginLeft: 8, fontSize: 16, color: '#6B5E4C', fontWeight: '500' },
title: { fontSize: 24, fontWeight: '600', color: '#2C2416' },
grid: {
paddingHorizontal: 20,
paddingTop: 10,
flexDirection: 'row',
flexWrap: 'wrap',
justifyContent: 'space-between',
gap: 10,
},
cell: {
width: '23%',
aspectRatio: 1,
backgroundColor: '#FFFFFF',
borderRadius: 12,
alignItems: 'center',
justifyContent: 'center',
borderWidth: 1,
borderColor: '#E8DCC4',
},
cellMatched: {
backgroundColor: '#E8F0E5',
},
cellText: { fontSize: 18, color: '#2C2416' },
footer: {
marginTop: 16,
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'center',
gap: 8,
},
footerText: { marginLeft: 8, fontSize: 14, color: '#4A5D3F', fontWeight: '600' },
});