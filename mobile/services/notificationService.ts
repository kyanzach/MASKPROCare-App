import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import client from '@/api/client';

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Configure foreground presentation behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

const LAST_SEEN_KEY = 'care_last_alerted_notif_id';

/**
 * Register Android notification channels and request OS-level permissions
 */
export async function registerForPushNotificationsAsync(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('care-alerts', {
          name: 'MASKPRO Care Notifications',
          description: 'Booking confirmations, schedule offers, and service reminders',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#3b82f6',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: false,
          sound: 'default',
          enableVibrate: true,
        });
      } catch {
        // Safe channel fallback
      }
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (err) {
    // Suppress push permission noise in development / Expo Go
    return false;
  }
}

/**
 * Trigger an instant native OS notification (displays in lock screen & top heads-up banner)
 */
export async function triggerLocalNotification(
  title: string,
  body: string,
  data: Record<string, any> = {}
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        badge: 1,
        ...(Platform.OS === 'android' ? { channelId: 'care-alerts' } : {}),
      },
      trigger: null, // null trigger schedules immediately
    });
  } catch (err) {
    console.warn('Failed to schedule local notification:', err);
  }
}

/**
 * Sync with server /api/notifications/list and fire push banners for new unread notifications
 */
export async function syncAndAlertNewNotifications(): Promise<number> {
  try {
    const res = await client.get('/notifications/list?limit=10');
    if (!res.data?.success) return 0;

    const notifs = res.data.data?.notifications || [];
    const unreadCount = res.data.data?.unread_count || 0;
    if (notifs.length === 0) return 0;

    let lastSeenStr = null;
    try {
      lastSeenStr = await SecureStore.getItemAsync(LAST_SEEN_KEY);
    } catch {
      // SecureStore fallback
    }

    const lastSeenId = lastSeenStr ? parseInt(lastSeenStr, 10) : 0;
    const maxOverallId = Math.max(...notifs.map((n: any) => Number(n.id) || 0));

    // If this is the very first sync on this device (lastSeenId === 0),
    // calibrate lastSeenId to current max so historical notifications don't pop up as push banners
    if (lastSeenId === 0) {
      if (maxOverallId > 0) {
        try {
          await SecureStore.setItemAsync(LAST_SEEN_KEY, String(maxOverallId));
        } catch {
          // ignore
        }
      }
      return unreadCount;
    }

    // Only trigger OS push banners for fresh unread notifications (created within the last 30 minutes)
    // Older items remain visible inside the Notification Bell list without spamming lock-screen banners
    const nowMs = Date.now();
    const MAX_PUSH_AGE_MS = 30 * 60 * 1000; // 30 minutes

    const newUnread = notifs.filter((n: any) => {
      if (n.is_read || Number(n.id) <= lastSeenId) return false;
      const createdMs = n.created_at ? new Date(n.created_at).getTime() : nowMs;
      const ageMs = nowMs - createdMs;
      return ageMs <= MAX_PUSH_AGE_MS;
    });

    if (newUnread.length > 0) {
      for (const n of newUnread) {
        await triggerLocalNotification(n.title, n.message || '', {
          link: n.link || '/(tabs)/bookings',
          id: n.id,
        });
      }
    }

    // Always advance lastSeenId to the highest fetched notification ID so we never re-alert
    if (maxOverallId > lastSeenId) {
      try {
        await SecureStore.setItemAsync(LAST_SEEN_KEY, String(maxOverallId));
      } catch {
        // ignore
      }
    }

    return unreadCount;
  } catch (err) {
    // silent failure during offline or network lag
    return 0;
  }
}
