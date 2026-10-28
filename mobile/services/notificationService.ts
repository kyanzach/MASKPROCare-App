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

    // Filter unread notifications that have not been popped up yet
    const newUnread = notifs.filter(
      (n: any) => !n.is_read && n.id > lastSeenId
    );

    if (newUnread.length > 0) {
      // Alert the newest notification
      for (const n of newUnread) {
        await triggerLocalNotification(n.title, n.message || '', {
          link: n.link || '/(tabs)/bookings',
          id: n.id,
        });
      }

      // Update the highest seen ID so we don't alert again
      const maxId = Math.max(...newUnread.map((n: any) => n.id));
      try {
        await SecureStore.setItemAsync(LAST_SEEN_KEY, String(maxId));
      } catch {
        // ignore
      }
    } else if (lastSeenId === 0 && notifs.length > 0) {
      // First run calibration: save highest existing ID
      const maxId = Math.max(...notifs.map((n: any) => n.id));
      try {
        await SecureStore.setItemAsync(LAST_SEEN_KEY, String(maxId));
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
