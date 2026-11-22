import React, { useEffect, useRef } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { LiveVenuesProvider } from '@/context/live-venues';
import { SavedVenuesProvider } from '@/context/saved-venues';
import { AuthProvider, useAuth } from '@/context/auth';
import { BookingRemindersProvider } from '@/context/booking-reminders';
import { canEnterPanda } from '@/utils/auth-access';
import { useColors } from '@/hooks/useColors';
import { startVenueActivityDelivery } from '@/utils/record-venue-activity';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { ready, account } = useAuth();
  const allowed = canEnterPanda(ready, account);
  const colors = useColors();
  const router = useRouter();
  const handledOpeningNotification = useRef('');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void Notifications.setNotificationChannelAsync('default', {
      name: 'Panda', importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250], lightColor: '#C8A13A',
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response || !allowed) return;
      const content = response.notification.request.content;
      const data = content.data as Record<string, unknown> | undefined;
      const notificationType = data?.type;
      if (notificationType !== 'NEW_OPENINGS_WEEKLY' && notificationType !== 'NEW_OPENINGS_WEEKLY_TEST') return;
      const id = response.notification.request.identifier;
      if (handledOpeningNotification.current === id) return;
      handledOpeningNotification.current = id;
      if (notificationType === 'NEW_OPENINGS_WEEKLY_TEST') {
        router.push('/new-restaurants');
        return;
      }
      router.push({ pathname: '/ai', params: { weeklyOpenings: String(Date.now()) } });
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then(handleResponse).catch(() => {});
    return () => subscription.remove();
  }, [allowed, router]);
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Protected guard={!allowed}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={allowed}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="venue/[id]"
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: colors.ivory },
        }}
      />
      <Stack.Screen name="venue/[id]/directions" options={{ headerShown: false }} />
      <Stack.Screen name="venue/[id]/menu" options={{ headerShown: false }} />
      <Stack.Screen name="venue/[id]/reservation" options={{ headerShown: false }} />
      <Stack.Screen name="ai" options={{ headerShown: false }} />
      <Stack.Screen name="opentable-test" options={{ headerShown: false }} />
      <Stack.Screen name="bookings" options={{ headerShown: false }} />
      <Stack.Screen name="new-restaurants" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="auth" options={{ headerShown: false }} />
    </Stack>
  );
}

function AuthenticatedVenueProviders({ children }: { children: React.ReactNode }) {
  const { ready, account } = useAuth();
  if (!canEnterPanda(ready, account)) return <>{children}</>;
  return <LiveVenuesProvider><SavedVenuesProvider>{children}</SavedVenuesProvider></LiveVenuesProvider>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  useEffect(startVenueActivityDelivery, []);
  const colors = useColors();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <BookingRemindersProvider>
                <AuthenticatedVenueProviders>
                    <StatusBar style={pathname === '/' || colorScheme !== 'dark' ? 'dark' : 'light'} backgroundColor={colors.background} />
                    <RootLayoutNav />
                </AuthenticatedVenueProviders>
                </BookingRemindersProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
