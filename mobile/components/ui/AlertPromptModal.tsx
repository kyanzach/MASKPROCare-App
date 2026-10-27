import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export type AlertType = 'error' | 'success' | 'warning' | 'info';

export interface AlertPromptModalProps {
  visible: boolean;
  type?: AlertType;
  title: string;
  message: string;
  buttonText?: string;
  secondaryButtonText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  asOverlay?: boolean;
}

export default function AlertPromptModal({
  visible,
  type = 'error',
  title,
  message,
  buttonText = 'Got It',
  secondaryButtonText,
  onConfirm,
  onCancel,
  asOverlay = false,
}: AlertPromptModalProps) {
  const getIconConfig = () => {
    switch (type) {
      case 'error':
        return { name: 'exclamation-circle' as const, color: '#dc2626', bg: '#fee2e2', btnBg: '#dc2626' };
      case 'success':
        return { name: 'check-circle' as const, color: '#16a34a', bg: '#dcfce7', btnBg: '#16a34a' };
      case 'warning':
        return { name: 'exclamation-triangle' as const, color: '#d97706', bg: '#fef3c7', btnBg: '#d97706' };
      case 'info':
      default:
        return { name: 'info-circle' as const, color: '#4f46e5', bg: '#e0e7ff', btnBg: '#4f46e5' };
    }
  };

  const config = getIconConfig();

  const dialogContent = (
    <View style={styles.dialogCard}>
      {/* Status Icon Badge */}
      <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
        <FontAwesome name={config.name} size={32} color={config.color} />
      </View>

      {/* Title & Body */}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {secondaryButtonText && onCancel ? (
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.secondaryButton}
            onPress={onCancel}
          >
            <Text style={styles.secondaryButtonText}>{secondaryButtonText}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.primaryButton,
            { backgroundColor: config.btnBg },
            secondaryButtonText ? { flex: 1 } : { width: '100%' },
          ]}
          onPress={onConfirm}
        >
          <Text style={styles.primaryButtonText}>{buttonText}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (asOverlay) {
    if (!visible) return null;
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.overlay, { zIndex: 999999 }]}>
        {dialogContent}
      </View>
    );
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={onCancel || onConfirm}
    >
      <View style={styles.overlay}>
        {dialogContent}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#4b5563',
    fontSize: 15,
    fontWeight: '600',
  },
});
