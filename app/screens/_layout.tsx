import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
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
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { setBaseUrl, setOnUnauthorized, setRefreshTokenGetter, setSetTokens } from '../api-client/src/index';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform, View, Text, StyleSheet } from 'react-native';
import { NetworkGate } from '@/components/NetworkGate';
import { API_BASE_URL, IS_TEST_BUILD } from '@/config';
import { setAuthState, hasActiveUser } from '@/lib/authState';

SplashScreen.preventAutoHideAsync();

setBaseUrl(API_BASE_URL);

setRefreshTokenGetter(async () => {
  try {
    const isWeb = Platform.OS === 'web';
    if (isWeb) return localStorage.getItem('vaultiline_refresh_token');
    const token = await SecureStore.getItemAsync('vaultiline_refresh_token');
    return token;
  } catch {
    return null;
  }
});

setSetTokens(async (access: string, refresh?: string) => {
  try {
    const isWeb = Platform.OS === 'web';
    if (isWeb) {
      localStorage.setItem('vaultiline_token', access);
      if (refresh) localStorage.setItem('vaultiline_refresh_token', refresh);
    } else {
      await SecureStore.setItemAsync('vaultiline_token', access);
      if (refresh) await SecureStore.setItemAsync('vaultiline_refresh_token', refresh);
    }
  } catch {
    // best-effort
  }
});

let _lastUnauthorizedTime = 0;
const UNAUTHORIZED_COOLDOWN = 3000;

setOnUnauthorized(({ hasToken, errorData }) => {
  try {
    // Don't react to 401s until the app's auth state has finished hydrating
    const { isAuthReady } = require('@/lib/authState');
    if (!isAuthReady || typeof isAuthReady !== 'function') return;
    if (!isAuthReady()) return;
  } catch {
    // if authState isn't available for some reason, be conservative and return
    return;
  }

  if (!hasToken) return;

  const message = typeof errorData === 'object' && errorData !== null
    ? (errorData as any).message || (errorData as any).error || ''
    : '';
  const msg = String(message).toLowerCase();

  const isExpired = msg.includes('token expired') || msg.includes('jwt expired') || msg.includes('session expired');
  if (!isExpired) {
    console.log('401 but NOT expired:', msg);
    return;
  }

  const now = Date.now();
  if (now - _lastUnauthorizedTime < UNAUTHORIZED_COOLDOWN) return;
  _lastUnauthorizedTime = now;

  if (!hasActiveUser()) {
    return;
  }

  Alert.alert(
    'Session Expired',
    'Your session has expired. Please log in again.',
    [
      {
        text: 'OK',
        onPress: async () => {
          try {
            const isWeb = Platform.OS === 'web';
            if (isWeb) {
              localStorage.removeItem('vaultiline_token');
              localStorage.removeItem('vaultiline_refresh_token');
            } else {
              await SecureStore.deleteItemAsync('vaultiline_token');
              await SecureStore.deleteItemAsync('vaultiline_refresh_token');
            }
          } catch {}
          try {
            const { setAuthState } = require('@/lib/authState');
            setAuthState(null, true);
          } catch {}
        },
      },
    ],
  );
});



const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      enabled: false,
      staleTime: 60000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      retryDelay: 1000,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 1,
      retryDelay: 800,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
});

function RootLayoutNav() {
  const { isLoading, currentUser } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    setAuthState(currentUser, !isLoading);
  }, [currentUser, isLoading]);

  useEffect(() => {
    // When auth finishes hydrating, resume paused queries and trigger a refetch
    if (isLoading) return;
    try {
      queryClient.resumePausedMutations();
      // resume queries if paused and then invalidate to trigger fresh fetches
      // @ts-ignore resumePausedQueries may not exist on older versions
      if (typeof (queryClient as any).resumePausedQueries === 'function') {
        (queryClient as any).resumePausedQueries();
      }
      queryClient.invalidateQueries();
    } catch (e) {
      // best-effort
      console.warn('Failed to resume queries', e);
    }
  }, [isLoading]);

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === 'login' || segments[0] === 'signup';
    if (!currentUser && !inAuthGroup) {
      router.replace('/login');
    } else if (currentUser && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isLoading, currentUser, segments, router]);

  return (
    <>
      {IS_TEST_BUILD && (
        <View style={styles.testBanner}>
          <Text style={styles.testBannerText}>TEST BUILD — NOT FOR PRODUCTION</Text>
        </View>
      )}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="loan-terms" />
        <Stack.Screen name="audit" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
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
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: asyncStoragePersister }}>
          <NetworkGate>
            <AuthProvider>
              <SettingsProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </SettingsProvider>
            </AuthProvider>
          </NetworkGate>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  testBanner: {
    backgroundColor: '#dc2626',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testBannerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
