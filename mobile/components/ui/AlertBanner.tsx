import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

interface AlertBannerProps {
  message: string;
  type: 'success' | 'error';
  onDismiss?: () => void;
  autoDismissMs?: number;
}

export default function AlertBanner({ message, type, onDismiss, autoDismissMs }: AlertBannerProps) {
  useEffect(() => {
    if (autoDismissMs && onDismiss && message) {
      const timer = setTimeout(() => {
        onDismiss();
      }, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [message, autoDismissMs, onDismiss]);

  if (!message) return null;

  const isSuccess = type === 'success';
  const bgColor = isSuccess ? '#ecfdf5' : '#fef2f2';
  const borderColor = isSuccess ? '#10b981' : '#ef4444';
  const textColor = isSuccess ? '#065f46' : '#991b1b';
  const icon = isSuccess ? 'check-circle' : 'exclamation-circle';

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor: borderColor }]}>
      <FontAwesome name={icon} size={16} color={borderColor} style={styles.icon} />
      <Text style={[styles.text, { color: textColor }]}>{message}</Text>
      {onDismiss ? (
        <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
          <FontAwesome name="times" size={14} color={textColor} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 8,
  },
  icon: {
    marginRight: 10,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
});
