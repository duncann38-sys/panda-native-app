import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth, type PandaAuthProvider } from '@/context/auth';
import { useBookingReminders } from '@/context/booking-reminders';
import { useSavedVenues } from '@/context/saved-venues';
import { useColors } from '@/hooks/useColors';
import { useLiveVenues } from '@/context/live-venues';
import {
  DEFAULT_PROFILE_PREFERENCES,
  formatDateOfBirthInput,
  parseProfilePreferences,
  profilePreferencesStorageKey,
  validateDateOfBirth,
  type ProfilePreferences,
} from '@/utils/profile-preferences';
import { profilePreferenceStore } from '@/utils/profile-preferences-store';
import { persistProfileAvatar, removeProfileAvatar } from '@/utils/profile-avatar';
import { PANDA_PRODUCTION_API } from '@/constants/services';

const PROFILE_BACKGROUND = '#DDF0DE';
type FeatherName = keyof typeof Feather.glyphMap;
type ProfileIconTone = { background: string; foreground: string };

const PROFILE_ICON_TONES: Partial<Record<FeatherName, ProfileIconTone>> = {
  bookmark: { background: '#F9E5B8', foreground: '#7B5416' },
  'credit-card': { background: '#DCEAF4', foreground: '#356B82' },
  'share-2': { background: '#F6DDE5', foreground: '#9A4864' },
  user: { background: '#DDF3E5', foreground: '#087052' },
  lock: { background: '#E8E0F6', foreground: '#68508D' },
  settings: { background: '#F9E5B8', foreground: '#7B5416' },
};

export default function ProfileScreen() {
  const bookingReminders = useBookingReminders();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profileTopPadding = Platform.OS === 'web' ? 21 : insets.top + 8;
  const { savedIds } = useSavedVenues();
  const { coordinates, liveArea } = useLiveVenues();
  const { account, getIdToken, signingIn, error: authError, signIn, signOut, clearError } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [homeAddressOpen, setHomeAddressOpen] = useState(false);
  const [profilePreferences, setProfilePreferences] = useState<ProfilePreferences>(DEFAULT_PROFILE_PREFERENCES);
  const [profilePreferencesReady, setProfilePreferencesReady] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [homeAddressError, setHomeAddressError] = useState<string | null>(null);
  const [savingHomeAddress, setSavingHomeAddress] = useState(false);
  const [newOpeningsPushEnabled, setNewOpeningsPushEnabled] = useState(false);
  const [newOpeningsPushReady, setNewOpeningsPushReady] = useState(false);
  const [savingNewOpeningsPush, setSavingNewOpeningsPush] = useState(false);
  const preferencesKey = profilePreferencesStorageKey(account?.uid);
  const ownerKey = useRef(preferencesKey);
  ownerKey.current = preferencesKey;

  useEffect(() => {
    let active = true;
    setProfilePreferences({ ...DEFAULT_PROFILE_PREFERENCES });
    setProfilePreferencesReady(false);
    profilePreferenceStore.read(account?.uid)
      .then((stored) => {
        if (active) setProfilePreferences(parseProfilePreferences(stored));
      })
      .catch(() => {
        if (active) setProfilePreferences({ ...DEFAULT_PROFILE_PREFERENCES });
      })
      .finally(() => {
        if (active) setProfilePreferencesReady(true);
      });
    return () => {
      active = false;
    };
  }, [preferencesKey]);

  const sharePanda = async () => {
    const url = 'https://www.pandaindustry.co/';
    try {
      await Share.share(
        {
          title: 'Discover Panda',
          message: `Come discover great places with me on Panda — your night-out companion.\n${url}`,
          url,
        },
        { dialogTitle: 'Share Panda' },
      );
    } catch {
      Alert.alert('Could not share Panda', 'Please try sharing again.');
    }
  };

  const showPasswordSettings = async () => {
    if (!account) {
      clearError();
      setAuthSheetOpen(true);
      return;
    }
    const url = `https://myaccount.google.com/security?authuser=${encodeURIComponent(account.email)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open security settings', 'Please open your account provider’s security page and try again.');
    }
  };

  const handleProfileSave = async (displayName: string, dateOfBirth: string) => {
    const dateError = validateDateOfBirth(dateOfBirth);
    if (dateError) {
      setProfileSaveError(dateError);
      return;
    }
    setProfileSaveError(null);
    setSavingProfile(true);
    try {
      const next = await profilePreferenceStore.update(account?.uid, {
        displayName: displayName.trim().slice(0, 60),
        dateOfBirth: dateOfBirth.trim(),
      });
      if (ownerKey.current !== preferencesKey) return;
      setProfilePreferences(next);
      setProfileEditOpen(false);
    } catch {
      setProfileSaveError('Your profile could not be saved on this device. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  useFocusEffect(useCallback(() => {
    let active = true;
    setNewOpeningsPushEnabled(false);
    setNewOpeningsPushReady(!account?.uid);
    if (!account?.uid) return () => { active = false; };
    (async () => {
      try {
        const idToken = await getIdToken();
        const response = await fetch(PANDA_PRODUCTION_API + '/api/new-openings-notifications', {
          method: 'GET', headers: { Authorization: 'Bearer ' + idToken, Accept: 'application/json' },
        });
        const data = await response.json();
        if (active && response.ok) setNewOpeningsPushEnabled(data.enabled === true);
      } catch { /* The setting remains off if the API is unavailable. */ }
      finally { if (active) setNewOpeningsPushReady(true); }
    })();
    return () => { active = false; };
  }, [account?.uid, getIdToken]));

  const handleNewOpeningsPushChange = async (enabled: boolean) => {
    if (!account?.uid) {
      Alert.alert('Sign in to enable weekly alerts', 'Panda can save a weekly openings preference to your account once you sign in.');
      return;
    }
    setSavingNewOpeningsPush(true);
    try {
      const idToken = await getIdToken();
      let fcmToken: string | undefined;
      if (enabled) {
        if (Platform.OS !== 'android') {
          throw new Error('Direct Firebase push registration is not configured for this platform yet. Your setting was not changed.');
        }
        let permission = await Notifications.getPermissionsAsync();
        if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
        if (!permission.granted) throw new Error('Allow Panda to send notifications in your device settings, then try again.');
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        if (deviceToken.type !== 'android' || typeof deviceToken.data !== 'string' || !deviceToken.data.trim()) {
          throw new Error('Panda could not obtain an Android Firebase token on this build. Your setting was not changed.');
        }
        fcmToken = deviceToken.data;
      }
      let citySlug: string | undefined;
      try {
        const cursor = await AsyncStorage.getItem('panda.new-openings.feed.v1:' + account.uid);
        const parsed = cursor ? JSON.parse(cursor) as { citySlug?: unknown } : null;
        if (typeof parsed?.citySlug === 'string') citySlug = parsed.citySlug;
      } catch { /* City is optional; the next feed visit will update it. */ }
      const response = await fetch(PANDA_PRODUCTION_API + '/api/new-openings-notifications', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ enabled, ...(fcmToken ? { fcmToken } : {}), ...(citySlug ? { citySlug } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.status === 'fcm_token_required'
        ? 'Panda needs a valid Firebase token before it can enable weekly alerts.'
        : 'Panda could not save this notification preference. Please try again.');
      setNewOpeningsPushEnabled(data.enabled === true);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Panda could not update weekly alerts.';
      Alert.alert('Weekly openings alerts', message);
    } finally { setSavingNewOpeningsPush(false); }
  };

  const handleNotificationsChange = async (enabled: boolean) => {
    try {
      const next = await profilePreferenceStore.update(account?.uid, { notificationsEnabled: enabled });
      if (ownerKey.current !== preferencesKey) return;
      setProfilePreferences(next);
      await bookingReminders.notificationsChanged(enabled);
    } catch {
      Alert.alert('Setting not saved', 'Your notification preference could not be saved on this device.');
    }
  };

  const handleHomeAddressSave = async (address: string) => {
    const cleanAddress = address.trim().slice(0, 240);
    setHomeAddressError(null);
    setSavingHomeAddress(true);
    try {
      if (!cleanAddress) {
        const next = await profilePreferenceStore.update(account?.uid, {
          homeAddress: '',
          homeLatitude: null,
          homeLongitude: null,
        });
        if (ownerKey.current === preferencesKey) setProfilePreferences(next);
        setHomeAddressOpen(false);
        return;
      }
      const locations = await Location.geocodeAsync(cleanAddress);
      const result = locations.find((item) =>
        Number.isFinite(item.latitude)
        && Number.isFinite(item.longitude)
        && Math.abs(item.latitude) <= 90
        && Math.abs(item.longitude) <= 180,
      );
      if (!result) {
        setHomeAddressError('We couldn’t find that address. Add a town or postcode and try again.');
        return;
      }
      const next = await profilePreferenceStore.update(account?.uid, {
        homeAddress: cleanAddress,
        homeLatitude: result.latitude,
        homeLongitude: result.longitude,
      });
      if (ownerKey.current === preferencesKey) setProfilePreferences(next);
      setHomeAddressOpen(false);
    } catch {
      setHomeAddressError('Your home destination could not be saved. Check the address and try again.');
    } finally {
      setSavingHomeAddress(false);
    }
  };

  const handleChangePhoto = async () => {
    let copiedUri: string | null = null;
    let committed = false;
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Photo access needed', 'Allow Panda to access your photos to choose a profile picture.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
        base64: Platform.OS === 'web',
      });
      const avatarUri = result.canceled ? null : result.assets[0]?.uri;
      if (!avatarUri) return;

      const asset = result.assets![0];
      copiedUri = Platform.OS === 'web'
        ? (asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : avatarUri)
        : await persistProfileAvatar(avatarUri, FileSystem);
      const next = await profilePreferenceStore.update(account?.uid, { avatarUri: copiedUri });
      committed = true;
      if (Platform.OS !== 'web') await removeProfileAvatar(profilePreferences.avatarUri, FileSystem).catch(() => {});
      if (ownerKey.current !== preferencesKey) return;
      setProfilePreferences(next);
    } catch {
      if (copiedUri && !committed && Platform.OS !== 'web') await removeProfileAvatar(copiedUri, FileSystem).catch(() => {});
      Alert.alert('Photo not updated', 'Panda could not save that profile photo on this device.');
    }
  };

  const confirmSignOut = () => {
    if (!account) {
      clearError();
      setAuthSheetOpen(true);
      return;
    }
    Alert.alert('Sign out of Panda?', 'You will need your Google account to use Panda again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { void signOut(); } },
    ]);
  };

  const handleSignIn = async (provider: PandaAuthProvider) => {
    const succeeded = await signIn(provider);
    if (succeeded) setAuthSheetOpen(false);
  };

  const showAccountDetails = () => {
    if (!account) {
      clearError();
      setAuthSheetOpen(true);
      return;
    }
    void Linking.openURL(`https://myaccount.google.com/?authuser=${encodeURIComponent(account.email)}`)
      .catch(() => Alert.alert('Could not open your Google account', 'Please check your connection and try again.'));
  };
  const profileName = profilePreferences.displayName || account?.name || '';
  const firstName = profileName.trim().split(/\s+/)[0] || 'there';

  return (
    <View style={[styles.screen, { backgroundColor: PROFILE_BACKGROUND }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: profileTopPadding + 245, paddingBottom: 125 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.locationCard, { backgroundColor: colors.secondary, borderColor: colors.mint300 }]}>
          <View style={[styles.locationSignal, { backgroundColor: colors.openBackground }]}>
            <View style={[styles.locationSignalDot, { backgroundColor: colors.green600 }]} />
          </View>
          <View style={styles.locationCopy}>
            <Text style={[styles.locationTitle, { color: colors.green800 }]}>
              Your location · {liveArea || (coordinates ? 'Current area' : 'Unavailable')}
            </Text>
            <Text style={[styles.locationSubtitle, { color: colors.green700 }]}>
              {coordinates ? 'Used for nearby places and local Panda answers' : 'Allow location for nearby places and local answers'}
            </Text>
          </View>
          <Text style={[styles.locationStatus, { color: coordinates ? colors.green700 : colors.mutedForeground }]}>
            {coordinates ? 'Location on' : 'Location off'}
          </Text>
        </View>
        <Text style={[styles.sectionLabel, { color: colors.green700 }]}>YOUR PANDA</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.card }]}>
          <ProfileMenuRow
            icon="bookmark"
            title="Saved places"
            subtitle={savedIds.length ? `${savedIds.length} place${savedIds.length === 1 ? '' : 's'} saved` : 'Your collection of favourites'}
            colors={colors}
            onPress={() => router.push('/saved')}
          />
          <ProfileMenuRow
            icon="home"
            title="Home for Uber"
            subtitle={profilePreferences.homeAddress ? 'Saved privately on this device' : 'Add your home for one-tap ride estimates'}
            colors={colors}
            onPress={() => {
              setHomeAddressError(null);
              setHomeAddressOpen(true);
            }}
          />
          <ProfileMenuRow
            icon="calendar"
            title="My bookings"
            subtitle={bookingReminders.countLabel}
            badge={bookingReminders.count === null ? '—' : String(bookingReminders.count)}
            colors={colors}
            onPress={() => router.push('/bookings')}
          />
          <ProfileMenuRow
            icon="credit-card"
            title="Panda Credit"
            subtitle="Coming Soon · card preview"
            colors={colors}
            onPress={() => router.push('/credit')}
          />
          <ProfileMenuRow
            icon="share-2"
            title="Share Panda"
            subtitle="Invite a friend to discover Panda"
            colors={colors}
            onPress={sharePanda}
            last
          />
        </View>

        <Text style={[styles.sectionLabel, styles.accountLabel, { color: colors.green700 }]}>ACCOUNT</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.card }]}>
          <ProfileMenuRow
            icon="user"
            title="Account details"
            subtitle={account ? `${account.email} · Google account` : 'Google sign-in required'}
            colors={colors}
            onPress={showAccountDetails}
          />
          <ProfileMenuRow
            icon="lock"
            title="Password & security"
            subtitle="Manage your Google account security"
            colors={colors}
            onPress={showPasswordSettings}
          />
          <ProfileMenuRow
            icon="settings"
            title="Settings"
            subtitle="Notifications and app preferences"
            colors={colors}
            onPress={() => setSettingsOpen(true)}
            last
          />
        </View>
        {account ? (
          <Pressable
            accessibilityLabel="Sign out of Panda"
            accessibilityRole="button"
            onPress={confirmSignOut}
            style={({ pressed }) => [styles.profileSignOut, { backgroundColor: colors.card }, pressed && styles.pressed]}
          >
            <Feather name="log-out" size={19} color={colors.destructive} />
            <Text style={[styles.profileSignOutText, { color: colors.destructive }]}>Sign out of Panda</Text>
          </Pressable>
        ) : null}

      </ScrollView>

      <View
        style={[
          styles.profileHeader,
          { backgroundColor: PROFILE_BACKGROUND, paddingTop: profileTopPadding },
        ]}
      >
        <View style={styles.topBar}>
          <Text style={[styles.pageTitle, { color: colors.green950 }]}>Profile</Text>
          <Pressable
            accessibilityLabel="Open Settings"
            accessibilityRole="button"
            onPress={() => setSettingsOpen(true)}
            style={({ pressed }) => [styles.topBarButton, { backgroundColor: colors.card }, pressed && styles.pressed]}
          >
            <Feather name="settings" size={20} color={colors.green700} />
          </Pressable>
        </View>

        <View style={styles.profileWelcome}>
          <Text style={[styles.welcomeEyebrow, { color: colors.green700 }]}>Welcome back · London</Text>
          <Text style={[styles.welcomeHeading, { color: colors.foreground }]}>
            Hi, {firstName}
          </Text>
        </View>

        <View style={[styles.identityCard, { backgroundColor: colors.card }]}>
          <ProfileAvatar
            size={86}
            showAdd
            name={profileName || 'Panda'}
            imageUri={profilePreferences.avatarUri}
            onPress={() => { void handleChangePhoto(); }}
          />
          <View style={styles.identityCopy}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>
              {profileName || 'Discover as a guest'}
            </Text>
            <Text style={[styles.email, { color: colors.mutedForeground }]}>
                {account?.email || 'Sign in with Google to use Panda'}
            </Text>
            <View style={[styles.memberPill, { backgroundColor: colors.secondary }]}>
              <Ionicons name="checkmark-circle" size={13} color={colors.green700} />
              <Text style={[styles.memberPillText, { color: colors.green700 }]}>
                {account ? `Verified ${account.provider} account` : 'Google sign-in required'}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="Edit profile details"
            accessibilityRole="button"
            onPress={() => {
              setProfileSaveError(null);
              setProfileEditOpen(true);
            }}
            style={[styles.editButton, { backgroundColor: colors.secondary }]}
          >
            <Feather name="edit-2" size={16} color={colors.green700} />
          </Pressable>
        </View>
      </View>

      <SettingsSheet
        visible={settingsOpen}
        dateOfBirth={profilePreferences.dateOfBirth}
        notificationsEnabled={profilePreferences.notificationsEnabled}
        notificationsReady={profilePreferencesReady}
        onNotificationsChange={(enabled) => { void handleNotificationsChange(enabled); }}
        newOpeningsPushEnabled={newOpeningsPushEnabled}
        newOpeningsPushReady={newOpeningsPushReady}
        savingNewOpeningsPush={savingNewOpeningsPush}
        onNewOpeningsPushChange={(enabled) => { void handleNewOpeningsPushChange(enabled); }}
        onClose={() => setSettingsOpen(false)}
        onEditProfile={() => {
          setSettingsOpen(false);
          setProfileSaveError(null);
          setProfileEditOpen(true);
        }}
      />
      <ProfileEditSheet
        visible={profileEditOpen}
        displayName={profilePreferences.displayName || account?.name || ''}
        dateOfBirth={profilePreferences.dateOfBirth}
        error={profileSaveError}
        saving={savingProfile}
        onClose={() => setProfileEditOpen(false)}
        onSave={handleProfileSave}
      />
      <HomeAddressSheet
        visible={homeAddressOpen}
        address={profilePreferences.homeAddress}
        error={homeAddressError}
        saving={savingHomeAddress}
        onClose={() => setHomeAddressOpen(false)}
        onSave={handleHomeAddressSave}
      />
      <AuthSheet
        visible={authSheetOpen}
        signingIn={signingIn}
        error={authError}
        onClose={() => {
          setAuthSheetOpen(false);
          clearError();
        }}
        onSignIn={handleSignIn}
      />
    </View>
  );
}

function HomeAddressSheet({
  visible,
  address,
  error,
  saving,
  onClose,
  onSave,
}: {
  visible: boolean;
  address: string;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (address: string) => Promise<void>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(address);

  useEffect(() => {
    if (visible) setDraft(address);
  }, [address, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close home address" accessibilityRole="button" onPress={onClose} style={styles.modalBackdrop} />
        <View style={[styles.settingsSheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <KeyboardAwareScrollViewCompat contentContainerStyle={styles.settingsContent}>
            <View style={styles.settingsHeader}>
              <View>
                <Text style={[styles.settingsTitle, { color: colors.foreground }]}>Uber Home</Text>
                <Text style={[styles.settingsSubtitle, { color: colors.mutedForeground }]}>Set your private destination once</Text>
              </View>
              <Pressable
                accessibilityLabel="Close home address"
                accessibilityRole="button"
                onPress={onClose}
                style={[styles.closeButton, { backgroundColor: colors.card }]}
              >
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Home address</Text>
            <TextInput
              accessibilityLabel="Home address"
              autoCapitalize="words"
              autoComplete="street-address"
              maxLength={240}
              multiline
              onChangeText={setDraft}
              placeholder="Street, town or postcode"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.homeAddressInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={draft}
            />
            <Text style={[styles.settingsHint, { color: colors.mutedForeground }]}>
              Encrypted on this device. Panda won’t send this address to its chat service; destination coordinates go to Uber only if you tap Continue in Uber.
            </Text>
            {error ? <Text accessibilityRole="alert" style={[styles.authError, { color: colors.destructive }]}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save home address"
              disabled={saving}
              onPress={() => { void onSave(draft); }}
              style={({ pressed }) => [
                styles.saveProfileButton,
                { backgroundColor: colors.green800 },
                (pressed || saving) && styles.pressed,
                saving && { opacity: 0.65 },
              ]}
            >
              <Text style={styles.authButtonText}>{saving ? 'Finding and saving…' : 'Save home address'}</Text>
            </Pressable>
            {address ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove saved home address"
                disabled={saving}
                onPress={() => { void onSave(''); }}
                style={({ pressed }) => [styles.removeHomeButton, pressed && styles.pressed]}
              >
                <Text style={[styles.removeHomeText, { color: colors.destructive }]}>Remove saved home</Text>
              </Pressable>
            ) : null}
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}

function ProfileMenuRow({
  icon,
  title,
  subtitle,
  badge,
  colors,
  onPress,
  last = false,
}: {
  icon: FeatherName;
  title: string;
  subtitle: string;
  badge?: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  last?: boolean;
}) {
  const iconTone = PROFILE_ICON_TONES[icon] ?? {
    background: colors.secondary,
    foreground: colors.green700,
  };

  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        !last && { borderBottomColor: colors.border, borderBottomWidth: 1 },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconTone.background }]}>
        <Feather name={icon} size={19} color={iconTone.foreground} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={[styles.menuTitle, { color: colors.foreground }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.menuSubtitle, { color: colors.mutedForeground }]}>
          {subtitle}
        </Text>
      </View>
      {badge !== undefined && <View style={{ minWidth: 30, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 15, backgroundColor: colors.secondary }}>
        <Text testID="profile-booking-count" style={{ color: colors.green800, fontFamily: 'Inter_700Bold', textAlign: 'center' }}>{badge}</Text>
      </View>}
      <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

function SettingsSheet({
  visible,
  dateOfBirth,
  notificationsEnabled,
  notificationsReady,
  onNotificationsChange,
  newOpeningsPushEnabled,
  newOpeningsPushReady,
  savingNewOpeningsPush,
  onNewOpeningsPushChange,
  onClose,
  onEditProfile,
}: {
  visible: boolean;
  dateOfBirth: string;
  notificationsEnabled: boolean;
  notificationsReady: boolean;
  onNotificationsChange: (value: boolean) => void;
  newOpeningsPushEnabled: boolean;
  newOpeningsPushReady: boolean;
  savingNewOpeningsPush: boolean;
  onNewOpeningsPushChange: (value: boolean) => void;
  onClose: () => void;
  onEditProfile: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close Settings" accessibilityRole="button" onPress={onClose} style={styles.modalBackdrop} />
        <View style={[styles.settingsSheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsContent}>
          <View style={styles.settingsHeader}>
            <View>
              <Text style={[styles.settingsTitle, { color: colors.foreground }]}>Settings and activity</Text>
              <Text style={[styles.settingsSubtitle, { color: colors.mutedForeground }]}>Make Panda work your way</Text>
            </View>
            <Pressable
              accessibilityLabel="Close Settings"
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.card }]}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <Text style={[styles.settingsOverline, { color: colors.mutedForeground }]}>YOUR PROFILE</Text>
          <View style={[styles.settingBlock, { backgroundColor: colors.card }]}>
            <SettingsAction
              icon="user"
              title="Profile details"
              subtitle={dateOfBirth ? `Date of birth · ${dateOfBirth}` : 'Name and date of birth'}
              colors={colors}
              onPress={onEditProfile}
            />
            <View style={styles.settingRow}>
              <View style={[styles.accountIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="bell" size={20} color={colors.green700} />
              </View>
              <Text style={[styles.settingTitle, { color: colors.foreground }]}>Notifications</Text>
              <Switch
                accessibilityLabel="Notifications"
                value={notificationsEnabled}
                onValueChange={onNotificationsChange}
                disabled={!notificationsReady}
                trackColor={{ false: colors.border, true: colors.green600 }}
                thumbColor={colors.card}
              />
            </View>
            <Text style={[styles.settingsHint, { color: colors.mutedForeground }]}>
              This preference is saved on this device.
            </Text>
            <View style={styles.settingRow}>
              <View style={[styles.accountIcon, { backgroundColor: colors.goldSoft }]}>
                <Feather name="sparkles" size={20} color={colors.goldDeep} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.settingTitle, { color: colors.foreground }]}>Weekly new openings</Text>
                <Text style={[styles.settingsHint, { color: colors.mutedForeground }]}>Friday picks for your last-seen city. Panda stores the city, not your precise location.</Text>
              </View>
              <Switch
                accessibilityLabel="Weekly new openings"
                value={newOpeningsPushEnabled}
                onValueChange={onNewOpeningsPushChange}
                disabled={!newOpeningsPushReady || savingNewOpeningsPush}
                trackColor={{ false: colors.border, true: colors.green600 }}
                thumbColor={colors.card}
              />
            </View>
            {!newOpeningsPushReady || savingNewOpeningsPush ? null : !newOpeningsPushEnabled ? (
              <Text style={[styles.settingsHint, { color: colors.mutedForeground }]}>Turn this on to receive one weekly digest. Device notification permission is requested only when you opt in.</Text>
            ) : null}

          </View>

          <Text style={[styles.version, { color: colors.mutedForeground }]}>Panda · v1.0</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AuthSheet({
  visible,
  signingIn,
  error,
  onClose,
  onSignIn,
}: {
  visible: boolean;
  signingIn: boolean;
  error: string | null;
  onClose: () => void;
  onSignIn: (provider: PandaAuthProvider) => Promise<void>;
}) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close sign-in" accessibilityRole="button" onPress={onClose} style={styles.modalBackdrop} />
        <View style={[styles.authSheet, { backgroundColor: colors.background }]}>
          <View style={styles.settingsHeader}>
            <View>
              <Text style={[styles.settingsTitle, { color: colors.foreground }]}>Sign in to Panda</Text>
              <Text style={[styles.settingsSubtitle, { color: colors.mutedForeground }]}>
                Sign in with Google to use Panda.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close sign-in"
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.card }]}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            disabled={signingIn}
            onPress={() => { void onSignIn('Google'); }}
            style={({ pressed }) => [
              styles.authButton,
              { backgroundColor: colors.green800 },
              pressed && styles.pressed,
              signingIn && { opacity: 0.65 },
            ]}
          >
            <Text style={styles.googleMark}>G</Text>
            <Text style={styles.authButtonText}>{signingIn ? 'Connecting securely…' : 'Continue with Google'}</Text>
          </Pressable>
          {error ? <Text accessibilityRole="alert" style={[styles.authError, { color: colors.destructive }]}>{error}</Text> : null}
          <Text style={[styles.authFootnote, { color: colors.mutedForeground }]}>
            Your account details are verified by Panda before sign-in is recorded.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function SettingsAction({
  icon,
  title,
  subtitle,
  colors,
  onPress,
  last = false,
}: {
  icon: FeatherName;
  title: string;
  subtitle: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingRow,
        !last && { borderBottomColor: colors.border, borderBottomWidth: 1 },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.accountIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={20} color={colors.green700} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.settingSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.border} />
    </Pressable>
  );
}

function ProfileEditSheet({
  visible,
  displayName,
  dateOfBirth,
  error,
  saving,
  onClose,
  onSave,
}: {
  visible: boolean;
  displayName: string;
  dateOfBirth: string;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (displayName: string, dateOfBirth: string) => Promise<void>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [nameDraft, setNameDraft] = useState(displayName);
  const [dobDraft, setDobDraft] = useState(dateOfBirth);

  useEffect(() => {
    if (visible) {
      setNameDraft(displayName);
      setDobDraft(dateOfBirth);
    }
  }, [dateOfBirth, displayName, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.editModalRoot, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 18) }]}>
        <Pressable accessibilityLabel="Close profile editor" accessibilityRole="button" onPress={onClose} style={styles.modalBackdrop} />
        <KeyboardAwareScrollViewCompat
          style={[styles.editSheet, { backgroundColor: colors.background }]}
          contentContainerStyle={styles.editSheetContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.settingsHeader}>
            <View>
              <Text style={[styles.settingsTitle, { color: colors.foreground }]}>Edit profile</Text>
              <Text style={[styles.settingsSubtitle, { color: colors.mutedForeground }]}>Update your Panda details</Text>
            </View>
            <Pressable
              accessibilityLabel="Close profile editor"
              accessibilityRole="button"
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.card }]}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Name shown on your profile</Text>
          <TextInput
            accessibilityLabel="Profile name"
            autoCapitalize="words"
            maxLength={60}
            onChangeText={setNameDraft}
            placeholder="Your name"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.profileInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={nameDraft}
          />

          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Date of birth</Text>
          <TextInput
            accessibilityLabel="Date of birth"
            keyboardType="number-pad"
            maxLength={10}
            onChangeText={(value) => setDobDraft(formatDateOfBirthInput(value))}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.profileInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={dobDraft}
          />
          <Text style={[styles.settingsHint, { color: colors.mutedForeground }]}>
            Optional. Kept on this device and not added to Panda sign-in analytics.
          </Text>

          {error ? <Text accessibilityRole="alert" style={[styles.authError, { color: colors.destructive }]}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save profile"
            disabled={saving}
            onPress={() => { void onSave(nameDraft, dobDraft); }}
            style={({ pressed }) => [
              styles.saveProfileButton,
              { backgroundColor: colors.green800 },
              (pressed || saving) && styles.pressed,
              saving && { opacity: 0.65 },
            ]}
          >
            <Text style={[styles.authButtonText, { color: colors.primaryForeground }]}>
              {saving ? 'Saving…' : 'Save profile'}
            </Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18 },
  profileHeader: {
    elevation: 8,
    left: 0,
    paddingHorizontal: 18,
    position: 'absolute',
    right: 0,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    top: 0,
    zIndex: 10,
  },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  pageTitle: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 },
  topBarButton: {
    alignItems: 'center',
    borderRadius: 14,
    elevation: 2,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  profileWelcome: { marginBottom: 10 },
  welcomeEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.4, marginBottom: 4 },
  welcomeHeading: { fontFamily: 'Inter_700Bold', fontSize: 25, letterSpacing: -0.7 },
  identityCard: { alignItems: 'center', borderRadius: 23, flexDirection: 'row', minHeight: 128, padding: 16 },
  identityCopy: { flex: 1, marginLeft: 14, minWidth: 0 },
  profileName: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.3 },
  email: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 4 },
  memberPill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, flexDirection: 'row', gap: 5, marginTop: 10, paddingHorizontal: 9, paddingVertical: 6 },
  memberPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  editButton: { alignItems: 'center', borderRadius: 11, height: 34, justifyContent: 'center', width: 34 },
  locationCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 58, paddingHorizontal: 12 },
  locationCopy: { flex: 1, minWidth: 0 },
  locationTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  locationSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 },
  locationSignal: { alignItems: 'center', borderRadius: 999, height: 20, justifyContent: 'center', width: 20 },
  locationSignalDot: { borderRadius: 999, height: 8, width: 8 },
  locationStatus: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  sectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.5, marginBottom: 9, marginLeft: 3, marginTop: 25 },
  accountLabel: { marginTop: 24 },
  groupCard: { borderRadius: 21, overflow: 'hidden' },
  menuRow: { alignItems: 'center', flexDirection: 'row', minHeight: 76, paddingHorizontal: 14 },
  menuIcon: { alignItems: 'center', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  menuCopy: { flex: 1, marginLeft: 12, minWidth: 0 },
  menuTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  menuSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 4 },
  footerCard: { alignItems: 'center', borderRadius: 17, borderWidth: 1, flexDirection: 'row', gap: 9, marginTop: 24, paddingHorizontal: 15, paddingVertical: 14 },
  footerText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  pressed: { opacity: 0.7 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6, 46, 34, 0.43)' },
  settingsSheet: { borderTopLeftRadius: 29, borderTopRightRadius: 29, maxHeight: '92%', minHeight: 0, paddingHorizontal: 18, paddingTop: 23 },
  settingsContent: { paddingBottom: 4 },
  settingsHint: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, paddingHorizontal: 14, paddingBottom: 12 },
  authSheet: { borderTopLeftRadius: 29, borderTopRightRadius: 29, paddingHorizontal: 18, paddingTop: 23, paddingBottom: 34 },
  settingsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  settingsTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, letterSpacing: -0.4 },
  settingsSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 3 },
  closeButton: { alignItems: 'center', borderRadius: 999, elevation: 2, height: 38, justifyContent: 'center', width: 38 },
  settingsOverline: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2, marginBottom: 8, marginLeft: 3, marginTop: 10 },
  accountCard: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', gap: 13, minHeight: 68, paddingHorizontal: 14 },
  accountIcon: { alignItems: 'center', borderRadius: 11, height: 40, justifyContent: 'center', width: 40 },
  accountName: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  accountEmail: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 },
  settingBlock: { borderRadius: 18, overflow: 'hidden' },
  settingRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 65, paddingHorizontal: 14 },
  settingCopy: { flex: 1 },
  settingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  settingSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 3 },
  logoutRow: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', gap: 13, minHeight: 65, paddingHorizontal: 14 },
  logoutText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  authButton: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 11, justifyContent: 'center', marginTop: 11, minHeight: 54, paddingHorizontal: 16 },
  authButtonText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 14 },
  googleMark: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 18 },
  authError: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  authFootnote: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, marginTop: 16, textAlign: 'center' },
  version: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 14, textAlign: 'center' },
  profileSignOut: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', gap: 12, marginTop: 18, minHeight: 58, paddingHorizontal: 17 },
  profileSignOutText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  editModalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  editSheet: { borderRadius: 25, maxHeight: '92%', overflow: 'hidden' },
  editSheetContent: { padding: 22, paddingBottom: 28 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 8, marginTop: 13 },
  profileInput: { borderRadius: 14, borderWidth: 1, fontFamily: 'Inter_500Medium', fontSize: 15, minHeight: 50, paddingHorizontal: 14 },
  homeAddressInput: { borderRadius: 14, borderWidth: 1, fontFamily: 'Inter_500Medium', fontSize: 15, minHeight: 84, paddingHorizontal: 14, paddingVertical: 13, textAlignVertical: 'top' },
  removeHomeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 42, marginTop: 5 },
  removeHomeText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  saveProfileButton: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', marginTop: 18, minHeight: 52, paddingHorizontal: 16 },
});