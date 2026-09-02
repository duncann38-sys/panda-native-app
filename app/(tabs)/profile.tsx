import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useSavedVenues } from '@/context/saved-venues';
import { useColors } from '@/hooks/useColors';

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
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profileTopPadding = Platform.OS === 'web' ? 21 : insets.top + 8;
  const { savedVenues } = useSavedVenues();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const sharePanda = async () => {
    await Share.share({
      message: 'Come discover great places with me on Panda — your night-out companion.',
    });
  };

  const showPasswordSettings = () => {
    Alert.alert('Password & security', 'Your Panda sign-in and security details are managed securely with your account provider.');
  };

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
            <Text style={[styles.locationTitle, { color: colors.green800 }]}>Your location · London</Text>
            <Text style={[styles.locationSubtitle, { color: colors.green700 }]}>Showing the closest spots around you</Text>
          </View>
          <Text style={[styles.locationStatus, { color: colors.green700 }]}>Location on</Text>
        </View>
        <Text style={[styles.sectionLabel, { color: colors.green700 }]}>YOUR PANDA</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.card }]}>
          <ProfileMenuRow
            icon="bookmark"
            title="Saved places"
            subtitle={savedVenues.length ? `${savedVenues.length} place${savedVenues.length === 1 ? '' : 's'} saved` : 'Your collection of favourites'}
            colors={colors}
            onPress={() => router.push('/saved')}
          />
          <ProfileMenuRow
            icon="credit-card"
            title="Panda Credit"
            subtitle="Application, balance and payments"
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
            subtitle="Name, email and personal details"
            colors={colors}
            onPress={() => Alert.alert('Account details', 'Your account details are managed securely with your account provider.')}
          />
          <ProfileMenuRow
            icon="lock"
            title="Password & security"
            subtitle="Sign-in, password and security"
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

        <View style={[styles.footerCard, { backgroundColor: colors.honeySoft, borderColor: colors.goldLine }]}>
          <Ionicons name="sparkles-outline" size={19} color={colors.honeyInk} />
          <Text style={[styles.footerText, { color: colors.honeyInk }]}>Panda makes your next night out easy.</Text>
        </View>
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
          <Text style={[styles.welcomeHeading, { color: colors.foreground }]}>Hi, Duncan</Text>
        </View>

        <View style={[styles.identityCard, { backgroundColor: colors.card }]}>
          <ProfileAvatar size={86} showAdd />
          <View style={styles.identityCopy}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>Duncan Nyanzi</Text>
            <Text style={[styles.email, { color: colors.mutedForeground }]}>duncann38@gmail.com</Text>
            <View style={[styles.memberPill, { backgroundColor: colors.secondary }]}>
              <Ionicons name="checkmark-circle" size={13} color={colors.green700} />
              <Text style={[styles.memberPillText, { color: colors.green700 }]}>Panda member · 2026</Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="Edit profile photo"
            accessibilityRole="button"
            onPress={() => Alert.alert('Profile photo', 'Photo updates will be available in the Panda mobile app.')}
            style={[styles.editButton, { backgroundColor: colors.secondary }]}
          >
            <Feather name="edit-2" size={16} color={colors.green700} />
          </Pressable>
        </View>
      </View>

      <SettingsSheet
        visible={settingsOpen}
        notificationsEnabled={notificationsEnabled}
        onNotificationsChange={setNotificationsEnabled}
        onClose={() => setSettingsOpen(false)}
      />
    </View>
  );
}

function ProfileMenuRow({
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
      <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

function SettingsSheet({
  visible,
  notificationsEnabled,
  onNotificationsChange,
  onClose,
}: {
  visible: boolean;
  notificationsEnabled: boolean;
  onNotificationsChange: (value: boolean) => void;
  onClose: () => void;
}) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close Settings" accessibilityRole="button" onPress={onClose} style={styles.modalBackdrop} />
        <View style={[styles.settingsSheet, { backgroundColor: colors.background }]}>
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

          <Text style={[styles.settingsOverline, { color: colors.mutedForeground }]}>YOUR ACCOUNT</Text>
          <View style={[styles.accountCard, { backgroundColor: colors.card }]}>
            <View style={[styles.accountIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="user" size={20} color={colors.green700} />
            </View>
            <View>
              <Text style={[styles.accountName, { color: colors.foreground }]}>Duncan Nyanzi</Text>
              <Text style={[styles.accountEmail, { color: colors.mutedForeground }]}>duncann38@gmail.com</Text>
            </View>
          </View>

          <Text style={[styles.settingsOverline, { color: colors.mutedForeground }]}>HOW YOU USE PANDA</Text>
          <View style={[styles.settingBlock, { backgroundColor: colors.card }]}>
            <View style={styles.settingRow}>
              <View style={[styles.accountIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="bell" size={20} color={colors.green700} />
              </View>
              <Text style={[styles.settingTitle, { color: colors.foreground }]}>Notifications</Text>
              <Switch
                accessibilityLabel="Notifications"
                value={notificationsEnabled}
                onValueChange={onNotificationsChange}
                trackColor={{ false: colors.border, true: colors.green600 }}
                thumbColor={colors.card}
              />
            </View>
            <SettingsAction icon="bookmark" title="Saved places" subtitle="Your favourite spots" colors={colors} />
            <SettingsAction icon="share-2" title="Share Panda" subtitle="Invite friends to Panda" colors={colors} last />
          </View>

          <Text style={[styles.settingsOverline, { color: colors.mutedForeground }]}>SECURITY</Text>
          <SettingsAction icon="lock" title="Password & security" subtitle="Sign-in and security details" colors={colors} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            onPress={() => Alert.alert('Log out', 'You are still signed in to this preview.')}
            style={({ pressed }) => [styles.logoutRow, { backgroundColor: colors.card }, pressed && styles.pressed]}
          >
            <View style={[styles.accountIcon, { backgroundColor: '#FBE8E6' }]}>
              <Feather name="log-out" size={20} color={colors.destructive} />
            </View>
            <Text style={[styles.logoutText, { color: colors.destructive }]}>Log out</Text>
          </Pressable>
          <Text style={[styles.version, { color: colors.mutedForeground }]}>Panda · v1.0</Text>
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
  last = false,
}: {
  icon: FeatherName;
  title: string;
  subtitle: string;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.settingRow,
        !last && { borderBottomColor: colors.border, borderBottomWidth: 1 },
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
  settingsSheet: { borderTopLeftRadius: 29, borderTopRightRadius: 29, minHeight: 650, paddingHorizontal: 18, paddingTop: 23 },
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
  version: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 14, textAlign: 'center' },
});