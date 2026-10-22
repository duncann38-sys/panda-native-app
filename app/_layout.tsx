import React, { useEffect } from 'react';
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
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { LiveVenuesProvider } from '@/context/live-venues';
import { SavedVenuesProvider } from '@/context/saved-venues';
import { AuthProvider, useAuth } from '@/context/auth';
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
                <AuthenticatedVenueProviders>
                    <StatusBar style="light" backgroundColor={colors.green800} />
                    <RootLayoutNav />
                </AuthenticatedVenueProviders>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
