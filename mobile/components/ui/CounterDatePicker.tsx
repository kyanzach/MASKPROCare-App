import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

/**
 * CounterDatePicker — lets a client pick a preferred date + time slot when
 * negotiating a booking schedule. Value format: 'YYYY-MM-DD HH:MM' (Manila local).
 * Sundays are skipped (branches closed). Time slots mirror Unify's agreed-date modal.
 */

export const TIME_SLOTS = [
  { value: '08:00', label: '8:00 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '13:00', label: '1:00 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '15:00', label: '3:00 PM' },
  { value: '16:00', label: '4:00 PM' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface Props {
  value: string; // 'YYYY-MM-DD HH:MM' or ''
  onChange: (value: string) => void;
  days?: number;
}

export default function CounterDatePicker({ value, onChange, days = 30 }: Props) {
  const [selDate, selTime] = value ? value.split(' ') : ['', ''];

  const dates = useMemo(() => {
    const list: Date[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1); // start tomorrow
    while (list.length < days) {
      if (d.getDay() !== 0) list.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return list;
  }, [days]);

  const pickDate = (ymd: string) => onChange(`${ymd} ${selTime || '08:00'}`);
  const pickTime = (t: string) => {
    if (!selDate) return;
    onChange(`${selDate} ${t}`);
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
        {dates.map((d) => {
          const ymd = toYmd(d);
          const active = ymd === selDate;
          return (
            <TouchableOpacity
              key={ymd}
              style={[styles.dateChip, active && styles.dateChipActive]}
              onPress={() => pickDate(ymd)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={d.toDateString()}
            >
              <Text style={[styles.dateDow, active && styles.textActive]}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </Text>
              <Text style={[styles.dateDay, active && styles.textActive]}>{d.getDate()}</Text>
              <Text style={[styles.dateMonth, active && styles.textActive]}>
                {d.toLocaleDateString('en-US', { month: 'short' })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.timeGrid}>
        {TIME_SLOTS.map((t) => {
          const active = t.value === selTime && !!selDate;
          return (
            <TouchableOpacity
              key={t.value}
              style={[styles.timeChip, active && styles.timeChipActive, !selDate && styles.timeChipDisabled]}
              onPress={() => pickTime(t.value)}
              disabled={!selDate}
              activeOpacity={0.8}
            >
              <Text style={[styles.timeText, active && styles.textActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!selDate ? <Text style={styles.hint}>Pick a date first, then a time.</Text> : null}
    </View>
  );
}

export const formatCounterDate = (raw?: string | null) => {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
};

const styles = StyleSheet.create({
  dateRow: { gap: 8, paddingVertical: 4 },
  dateChip: {
    width: 56,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  dateChipActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  dateDow: { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  dateDay: { fontSize: 18, fontWeight: '800', color: '#111827', marginVertical: 1 },
  dateMonth: { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  textActive: { color: '#ffffff' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  timeChip: {
    width: '23%',
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChipActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  timeChipDisabled: { opacity: 0.45 },
  timeText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
});
