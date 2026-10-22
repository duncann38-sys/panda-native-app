import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth';
import * as FirebaseAuth from 'firebase/auth';
import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { Platform } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PANDA_PARTNER_ACTIVITY_API } from '@/constants/services';
import { restoreVerifiedPandaAccount } from '@/utils/auth-access';

export type PandaAuthProvider = 'Google' | 'Apple';

export type PandaAccount = {
  uid: string;
  email: string;
  name: string;
  provider: PandaAuthProvider;
};

type FirebaseWebConfig = FirebaseOptions & {
  authDomain: string;
  projectId: string;
  appId: string;
  apiKey: string;
};

type AuthContextValue = {
  account: PandaAccount | null;
  ready: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: (provider: PandaAuthProvider) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ACCOUNT_STORAGE_KEY = 'panda.native.verified-account.v1';
const FIREBASE_CONFIG_STORAGE_KEY = 'panda.firebase.public-config.v1';
const NATIVE_AUTH_PAGE = 'https://auth.pandaindustry.co/native-auth.html';
const APP_RETURN_URL = 'panda-mobile://auth';
const HEX_64 = /^[a-f0-9]{64}$/i;
const getReactNativePersistence = (FirebaseAuth as unknown as {
  getReactNativePersistence: (
    storage: typeof AsyncStorage,
  ) => NonNullable<Parameters<typeof initializeAuth>[1]>['persistence'];
}).getReactNativePersistence;

async function readAccount(): Promise<PandaAccount | null> {
  const raw = Platform.OS === 'web'
    ? await AsyncStorage.getItem(ACCOUNT_STORAGE_KEY)
    : await SecureStore.getItemAsync(ACCOUNT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PandaAccount>;
    if (typeof value.uid === 'string' && typeof value.email === 'string'
      && typeof value.name === 'string' && (value.provider === 'Google' || value.provider === 'Apple')) {
      return value as PandaAccount;
    }
  } catch {
    // Invalid local profile data is removed below.
  }
  await removeStoredAccount();
  return null;
}

async function writeAccount(account: PandaAccount): Promise<void> {
  const value = JSON.stringify(account);
  if (Platform.OS === 'web') await AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, value);
  else await SecureStore.setItemAsync(ACCOUNT_STORAGE_KEY, value);
}

async function removeStoredAccount(): Promise<void> {
  if (Platform.OS === 'web') await AsyncStorage.removeItem(ACCOUNT_STORAGE_KEY);
  else await SecureStore.deleteItemAsync(ACCOUNT_STORAGE_KEY);
}

async function randomHex(byteLength: number): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(byteLength);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function authErrorMessage(error: unknown): string {
  const code = String((error as { code?: string })?.code || '');
  if (code === 'auth/operation-not-allowed') {
    return 'Apple sign-in is not enabled for Panda yet. Google sign-in is available.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Panda sign-in is not authorised for this address yet.';
  }
  if (code === 'invalid_handoff' || code === 'invalid_handoff_request') {
    return 'That sign-in link expired. Please try again.';
  }
  if (code === 'account_save_failed' || code === 'handoff_save_failed') {
    return 'Panda could not save your account yet. Please try again shortly.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Panda could not complete sign-in. Please try again.';
}

async function fetchFirebaseConfig(): Promise<FirebaseWebConfig> {
  const response = await fetch(`${PANDA_PARTNER_ACTIVITY_API}/api/auth-config`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  const config = payload?.config as FirebaseWebConfig | undefined;
  if (!response.ok || !config?.apiKey || !config?.authDomain || !config?.projectId || !config?.appId) {
    throw new Error('Panda account configuration is unavailable.');
  }
  await AsyncStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
  return config;
}

async function readFirebaseConfig(): Promise<FirebaseWebConfig> {
  const cached = await AsyncStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
  if (cached) {
    try {
      const config = JSON.parse(cached) as FirebaseWebConfig;
      if (config.apiKey && config.authDomain && config.projectId && config.appId) return config;
    } catch {
      await AsyncStorage.removeItem(FIREBASE_CONFIG_STORAGE_KEY);
    }
  }
  return fetchFirebaseConfig();
}

async function getNativeFirebaseAuth(config: FirebaseWebConfig): Promise<Auth> {
  const appName = 'panda-native-auth';
  const app = getApps().some((candidate) => candidate.name === appName)
    ? getApp(appName)
    : initializeApp(config, appName);
  try {
    const persistence = Platform.OS === 'web'
      ? browserLocalPersistence
      : getReactNativePersistence(AsyncStorage);
    return initializeAuth(app, { persistence });
  } catch (error) {
    if ((error as { code?: string })?.code !== 'auth/already-initialized') throw error;
    return getAuth(app);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<PandaAccount | null>(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authRef = useRef<Auth | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);
  const sessionVersion = useRef(0);
  const signInPending = useRef(false);
  const observeSession = useCallback((auth: Auth, uid: string) => {
    listenerRef.current?.();
    const version = ++sessionVersion.current;
    listenerRef.current = onAuthStateChanged(auth, (user) => {
      if (version !== sessionVersion.current) return;
      if (!user || user.uid !== uid) {
        setAccount(null);
        void removeStoredAccount().catch((failure) => setError(authErrorMessage(failure)));
      }
    });
  }, []);

  useEffect(() => {
    let active = true;
    async function restoreSavedSession() {
      const saved = await readAccount();
      if (!active) return;
      if (!saved) { setReady(true); return; }
      try {
        const auth = await getNativeFirebaseAuth(await readFirebaseConfig());
        authRef.current = auth;
        const verified = await restoreVerifiedPandaAccount(saved, auth, removeStoredAccount);
        if (!active) return;
        setAccount(verified);
        if (verified) observeSession(auth, verified.uid);
      } catch (restoreError) {
        if (active) { setAccount(null); setError(authErrorMessage(restoreError)); }
      } finally {
        if (active) setReady(true);
      }
    }
    void restoreSavedSession().catch((restoreError) => {
      if (active) setError(authErrorMessage(restoreError));
      if (active) setReady(true);
    });
    return () => {
      active = false;
      sessionVersion.current++;
      listenerRef.current?.();
    };
  }, [observeSession]);

  const signIn = useCallback(async (provider: PandaAuthProvider): Promise<boolean> => {
    if (signInPending.current) return false;
    signInPending.current = true;
    setSigningIn(true);
    setError(null);
    try {
      // Verify the native Auth runtime before sending the user to Google.
      const firebaseAuth = await getNativeFirebaseAuth(await readFirebaseConfig());
      authRef.current = firebaseAuth;
      const state = await randomHex(32);
      const verifier = await randomHex(32);
      const challenge = await sha256Hex(verifier);
      const authUrl = `${NATIVE_AUTH_PAGE}?${new URLSearchParams({
        state,
        challenge,
        provider,
      })}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_RETURN_URL);
      if (result.type !== 'success' || !('url' in result) || !result.url) return false;
      if (!result.url.startsWith(`${APP_RETURN_URL}?`)) {
        throw new Error('Panda returned an unexpected sign-in link.');
      }
      const query = Linking.parse(result.url).queryParams || {};
      const code = stringParam(query.code as string | string[] | undefined);
      const returnedState = stringParam(query.state as string | string[] | undefined);
      if (!HEX_64.test(code) || returnedState !== state) {
        throw new Error('That sign-in link expired. Please try again.');
      }

      const exchangeResponse = await fetch(`${PANDA_PARTNER_ACTIVITY_API}/api/native-auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code, state, verifier }),
      });
      const exchange = await exchangeResponse.json().catch(() => ({}));
      if (!exchangeResponse.ok || !exchange.customToken || !exchange.user) {
        const failure = new Error(exchange.error || 'Panda could not finish sign-in.');
        (failure as Error & { code?: string }).code = exchange.error;
        throw failure;
      }
      sessionVersion.current++;
      listenerRef.current?.();
      const credential = await signInWithCustomToken(firebaseAuth, exchange.customToken);
      const verifiedAccount = exchange.user as PandaAccount;
      if (!verifiedAccount.uid || credential.user.uid !== verifiedAccount.uid || verifiedAccount.provider !== provider) {
        throw new Error('Panda could not verify that Google account. Please try again.');
      }
      await writeAccount(verifiedAccount);
      observeSession(firebaseAuth, verifiedAccount.uid);
      setAccount(verifiedAccount);
      return true;
    } catch (signInError) {
      setError(authErrorMessage(signInError));
      return false;
    } finally {
      signInPending.current = false;
      setSigningIn(false);
    }
  }, [signingIn, observeSession]);

  const signOut = useCallback(async () => {
    setError(null);
    setReady(false);
    setAccount(null);
    sessionVersion.current++;
    listenerRef.current?.();
    try {
      if (authRef.current) await firebaseSignOut(authRef.current);
    } catch (signOutError) {
      setError(authErrorMessage(signOutError));
    } finally {
      try { await removeStoredAccount(); } catch (failure) { setError(authErrorMessage(failure)); }
      finally { setReady(true); }
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    account,
    ready,
    signingIn,
    error,
    signIn,
    signOut,
    clearError: () => setError(null),
  }), [account, ready, signingIn, error, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
