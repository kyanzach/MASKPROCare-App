import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import client from '@/api/client';
import NotificationModal, { NotificationItem } from './NotificationModal';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://care.maskpro.ph/api';

export default function TopHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [notifCount, setNotifCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  // Poll notification count every 60 seconds
  const fetchNotifCount = useCallback(async () => {
    try {
      const res = await client.get('/notifications/count');
      if (res.data?.success) {
        setNotifCount(res.data.data?.unread_count || 0);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchNotifCount();
    const interval = setInterval(fetchNotifCount, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifCount]);

  const openNotifications = async () => {
    setNotifOpen(true);
    setNotifLoading(true);
    try {
      const res = await client.get('/notifications/list?limit=20');
      if (res.data?.success) {
        setNotifications(res.data.data?.notifications || []);
        setNotifCount(res.data.data?.unread_count || 0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setNotifLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await client.post('/notifications/mark_read', { all: true });
      setNotifCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      try {
        await client.post('/notifications/mark_read', { id: notif.id });
        setNotifCount((prev) => Math.max(0, prev - 1));
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
      } catch {
        // silent
      }
    }
    setNotifOpen(false);

    // Route based on link or type
    if (notif.link) {
      if (notif.link.includes('booking')) {
        router.push('/(tabs)/bookings');
      } else if (notif.link.includes('vehicle')) {
        router.push('/(tabs)/vehicles');
      } else if (notif.link.includes('profile')) {
        router.push('/(tabs)/profile');
      } else if (notif.link.includes('community')) {
        router.push('/(tabs)/community');
      }
    }
  };

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const getProfilePhotoUrl = (photoPath?: string | null) => {
    if (!photoPath) return null;
    if (photoPath.startsWith('http')) return photoPath;
    const rootBase = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;
    return `${rootBase}/api/uploads/photos/${photoPath}`;
  };

  const profilePhoto = getProfilePhotoUrl(user?.profile_photo);

  return (
    <>
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.headerContent}>
          {/* Left: MaskPro Care Logo & Brand Name */}
          <TouchableOpacity
            style={styles.brandContainer}
            onPress={() => router.push('/(tabs)')}
            activeOpacity={0.8}
          >
            <Image
              source={require('@/assets/images/maskpro_logo.png')}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <Text style={styles.brandTitle}>
              MASKPRO<Text style={styles.brandTitleCyan}>Care</Text>
            </Text>
          </TouchableOpacity>

          {/* Right: Notification Bell & Profile Avatar */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.bellButton}
              onPress={openNotifications}
              activeOpacity={0.7}
            >
              <FontAwesome name="bell-o" size={20} color="#475569" />
              {notifCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {notifCount > 99 ? '99+' : notifCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.avatarButton}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.8}
            >
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Notifications Modal Sheet */}
      <NotificationModal
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        loading={notifLoading}
        unreadCount={notifCount}
        onMarkAllRead={handleMarkAllRead}
        onNotificationClick={handleNotificationClick}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    zIndex: 100,
  },
  headerContent: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  brandTitleCyan: {
    color: '#06b6d4',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bellButton: {
    position: 'relative',
    padding: 6,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#ef4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
  avatarButton: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4338ca',
  },
});
