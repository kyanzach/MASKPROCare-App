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
  const { user, impersonation, exitImpersonation } = useAuth();

  const [notifCount, setNotifCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin status
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await client.get('/admin/check');
        if (isMounted && res.data?.data?.isAdmin) {
          setIsAdmin(true);
        }
      } catch {
        // silent
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [user]);

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

          {/* Right: Admin Button, Notification Bell & Profile Avatar */}
          <View style={styles.actionsContainer}>
            {isAdmin && !impersonation && (
              <TouchableOpacity
                style={styles.adminHeaderBtn}
                onPress={() => router.push('/admin' as any)}
                activeOpacity={0.75}
              >
                <FontAwesome name="shield" size={13} color="#b45309" style={{ marginRight: 4 }} />
                <Text style={styles.adminHeaderBtnText}>Admin</Text>
              </TouchableOpacity>
            )}

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

      {/* Impersonation Banner */}
      {impersonation && (
        <View style={styles.impersonationBanner}>
          <View style={styles.impersonationLeft}>
            <FontAwesome name="eye" size={13} color="#78350f" style={{ marginRight: 6 }} />
            <Text style={styles.impersonationText} numberOfLines={1}>
              Viewing as <Text style={styles.impersonationName}>{impersonation.customerName}</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.exitImpButton}
            onPress={exitImpersonation}
            activeOpacity={0.8}
          >
            <FontAwesome name="sign-out" size={11} color="#ffffff" style={{ marginRight: 4 }} />
            <Text style={styles.exitImpText}>Exit</Text>
          </TouchableOpacity>
        </View>
      )}

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
    gap: 10,
  },
  adminHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  adminHeaderBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400e',
    letterSpacing: 0.3,
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
  impersonationBanner: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f59e0b',
  },
  impersonationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  impersonationText: {
    color: '#78350f',
    fontSize: 12,
    fontWeight: '600',
  },
  impersonationName: {
    fontWeight: '800',
    color: '#78350f',
  },
  exitImpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#78350f',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  exitImpText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
