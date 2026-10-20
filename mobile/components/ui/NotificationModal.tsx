import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message?: string;
  is_read: boolean;
  link?: string;
  created_at: string;
}

interface NotificationModalProps {
  visible: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  loading: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onNotificationClick: (notif: NotificationItem) => void;
}

const NOTIF_ICONS: Record<string, { icon: React.ComponentProps<typeof FontAwesome>['name']; color: string; bg: string }> = {
  registration_renewal: { icon: 'car', color: '#f59e0b', bg: '#fef3c7' },
  booking_confirmed: { icon: 'calendar-check-o', color: '#10b981', bg: '#d1fae5' },
  booking_reminder: { icon: 'clock-o', color: '#3b82f6', bg: '#dbeafe' },
  system: { icon: 'info-circle', color: '#6366f1', bg: '#e0e7ff' },
};

export default function NotificationModal({
  visible,
  onClose,
  notifications,
  loading,
  unreadCount,
  onMarkAllRead,
  onNotificationClick,
}: NotificationModalProps) {
  const timeAgo = (dateStr: string) => {
    try {
      const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Modal Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.headerRight}>
            {unreadCount > 0 ? (
              <TouchableOpacity onPress={onMarkAllRead} style={styles.markAllButton}>
                <Text style={styles.markAllText}>Mark all read</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <FontAwesome name="times" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#4f46e5" />
            <Text style={styles.loadingText}>Loading notifications...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.centered}>
            <View style={styles.emptyIconBg}>
              <FontAwesome name="bell-o" size={32} color="#94a3b8" />
            </View>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySubtitle}>
              You'll be notified here about service reminders, booking confirmations, and updates.
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const iconCfg = NOTIF_ICONS[item.type] || NOTIF_ICONS.system;

              return (
                <TouchableOpacity
                  style={[
                    styles.notifItem,
                    !item.is_read && styles.notifItemUnread,
                  ]}
                  onPress={() => onNotificationClick(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: iconCfg.bg }]}>
                    <FontAwesome name={iconCfg.icon} size={15} color={iconCfg.color} />
                  </View>

                  <View style={styles.notifContent}>
                    <View style={styles.notifHeaderRow}>
                      <Text
                        style={[
                          styles.notifTitle,
                          !item.is_read && styles.notifTitleUnread,
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text style={styles.notifTime}>{timeAgo(item.created_at)}</Text>
                    </View>

                    {item.message ? (
                      <Text style={styles.notifMessage} numberOfLines={2}>
                        {item.message}
                      </Text>
                    ) : null}
                  </View>

                  {!item.is_read ? <View style={styles.unreadDot} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0f172a',
  },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },
  closeButton: {
    padding: 6,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
  emptyIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  listContent: {
    paddingVertical: 8,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  notifItemUnread: {
    backgroundColor: 'rgba(59, 130, 246, 0.04)',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notifContent: {
    flex: 1,
  },
  notifHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    flex: 1,
    marginRight: 8,
  },
  notifTitleUnread: {
    fontWeight: '700',
    color: '#0f172a',
  },
  notifTime: {
    fontSize: 11,
    color: '#94a3b8',
  },
  notifMessage: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#3b82f6',
    marginLeft: 8,
    marginTop: 6,
  },
});
