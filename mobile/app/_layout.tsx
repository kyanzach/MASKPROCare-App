import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { LogBox } from 'react-native';

// Suppress known Expo Go SDK 53 remote push notification deprecation notice
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go',
]);

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { registerForPushNotificationsAsync, getNotificationsModule } from '@/services/notificationService';
import { useRouter, usePathname } from 'expo-router';
import client from '@/api/client';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !pathname || pathname.startsWith('/admin') || pathname.startsWith('/login')) return;
    let label = 'Dashboard';
    let detail = 'Viewed Dashboard on mobile app';
    if (pathname.includes('bookings')) {
      label = 'My Bookings';
      detail = 'Explored My Bookings on mobile app';
    } else if (pathname.includes('vehicles')) {
      label = 'My Vehicles';
      detail = 'Explored My Vehicles on mobile app';
    } else if (pathname.includes('loyalty') || pathname.includes('cards')) {
      label = 'My MASKPROCare Cards';
      detail = 'Explored MASKPROCare loyalty cards on mobile app';
    } else if (pathname.includes('community')) {
      label = 'Community Care';
      detail = 'Explored Community Care on mobile app';
    } else if (pathname.includes('shop')) {
      label = 'Shop';
      detail = 'Browsed Shop on mobile app';
    } else if (pathname.includes('profile')) {
      label = 'Account Settings';
      detail = 'Viewed Profile & settings on mobile app';
    } else if (pathname.includes('aftercare')) {
      label = 'Aftercare Guide';
      detail = 'Read Aftercare guide on mobile app';
    }
    client.post('/dashboard/activity', {
      event_type: 'page_view',
      page_path: pathname,
      page_label: label,
      action_detail: detail,
    }).catch(() => {});
  }, [pathname, user]);

  useEffect(() => {
    registerForPushNotificationsAsync();

    const Notifications = getNotificationsModule();
    if (!Notifications) return;

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const link = response.notification.request.content.data?.link;
      if (link && typeof link === 'string') {
        if (link.includes('booking')) {
          router.push('/(tabs)/bookings');
        } else if (link.includes('vehicle')) {
          router.push('/(tabs)/vehicles');
        }
      }
    });

    return () => {
      responseSubscription.remove();
    };
  }, [router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="admin-login" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
