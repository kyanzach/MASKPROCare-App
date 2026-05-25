import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

interface StatusConfig {
  label: string;
  bg: string;
  color: string;
  border: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  pending: {
    label: 'Pending',
    bg: '#fef3c7',
    color: '#92400e',
    border: '#fbbf24',
    icon: 'hourglass-2',
  },
  scheduled: {
    label: 'Scheduled',
    bg: '#dbeafe',
    color: '#1e40af',
    border: '#3b82f6',
    icon: 'calendar-check-o',
  },
  done: {
    label: 'Done',
    bg: '#d1fae5',
    color: '#065f46',
    border: '#10b981',
    icon: 'check-circle',
  },
  cancelled: {
    label: 'Cancelled',
    bg: '#fee2e2',
    color: '#991b1b',
    border: '#ef4444',
    icon: 'times-circle',
  },
  rejected: {
    label: 'Rejected',
    bg: '#fee2e2',
    color: '#991b1b',
    border: '#ef4444',
    icon: 'ban',
  },
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const normStatus = (status || '').toLowerCase();
  const config = STATUS_CONFIG[normStatus] || STATUS_CONFIG.scheduled;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.border }]}>
      <FontAwesome name={config.icon} size={10} color={config.color} style={styles.icon} />
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
