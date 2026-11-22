import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useAuth } from '@/context/auth';
import { useLiveVenues } from '@/context/live-venues';
import { useSavedVenues } from '@/context/saved-venues';
import { useColors } from '@/hooks/useColors';
import {
  cancelPandaTable,
  createPandaTable,
  ensurePandaMeProfile,
  markPandaThreadRead,
  respondToPandaInvite,
  respondToPandaRequest,
  savePandaHome,
  searchPandaProfiles,
  sendPandaFriendRequest,
  sendPandaMessage,
  subscribeIncomingPandaRequests,
  subscribePandaBookings,
  subscribePandaCirclePulse,
  subscribePandaFriends,
  subscribePandaGuestStatuses,
  subscribePandaMessages,
  subscribePandaPromotions,
  subscribePandaProfile,
  subscribePandaThreads,
  updatePandaTable,
  type PandaCirclePulseItem,
  type PandaFriend,
  type PandaFriendRequest,
  type PandaMeProfile,
  type PandaMessage,
  type PandaPromotion,
  type PandaTable,
  type PandaThread,
} from '@/utils/panda-me-firestore';

function formatTableDate(value: unknown) {
  const date =
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : value instanceof Date
        ? value
        : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return 'Date to be confirmed';
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function asLocalDateInput(value: unknown) {
  const date =
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : value instanceof Date
        ? value
        : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return makeDateInput();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  );
}

function makeDateInput() {
  const date = new Date(Date.now() + 86_400_000);
  date.setHours(19, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  );
}

export default function PandaMeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { account } = useAuth();
  const { liveArea, locationStatus, coordinates } = useLiveVenues();
  const { savedIds, savedVenues, hydrated: savedHydrated } = useSavedVenues();
  const [profile, setProfile] = useState<PandaMeProfile | null>(null);
  const [home, setHome] = useState<{
    label: string;
    formattedAddress: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [friends, setFriends] = useState<PandaFriend[]>([]);
  const [requests, setRequests] = useState<PandaFriendRequest[]>([]);
  const [tables, setTables] = useState<PandaTable[]>([]);
  const [guestStatuses, setGuestStatuses] = useState<Record<string, string>>({});
  const [threads, setThreads] = useState<PandaThread[]>([]);
  const [promotions, setPromotions] = useState<PandaPromotion[]>([]);
  const [circlePulse, setCirclePulse] = useState<PandaCirclePulseItem[]>([]);
  const [homeOpen, setHomeOpen] = useState(false);
  const [friendOpen, setFriendOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [homeInput, setHomeInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [friendResults, setFriendResults] = useState<PandaMeProfile[]>([]);
  const [searchingFriends, setSearchingFriends] = useState(false);
  const [savingHome, setSavingHome] = useState(false);
  const [activeThread, setActiveThread] = useState<PandaThread | null>(null);
  const [messages, setMessages] = useState<PandaMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [venueNeighborhood, setVenueNeighborhood] = useState(liveArea || '');
  const [venueAddress, setVenueAddress] = useState('');
  const [tableDate, setTableDate] = useState(makeDateInput());
  const [partySize, setPartySize] = useState('4');
  const [tableNotes, setTableNotes] = useState('');
  const [selectedGuests, setSelectedGuests] = useState<PandaFriend[]>([]);
  const [venueToShare, setVenueToShare] = useState<(typeof savedVenues)[number] | null>(null);
  const [creatingTable, setCreatingTable] = useState(false);
  const [editingTable, setEditingTable] = useState<PandaTable | null>(null);

  useEffect(() => {
    if (!account) {
      setProfile(null);
      setFriends([]);
      setRequests([]);
      setTables([]);
      setThreads([]);
      setPromotions([]);
      setHome(null);
      setActiveThread(null);
      return;
    }
    let live = true;
    let offProfile = () => {};
    let offFriends = () => {};
    let offRequests = () => {};
    let offTables = () => {};
    let offThreads = () => {};
    let offPromotions = () => {};
    ensurePandaMeProfile(account.uid, account.name)
      .then((value) => {
        if (!live) return;
        setProfile(value);
        offProfile = subscribePandaProfile(
          account.uid,
          (data) => {
            if (data) {
              const nextHome = data.homeAddress as typeof home;
              setHome(nextHome && typeof nextHome.formattedAddress === 'string' ? nextHome : null);
            }
          },
          () => undefined,
        );
        offFriends = subscribePandaFriends(account.uid, setFriends, () => undefined);
        offRequests = subscribeIncomingPandaRequests(account.uid, setRequests, () => undefined);
        offTables = subscribePandaBookings(account.uid, setTables, () => undefined);
        offThreads = subscribePandaThreads(account.uid, setThreads, () => undefined);
        offPromotions = subscribePandaPromotions(setPromotions, () => undefined);
      })
      .catch((error) => {
        if (live)
          Alert.alert(
            'Panda Me',
            error instanceof Error
              ? error.message
              : 'Panda Me could not connect. Please try again.',
          );
      });
    return () => {
      live = false;
      offProfile();
      offFriends();
      offRequests();
      offTables();
      offThreads();
      offPromotions();
    };
  }, [account]);

  useEffect(() => {
    if (!account) {
      setGuestStatuses({});
      return;
    }
    try {
      return subscribePandaGuestStatuses(account.uid, setGuestStatuses, () => undefined);
    } catch {
      setGuestStatuses({});
    }
  }, [account?.uid]);

  useEffect(() => {
    if (!activeThread) {
      setMessages([]);
      return;
    }
    let off = () => {};
    try {
      off = subscribePandaMessages(activeThread.id, setMessages, () => undefined);
      if (account) markPandaThreadRead(activeThread.id, account.uid).catch(() => undefined);
    } catch {
      /* Firebase may still be restoring the signed-in session. */
    }
    return () => off();
  }, [activeThread?.id, account?.uid]);

  useEffect(() => {
    if (liveArea && !venueNeighborhood) setVenueNeighborhood(liveArea);
  }, [liveArea, venueNeighborhood]);

  useEffect(() => {
    if (!friends.length) {
      setCirclePulse([]);
      return;
    }
    try {
      return subscribePandaCirclePulse(friends, setCirclePulse, () => undefined);
    } catch {
      setCirclePulse([]);
    }
  }, [friends]);

  const openHome = () => {
    setHomeInput(home?.formattedAddress || '');
    setHomeOpen(true);
  };
  const saveHomeAddress = async () => {
    if (!account || !homeInput.trim()) {
      Alert.alert('Add your home address', 'Enter an address first.');
      return;
    }
    setSavingHome(true);
    try {
      const locations = await Location.geocodeAsync(homeInput.trim());
      if (!locations.length)
        throw new Error('Panda could not find that address. Check it and try again.');
      const first = locations[0];
      const address = {
        label: 'Home',
        formattedAddress: homeInput.trim(),
        lat: first.latitude,
        lng: first.longitude,
      };
      await savePandaHome(account.uid, address);
      setHome(address);
      setHomeOpen(false);
    } catch (error) {
      Alert.alert(
        'Could not save home',
        error instanceof Error ? error.message : 'Please check the address and try again.',
      );
    } finally {
      setSavingHome(false);
    }
  };

  const searchFriends = async () => {
    if (!account || searchInput.trim().length < 2) return;
    setSearchingFriends(true);
    try {
      setFriendResults(await searchPandaProfiles(searchInput, account.uid));
    } catch (error) {
      Alert.alert(
        'Friend search',
        error instanceof Error ? error.message : 'Search is unavailable right now.',
      );
    } finally {
      setSearchingFriends(false);
    }
  };

  const sendRequest = async (person: PandaMeProfile) => {
    if (!profile) return;
    try {
      await sendPandaFriendRequest(profile, person);
      setFriendResults((current) => current.filter((item) => item.uid !== person.uid));
      Alert.alert('Request sent', 'Panda will let you know when ' + person.name + ' responds.');
    } catch (error) {
      Alert.alert(
        'Friend request',
        error instanceof Error ? error.message : 'Could not send the request.',
      );
    }
  };

  const decideRequest = async (item: PandaFriendRequest, decision: 'accepted' | 'declined') => {
    if (!profile) return;
    try {
      await respondToPandaRequest(item, profile, decision);
    } catch (error) {
      Alert.alert(
        'Friend request',
        error instanceof Error ? error.message : 'Could not update the request.',
      );
    }
  };

  const openDirectMessage = async (friend: PandaFriend) => {
    if (!account || !profile) return;
    const ids = [account.uid, friend.uid].sort();
    const thread: PandaThread = {
      id: ids.join('__'),
      participantUids: ids,
      participantProfiles: [profile, friend],
    };
    if (venueToShare) {
      try {
        const venue = venueToShare;
        await sendPandaMessage(
          thread,
          account.uid,
          'Thought you might like ' + venue.name + '.',
          'venue',
          {
            placeId: venue.id,
            name: venue.name,
            category: venue.category,
            neighborhood: venue.neighborhood,
            fullAddress: venue.fullAddress,
            latitude: venue.latitude,
            longitude: venue.longitude,
            photoUri: venue.photoUris?.[0]?.uri,
            photoAttribution: venue.photoUris?.[0]?.attribution,
            mapsUri: venue.mapsUri,
            website: venue.website,
            phone: venue.phone,
            rating: venue.rating,
            price: venue.price,
            openNow: venue.openNow,
            source: venue.source,
          },
        );
        setVenueToShare(null);
      } catch (error) {
        Alert.alert(
          'Place not shared',
          error instanceof Error ? error.message : 'Please try again.',
        );
        return;
      }
    }
    setActiveThread(thread);
    setFriendOpen(false);
    setMessagesOpen(true);
  };

  const submitMessage = async () => {
    if (!account || !activeThread || !messageInput.trim()) return;
    setSendingMessage(true);
    try {
      await sendPandaMessage(activeThread, account.uid, messageInput.trim());
      setMessageInput('');
    } catch (error) {
      Alert.alert(
        'Message not sent',
        error instanceof Error ? error.message : 'Try again in a moment.',
      );
    } finally {
      setSendingMessage(false);
    }
  };

  const openNewTable = () => {
    setEditingTable(null);
    setVenueName('');
    setVenueNeighborhood(liveArea || '');
    setVenueAddress('');
    setTableDate(makeDateInput());
    setPartySize('4');
    setTableNotes('');
    setSelectedGuests([]);
    setTableOpen(true);
  };

  const editTable = (table: PandaTable) => {
    setEditingTable(table);
    setVenueName(table.venueName);
    setVenueNeighborhood(table.neighborhood);
    setVenueAddress(table.venueAddress || '');
    setTableDate(asLocalDateInput(table.dateTime));
    setPartySize(String(table.partySize));
    setTableNotes(table.notes || '');
    setTableOpen(true);
  };

  const askCancelTable = (table: PandaTable) => {
    Alert.alert(
      'Cancel this table?',
      'Your friends will see that this shared plan was cancelled.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel plan',
          style: 'destructive',
          onPress: () =>
            cancelPandaTable(table.id).catch((error) =>
              Alert.alert(
                'Could not cancel',
                error instanceof Error ? error.message : 'Please try again.',
              ),
            ),
        },
      ],
    );
  };

  const submitTable = async () => {
    if (!profile || !venueName.trim()) {
      Alert.alert('Add a venue', 'Give your table a venue name first.');
      return;
    }
    const requestedPartySize = Math.max(2, Math.min(12, Number(partySize) || 4));
    if (selectedGuests.length + 1 > requestedPartySize) {
      Alert.alert(
        'Party size is too small',
        'Increase the party size or remove a guest before saving.',
      );
      return;
    }
    const date = new Date(tableDate);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      Alert.alert('Check the date', 'Choose a future date and time.');
      return;
    }
    setCreatingTable(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (venueAddress.trim()) {
        const geocoded = await Location.geocodeAsync(venueAddress.trim()).catch(() => []);
        if (geocoded[0]) {
          lat = geocoded[0].latitude;
          lng = geocoded[0].longitude;
        }
      }
      if (editingTable) {
        await updatePandaTable(editingTable.id, {
          venueName,
          neighborhood: venueNeighborhood || liveArea || 'Nearby',
          venueAddress,
          venueLat: lat ?? null,
          venueLng: lng ?? null,
          dateTime: date,
          partySize: Number(partySize) || 4,
          notes: tableNotes,
        });
        setTableOpen(false);
        setEditingTable(null);
        Alert.alert('Plan updated', 'Your shared table details are saved.');
      } else {
        const created = await createPandaTable({
          host: profile,
          venueName,
          neighborhood: venueNeighborhood || liveArea || 'Nearby',
          venueAddress,
          venueLat: lat,
          venueLng: lng,
          dateTime: date,
          partySize: Number(partySize) || 4,
          notes: tableNotes,
          guests: selectedGuests,
        });
        setTableOpen(false);
        setVenueName('');
        setVenueAddress('');
        setTableNotes('');
        setSelectedGuests([]);
        Alert.alert(
          'Plan shared',
          created.failedGroupChat
            ? 'The plan is saved. Panda could not start the group chat, but your friends can still see their invitations in Panda Me.'
            : selectedGuests.length
              ? 'Your friends were invited in a shared Panda group chat.'
              : 'Your plan is saved in Panda Me.',
        );
      }
    } catch (error) {
      Alert.alert(
        'Could not create table',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setCreatingTable(false);
    }
  };

  const openSharedVenue = (venue: NonNullable<PandaMessage['venue']>) => {
    const routeVenue = {
      id: venue.placeId,
      name: venue.name,
      neighborhood: venue.neighborhood,
      category: venue.category,
      type: venue.category,
      distance: 'Nearby',
      walkingTime: '',
      rating: venue.rating || '',
      ratingCount: 0,
      price: venue.price || '',
      distanceMeters: 0,
      description: '',
      hours: '',
      feature: '',
      fullAddress: venue.fullAddress || venue.neighborhood,
      latitude: venue.latitude,
      longitude: venue.longitude,
      source: venue.source,
      openNow: venue.openNow ?? false,
      website: venue.website || '',
      mapsUri: venue.mapsUri || '',
      phone: venue.phone || '',
      premium: false,
      banging: false,
      promoted: false,
      photoAttributions: venue.photoAttribution ? [venue.photoAttribution] : [],
      photoUris: venue.photoUri
        ? [{ uri: venue.photoUri, attribution: venue.photoAttribution || '' }]
        : [],
    };
    setMessagesOpen(false);
    router.push({
      pathname: '/(tabs)/map',
      params: {
        directionsVenueId: venue.placeId,
        directionsVenueData: JSON.stringify(routeVenue),
        directionsReturn: 'back',
        routeMode: 'walking',
      },
    });
  };

  const openUber = async (destination: string) => {
    const url =
      'https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=' +
      encodeURIComponent(destination);
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Uber link unavailable', 'Copy this destination into Uber: ' + destination);
    }
  };

  const upcomingTables = tables
    .filter(
      (table) =>
        table.status === 'upcoming' &&
        (() => {
          const value = table.dateTime as { toMillis?: () => number } | undefined;
          return value?.toMillis
            ? value.toMillis() > Date.now()
            : new Date(String(table.dateTime || '')).getTime() > Date.now();
        })(),
    )
    .slice(0, 4);
  const areaLabel = liveArea || (locationStatus === 'loading' ? 'Finding your area' : 'Your area');
  const unread =
    requests.length > 0 ||
    threads.some((thread) => thread.unreadBy?.includes(account?.uid || '')) ||
    Object.values(guestStatuses).some((status) => status === 'invited');

  const SectionTitle = ({
    eyebrow,
    title,
    action,
    onPress,
  }: {
    eyebrow: string;
    title: string;
    action?: string;
    onPress?: () => void;
  }) => (
    <View style={styles.sectionTitleRow}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && onPress ? (
        <Pressable onPress={onPress} style={styles.textAction}>
          <Text style={styles.textActionText}>{action}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.green800} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 12) + 10, paddingBottom: 132 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topLine}>
          <Text style={styles.eyebrow}>THE PANDA CLUB</Text>
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              setMessagesOpen(true);
              setActiveThread(null);
            }}
            accessibilityLabel="Open messages"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={21} color={colors.green900} />
            {unread ? <View style={styles.unreadDot} /> : null}
          </Pressable>
        </View>
        <View style={styles.profileRow}>
          <ProfileAvatar
            size={62}
            active
            name={profile?.name || account?.name}
            imageUri={profile?.avatar}
          />
          <View style={styles.profileCopy}>
            <Text style={styles.pageTitle}>Panda Me</Text>
            <Text style={styles.profileName}>
              {profile?.name || account?.name || 'Your Panda profile'}
            </Text>
            <Text style={styles.handle}>
              {profile?.handle ? '@' + profile.handle : 'Your private social space'}
            </Text>
          </View>
          <Pressable onPress={() => setFriendOpen(true)} style={styles.addFriendButton}>
            <Ionicons name="person-add-outline" size={17} color={colors.ivory} />
            <Text style={styles.addFriendText}>Add</Text>
          </Pressable>
        </View>
        <View style={styles.homeCard}>
          <View style={styles.homeIcon}>
            <Ionicons name="home-outline" size={20} color={colors.goldDeep} />
          </View>
          <View style={styles.homeCopy}>
            <Text style={styles.homeLabel}>YOUR HOME</Text>
            <Text style={styles.homeAddress} numberOfLines={2}>
              {home?.formattedAddress || 'Set your home for an easier ride back'}
            </Text>
          </View>
          <Pressable onPress={openHome} style={styles.smallEditButton}>
            <Text style={styles.smallEditText}>{home ? 'Edit' : 'Set'}</Text>
          </Pressable>
        </View>

        <View style={styles.mapCard}>
          <View style={styles.mapOrb}>
            <Ionicons name="map-outline" size={23} color={colors.ivory} />
          </View>
          <View style={styles.mapCopy}>
            <Text style={styles.mapEyebrow}>DISCOVER AROUND YOU</Text>
            <Text style={styles.mapTitle}>{areaLabel}</Text>
            <Text style={styles.mapSubtitle}>
              {coordinates
                ? 'Your device location is ready for nearby places.'
                : 'Nearby discovery and directions are still here.'}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/map')} style={styles.mapButton}>
            <Text style={styles.mapButtonText}>Explore map</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.green950} />
          </Pressable>
        </View>

        {requests.length ? (
          <View style={styles.requestSection}>
            <SectionTitle eyebrow="YOUR CIRCLE" title="Friend requests" />
            <View style={styles.card}>
              {requests.map((request) => (
                <View key={request.id} style={styles.requestRow}>
                  <ProfileAvatar size={42} name={request.fromName} imageUri={request.fromAvatar} />
                  <View style={styles.friendCopy}>
                    <Text style={styles.friendName}>{request.fromName}</Text>
                    <Text style={styles.handle}>@{request.fromHandle}</Text>
                  </View>
                  <Pressable
                    style={styles.acceptButton}
                    onPress={() => decideRequest(request, 'accepted')}
                  >
                    <Text style={styles.acceptText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => decideRequest(request, 'declined')}
                    style={styles.declineButton}
                  >
                    <Ionicons name="close" size={17} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionTitle
            eyebrow="YOUR PLANS"
            title="Tables & experiences"
            action="All plans"
            onPress={() => router.push('/bookings')}
          />
          <View style={styles.tableHero}>
            <View style={styles.tableHeroTop}>
              <View>
                <Text style={styles.tableHeroEyebrow}>GOOD THINGS AHEAD</Text>
                <Text style={styles.tableHeroTitle}>Make a plan together.</Text>
              </View>
              <Ionicons name="sparkles-outline" size={25} color={colors.honeySoft} />
            </View>
            <View style={styles.tableActions}>
              <Pressable style={styles.tablePrimary} onPress={openNewTable}>
                <Ionicons name="add" size={18} color={colors.green950} />
                <Text style={styles.tablePrimaryText}>Plan a table</Text>
              </Pressable>
              <Pressable style={styles.tableSecondary} onPress={() => router.push('/bookings')}>
                <Text style={styles.tableSecondaryText}>Bookings</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.ivory} />
              </Pressable>
            </View>
          </View>
          {upcomingTables.length ? (
            upcomingTables.map((table) => {
              const isGuest = table.hostUid !== account?.uid;
              const destination =
                table.venueAddress ||
                [table.venueName, table.neighborhood].filter(Boolean).join(', ');
              return (
                <View key={table.id} style={styles.planCard}>
                  <View style={styles.planHeader}>
                    <View style={styles.planIcon}>
                      <Ionicons name="calendar-outline" size={19} color={colors.green800} />
                    </View>
                    <View style={styles.planCopy}>
                      <Text style={styles.planVenue}>{table.venueName}</Text>
                      <Text style={styles.planMeta}>
                        {table.neighborhood} · {formatTableDate(table.dateTime)}
                      </Text>
                      <Text style={styles.planParty}>
                        {table.partySize} guests ·{' '}
                        {isGuest ? 'Invited by a friend' : 'Hosted by you'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.planButtons}>
                    {isGuest && guestStatuses[table.id] === 'invited' ? (
                      <>
                        <Pressable
                          onPress={() =>
                            respondToPandaInvite(table.id, account!.uid, 'going').catch(() =>
                              Alert.alert('RSVP', 'Could not confirm just now.'),
                            )
                          }
                          style={styles.rsvpButton}
                        >
                          <Text style={styles.rsvpText}>I’m in</Text>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            respondToPandaInvite(table.id, account!.uid, 'declined').catch(() =>
                              Alert.alert('RSVP', 'Could not update just now.'),
                            )
                          }
                          style={styles.outlineButton}
                        >
                          <Text style={styles.outlineText}>Can’t make it</Text>
                        </Pressable>
                      </>
                    ) : isGuest && guestStatuses[table.id] === 'going' ? (
                      <Text style={styles.rsvpStatus}>You’re going</Text>
                    ) : isGuest && guestStatuses[table.id] === 'declined' ? (
                      <Text style={styles.declinedStatus}>Declined</Text>
                    ) : null}
                    <Pressable onPress={() => openUber(destination)} style={styles.uberButton}>
                      <Ionicons name="car-outline" size={16} color={colors.green900} />
                      <Text style={styles.uberText}>Uber there</Text>
                    </Pressable>
                    {home ? (
                      <Pressable
                        onPress={() => openUber(home.formattedAddress)}
                        style={styles.uberHome}
                      >
                        <Text style={styles.uberHomeText}>Uber home</Text>
                      </Pressable>
                    ) : null}
                    {!isGuest && table.source === 'manual' ? (
                      <>
                        <Pressable onPress={() => editTable(table)} style={styles.uberHome}>
                          <Text style={styles.uberHomeText}>Edit</Text>
                        </Pressable>
                        <Pressable onPress={() => askCancelTable(table)} style={styles.uberHome}>
                          <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyPlan}>
              <Text style={styles.emptyTitle}>No shared plans yet</Text>
              <Text style={styles.emptyText}>
                Start one here, invite friends, and keep the details together.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionTitle
            eyebrow="PEOPLE YOU LIKE"
            title="Your circle"
            action="Add friends"
            onPress={() => setFriendOpen(true)}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendRail}
          >
            {friends.map((friend) => (
              <Pressable
                key={friend.uid}
                onPress={() => openDirectMessage(friend)}
                style={styles.friendBubble}
              >
                <ProfileAvatar size={54} name={friend.name} imageUri={friend.avatar} />
                <Text numberOfLines={1} style={styles.friendBubbleName}>
                  {friend.name.split(' ')[0]}
                </Text>
                <Text numberOfLines={1} style={styles.friendBubbleHandle}>
                  @{friend.handle}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setFriendOpen(true)} style={styles.addFriendBubble}>
              <View style={styles.addCircle}>
                <Ionicons name="add" size={24} color={colors.green800} />
              </View>
              <Text style={styles.friendBubbleName}>Find people</Text>
            </Pressable>
          </ScrollView>
        </View>

        <View style={styles.section}>
          <SectionTitle eyebrow="CIRCLE PULSE" title="Lately in your circle" />
          {circlePulse.length ? (
            <View style={styles.pulseCard}>
              {circlePulse.slice(0, 5).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push('/map')}
                  style={styles.pulseRow}
                >
                  {item.photoUri ? (
                    <Image
                      source={{ uri: item.photoUri }}
                      contentFit="cover"
                      style={styles.pulsePhoto}
                    />
                  ) : (
                    <View style={[styles.pulsePhoto, styles.savedPhotoFallback]}>
                      <Ionicons name="bookmark-outline" size={17} color={colors.goldDeep} />
                    </View>
                  )}
                  <View style={styles.friendCopy}>
                    <Text style={styles.pulsePlace} numberOfLines={1}>
                      {item.placeName}
                    </Text>
                    <Text style={styles.pulseMeta} numberOfLines={1}>
                      {item.friendName} saved this · {item.neighborhood || item.category}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.green800} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyInline}>
              <Text style={styles.emptyText}>
                When friends save a place, you’ll see it here — just for your circle.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionTitle
            eyebrow="KEEP YOUR FAVOURITES CLOSE"
            title="Saved places"
            action="See all"
            onPress={() => router.push('/saved')}
          />
          {savedHydrated && savedVenues.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.savedRail}
            >
              {savedVenues.slice(0, 8).map((venue) => (
                <View key={venue.id} style={styles.savedCard}>
                  {venue.photoUris?.[0]?.uri ? (
                    <Image
                      source={{ uri: venue.photoUris[0].uri }}
                      contentFit="cover"
                      style={styles.savedPhoto}
                    />
                  ) : (
                    <View style={[styles.savedPhoto, styles.savedPhotoFallback]}>
                      <Ionicons name="heart" size={25} color={colors.honey} />
                    </View>
                  )}
                  <Text style={styles.savedName} numberOfLines={1}>
                    {venue.name}
                  </Text>
                  <Text style={styles.savedMeta} numberOfLines={1}>
                    {venue.category} · {venue.neighborhood}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setVenueToShare(venue);
                      setFriendOpen(true);
                    }}
                    style={styles.shareButton}
                  >
                    <Ionicons name="paper-plane-outline" size={14} color={colors.green900} />
                    <Text style={styles.shareText}>Share</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyInline}>
              <Text style={styles.emptyText}>
                {savedIds.length
                  ? savedIds.length + ' saved places are on this device.'
                  : 'Save a place you love and it will appear here.'}
              </Text>
              <Pressable onPress={() => router.push('/saved')}>
                <Text style={styles.textActionText}>Browse saved places</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionTitle eyebrow="A LITTLE EXTRA" title="Panda perks" />
          <View style={styles.promoCard}>
            {promotions.length ? (
              promotions.slice(0, 3).map((promo) => (
                <View key={promo.id} style={styles.promoRow}>
                  <View style={styles.promoMark}>
                    <Ionicons name="gift-outline" size={18} color={colors.goldDeep} />
                  </View>
                  <View style={styles.friendCopy}>
                    <Text style={styles.promoTitle}>{promo.title}</Text>
                    <Text style={styles.promoDescription}>
                      {promo.description || promo.venueName || 'A Panda offer for you.'}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <>
                <View style={styles.promoMark}>
                  <Ionicons name="gift-outline" size={20} color={colors.goldDeep} />
                </View>
                <View style={styles.friendCopy}>
                  <Text style={styles.promoTitle}>Good things, when they arrive.</Text>
                  <Text style={styles.promoDescription}>
                    Panda offers will show here. Nothing is being sent to you until it is live.
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
        <Text style={styles.footerNote}>
          Your map, location and directions still work as before — now they’re part of Panda Me.
        </Text>
      </ScrollView>

      <Modal
        visible={homeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setHomeOpen(false)}
      >
        <View style={styles.modalScrim}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetWrap}
          >
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetEyebrow}>YOUR RIDE HOME</Text>
              <Text style={styles.sheetTitle}>Set your home address</Text>
              <Text style={styles.sheetBody}>
                Panda stores this privately to make “Uber home” quicker. You can change or remove it
                any time.
              </Text>
              <TextInput
                value={homeInput}
                onChangeText={setHomeInput}
                placeholder="Start typing your address"
                placeholderTextColor={colors.mutedForeground}
                style={styles.input}
                autoCapitalize="words"
                returnKeyType="done"
              />
              <Pressable
                disabled={savingHome}
                onPress={saveHomeAddress}
                style={[styles.sheetPrimary, savingHome && styles.disabled]}
              >
                {savingHome ? (
                  <ActivityIndicator color={colors.green950} />
                ) : (
                  <Text style={styles.sheetPrimaryText}>Save home</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setHomeOpen(false)} style={styles.sheetCancel}>
                <Text style={styles.sheetCancelText}>Not now</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={friendOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFriendOpen(false)}
      >
        <View style={styles.modalScrim}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetWrap}
          >
            <View style={[styles.sheet, styles.tallSheet]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetTitleRow}>
                <View>
                  <Text style={styles.sheetEyebrow}>YOUR PEOPLE</Text>
                  <Text style={styles.sheetTitle}>
                    {venueToShare ? 'Share a favourite' : 'Find your circle'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setFriendOpen(false);
                    setVenueToShare(null);
                  }}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={20} color={colors.green900} />
                </Pressable>
              </View>
              <View style={styles.searchRow}>
                <TextInput
                  value={searchInput}
                  onChangeText={setSearchInput}
                  placeholder="Name or @handle"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, styles.searchInput]}
                  autoCapitalize="none"
                  onSubmitEditing={searchFriends}
                />
                <Pressable onPress={searchFriends} style={styles.searchButton}>
                  {searchingFriends ? (
                    <ActivityIndicator color={colors.ivory} />
                  ) : (
                    <Ionicons name="search" size={19} color={colors.ivory} />
                  )}
                </Pressable>
              </View>
              <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
                {friendResults.map((person) => (
                  <View key={person.uid} style={styles.requestRow}>
                    <ProfileAvatar size={42} name={person.name} imageUri={person.avatar} />
                    <View style={styles.friendCopy}>
                      <Text style={styles.friendName}>{person.name}</Text>
                      <Text style={styles.handle}>@{person.handle}</Text>
                    </View>
                    <Pressable onPress={() => sendRequest(person)} style={styles.acceptButton}>
                      <Text style={styles.acceptText}>Add</Text>
                    </Pressable>
                  </View>
                ))}
                {friendResults.length === 0 ? (
                  <Text style={styles.sheetHint}>
                    Search Panda by name or handle. Accepting a request creates a private connection
                    between you.
                  </Text>
                ) : null}
                <Text style={styles.sheetEyebrow}>YOUR FRIENDS</Text>
                {friends.map((friend) => (
                  <View key={friend.uid} style={styles.requestRow}>
                    <ProfileAvatar size={40} name={friend.name} imageUri={friend.avatar} />
                    <View style={styles.friendCopy}>
                      <Text style={styles.friendName}>{friend.name}</Text>
                      <Text style={styles.handle}>@{friend.handle}</Text>
                    </View>
                    <Pressable
                      onPress={() => openDirectMessage(friend)}
                      style={styles.messageFriendButton}
                    >
                      <Ionicons name="chatbubble-outline" size={16} color={colors.green900} />
                      <Text style={styles.messageFriendText}>
                        {venueToShare ? 'Share' : 'Message'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={tableOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTableOpen(false)}
      >
        <View style={styles.modalScrim}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetWrap}
          >
            <View style={[styles.sheet, styles.tallSheet]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetTitleRow}>
                <View>
                  <Text style={styles.sheetEyebrow}>MAKE A PLAN</Text>
                  <Text style={styles.sheetTitle}>
                    {editingTable ? 'Edit your plan' : 'Plan a table'}
                  </Text>
                  <Text style={styles.sheetBody}>
                    This creates a shared Panda plan and invites friends; it does not reserve the
                    venue.
                  </Text>
                </View>
                <Pressable onPress={() => setTableOpen(false)} style={styles.closeButton}>
                  <Ionicons name="close" size={20} color={colors.green900} />
                </Pressable>
              </View>
              <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
                <Text style={styles.inputLabel}>VENUE</Text>
                <TextInput
                  value={venueName}
                  onChangeText={setVenueName}
                  placeholder="Restaurant, pub or bar"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                />
                <Text style={styles.inputLabel}>AREA</Text>
                <TextInput
                  value={venueNeighborhood}
                  onChangeText={setVenueNeighborhood}
                  placeholder="Neighbourhood or city"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                />
                <Text style={styles.inputLabel}>ADDRESS (OPTIONAL, FOR DIRECTIONS)</Text>
                <TextInput
                  value={venueAddress}
                  onChangeText={setVenueAddress}
                  placeholder="Street address"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                />
                <Text style={styles.inputLabel}>DATE AND TIME</Text>
                <TextInput
                  value={tableDate}
                  onChangeText={setTableDate}
                  placeholder="YYYY-MM-DDTHH:mm"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                />
                <Text style={styles.inputLabel}>PARTY SIZE</Text>
                <TextInput
                  value={partySize}
                  onChangeText={setPartySize}
                  keyboardType="number-pad"
                  placeholder="4"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                />
                <Text style={styles.inputLabel}>INVITE FRIENDS</Text>
                <Text style={styles.planMeta}>
                  Choose up to {Math.min(9, Math.max(1, (Number(partySize) || 4) - 1))} friends.
                  Everyone invited can chat together here.
                </Text>
                <View style={styles.guestChips}>
                  {friends.map((friend) => {
                    const selected = selectedGuests.some((item) => item.uid === friend.uid);
                    return (
                      <Pressable
                        key={friend.uid}
                        onPress={() =>
                          setSelectedGuests((current) =>
                            selected
                              ? current.filter((item) => item.uid !== friend.uid)
                              : current.length <
                                  Math.min(9, Math.max(1, (Number(partySize) || 4) - 1))
                                ? [...current, friend]
                                : current,
                          )
                        }
                        style={[styles.guestChip, selected && styles.guestChipSelected]}
                      >
                        <Text
                          style={[styles.guestChipText, selected && styles.guestChipTextSelected]}
                        >
                          {friend.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {!friends.length ? (
                    <Pressable
                      onPress={() => {
                        setTableOpen(false);
                        setFriendOpen(true);
                      }}
                    >
                      <Text style={styles.textActionText}>Add friends first</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  value={tableNotes}
                  onChangeText={setTableNotes}
                  placeholder="A note for the group (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, styles.notesInput]}
                  multiline
                />
              </ScrollView>
              <Pressable
                disabled={creatingTable}
                onPress={submitTable}
                style={[styles.sheetPrimary, creatingTable && styles.disabled]}
              >
                {creatingTable ? (
                  <ActivityIndicator color={colors.green950} />
                ) : (
                  <Text style={styles.sheetPrimaryText}>
                    {editingTable ? 'Save changes' : 'Create plan and invite'}
                  </Text>
                )}
              </Pressable>
              {editingTable ? (
                <Pressable
                  onPress={() => {
                    setTableOpen(false);
                    setEditingTable(null);
                  }}
                  style={styles.sheetCancel}
                >
                  <Text style={styles.sheetCancelText}>Discard changes</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setTableOpen(false);
                  router.push('/map');
                }}
                style={styles.sheetCancel}
              >
                <Text style={styles.sheetCancelText}>Explore nearby on map instead</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={messagesOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setMessagesOpen(false);
          setActiveThread(null);
        }}
      >
        <View style={styles.modalScrim}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetWrap}
          >
            <View style={[styles.sheet, styles.messageSheet]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetTitleRow}>
                <View>
                  <Text style={styles.sheetEyebrow}>PANDA MESSAGES</Text>
                  <Text style={styles.sheetTitle}>
                    {activeThread
                      ? activeThread.title ||
                        activeThread.participantProfiles?.find(
                          (person) => person.uid !== account?.uid,
                        )?.name ||
                        'Your conversation'
                      : 'Your conversations'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setMessagesOpen(false);
                    setActiveThread(null);
                  }}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={20} color={colors.green900} />
                </Pressable>
              </View>
              {activeThread ? (
                <>
                  <ScrollView
                    style={styles.messageList}
                    contentContainerStyle={styles.messageListContent}
                  >
                    {messages.map((message) => (
                      <View
                        key={message.id}
                        style={[
                          styles.messageBubble,
                          message.senderUid === account?.uid
                            ? styles.messageOwn
                            : styles.messageOther,
                        ]}
                      >
                        <Text
                          style={[
                            styles.messageText,
                            message.senderUid === account?.uid && styles.messageOwnText,
                          ]}
                        >
                          {message.text ||
                            (message.type === 'venue'
                              ? 'Shared a place: ' + message.venue?.name
                              : message.type === 'table_invite'
                                ? 'Shared a table invitation.'
                                : '')}
                        </Text>
                        {message.type === 'venue' && message.venue ? (
                          <View style={styles.sharedVenueCard}>
                            {message.venue.photoUri ? (
                              <Image
                                source={{ uri: message.venue.photoUri }}
                                style={styles.sharedVenueImage}
                                contentFit="cover"
                              />
                            ) : null}
                            <View style={styles.sharedVenueMeta}>
                              <Text style={styles.sharedVenueTitle} numberOfLines={2}>
                                {message.venue.name}
                              </Text>
                              <Text style={styles.sharedVenueDetails} numberOfLines={1}>
                                {message.venue.category} · {message.venue.neighborhood}
                              </Text>
                              {message.venue.photoAttribution ? (
                                <Text style={styles.sharedVenueAttribution} numberOfLines={1}>
                                  Photo: {message.venue.photoAttribution}
                                </Text>
                              ) : null}
                              <Pressable
                                onPress={() => openSharedVenue(message.venue!)}
                                style={styles.sharedVenueButton}
                              >
                                <Text style={styles.sharedVenueButtonText}>Open restaurant</Text>
                                <Ionicons name="arrow-forward" size={15} color={colors.ivory} />
                              </Pressable>
                            </View>
                          </View>
                        ) : null}
                        {message.type === 'table_invite' ? (
                          <Pressable
                            onPress={() => {
                              setMessagesOpen(false);
                              router.push('/bookings');
                            }}
                          >
                            <Text style={styles.messageLink}>View table plans</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                  </ScrollView>
                  <View style={styles.composeRow}>
                    <TextInput
                      value={messageInput}
                      onChangeText={setMessageInput}
                      placeholder="Write a message"
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.input, styles.composeInput]}
                      onSubmitEditing={submitMessage}
                    />
                    <Pressable
                      onPress={submitMessage}
                      disabled={sendingMessage}
                      style={styles.sendButton}
                    >
                      {sendingMessage ? (
                        <ActivityIndicator color={colors.ivory} />
                      ) : (
                        <Ionicons name="send" size={17} color={colors.ivory} />
                      )}
                    </Pressable>
                  </View>
                </>
              ) : (
                <ScrollView style={styles.messageList}>
                  {threads.length ? (
                    threads.map((thread) => {
                      const other = thread.participantProfiles?.find(
                        (person) => person.uid !== account?.uid,
                      );
                      return (
                        <Pressable
                          key={thread.id}
                          onPress={() => setActiveThread(thread)}
                          style={styles.threadRow}
                        >
                          <ProfileAvatar
                            size={44}
                            name={thread.title || other?.name || 'Panda friend'}
                            imageUri={thread.title ? undefined : other?.avatar}
                          />
                          <View style={styles.friendCopy}>
                            <Text style={styles.friendName}>
                              {thread.title || other?.name || 'Panda group'}
                            </Text>
                            <Text style={styles.handle} numberOfLines={1}>
                              {thread.lastMessage?.text ||
                                thread.lastMessage?.venueName ||
                                'Start a conversation'}
                            </Text>
                          </View>
                          {thread.unreadBy?.includes(account?.uid || '') ? (
                            <View style={styles.unreadDot} />
                          ) : null}
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text style={styles.sheetHint}>
                      Your table invitations and friend conversations will appear here.
                    </Text>
                  )}
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    scrollContent: { paddingHorizontal: 18, gap: 20 },
    topLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    eyebrow: {
      color: c.green800,
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    iconButton: {
      alignItems: 'center',
      backgroundColor: c.card,
      borderColor: c.border,
      borderRadius: 18,
      borderWidth: 1,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    unreadDot: {
      backgroundColor: c.honey,
      borderColor: c.card,
      borderRadius: 5,
      borderWidth: 1,
      height: 10,
      position: 'absolute',
      right: 1,
      top: 1,
      width: 10,
    },
    profileRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    profileCopy: { flex: 1 },
    pageTitle: { color: c.green950, fontFamily: 'Georgia', fontSize: 29, letterSpacing: -0.8 },
    profileName: {
      color: c.foreground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14,
      marginTop: 2,
    },
    handle: { color: c.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 },
    addFriendButton: {
      alignItems: 'center',
      backgroundColor: c.green800,
      borderRadius: 16,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    addFriendText: { color: c.ivory, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    homeCard: {
      alignItems: 'center',
      backgroundColor: c.card,
      borderColor: c.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 13,
    },
    homeIcon: {
      alignItems: 'center',
      backgroundColor: c.honeySoft,
      borderRadius: 14,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    homeCopy: { flex: 1 },
    homeLabel: { color: c.goldDeep, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3 },
    homeAddress: {
      color: c.foreground,
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
    smallEditButton: {
      borderColor: c.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    smallEditText: { color: c.green800, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    mapCard: {
      backgroundColor: c.green950,
      borderRadius: 22,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      overflow: 'hidden',
      padding: 16,
    },
    mapOrb: {
      alignItems: 'center',
      backgroundColor: c.green700,
      borderRadius: 15,
      height: 45,
      justifyContent: 'center',
      width: 45,
    },
    mapCopy: { flex: 1, minWidth: 175 },
    mapEyebrow: { color: c.mint300, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3 },
    mapTitle: { color: c.ivory, fontFamily: 'Georgia', fontSize: 20, marginTop: 3 },
    mapSubtitle: {
      color: '#D2E8D8',
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      lineHeight: 16,
      marginTop: 4,
    },
    mapButton: {
      alignItems: 'center',
      backgroundColor: c.honey,
      borderRadius: 14,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      marginLeft: 57,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    mapButtonText: { color: c.green950, fontFamily: 'Inter_700Bold', fontSize: 12 },
    section: { gap: 12 },
    requestSection: { gap: 10 },
    sectionTitleRow: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: c.foreground,
      fontFamily: 'Georgia',
      fontSize: 24,
      letterSpacing: -0.5,
      marginTop: 3,
    },
    textAction: { alignItems: 'center', flexDirection: 'row', gap: 5, paddingBottom: 4 },
    textActionText: { color: c.green800, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    tableHero: { backgroundColor: c.green900, borderRadius: 23, padding: 17 },
    tableHeroTop: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    tableHeroEyebrow: {
      color: c.mint300,
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 1.5,
    },
    tableHeroTitle: { color: c.ivory, fontFamily: 'Georgia', fontSize: 22, marginTop: 5 },
    tableActions: { flexDirection: 'row', gap: 9, marginTop: 16 },
    tablePrimary: {
      alignItems: 'center',
      backgroundColor: c.honey,
      borderRadius: 14,
      flexDirection: 'row',
      gap: 5,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    tablePrimaryText: { color: c.green950, fontFamily: 'Inter_700Bold', fontSize: 12 },
    tableSecondary: {
      alignItems: 'center',
      borderColor: '#5F8D78',
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    tableSecondaryText: { color: c.ivory, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    emptyPlan: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderRadius: 17,
      borderWidth: 1,
      padding: 16,
    },
    emptyTitle: { color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    emptyText: {
      color: c.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },
    planCard: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderRadius: 18,
      borderWidth: 1,
      gap: 12,
      padding: 14,
    },
    planHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    planIcon: {
      alignItems: 'center',
      backgroundColor: c.secondary,
      borderRadius: 13,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    planCopy: { flex: 1 },
    planVenue: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 },
    planMeta: {
      color: c.mutedForeground,
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      marginTop: 3,
    },
    planParty: { color: c.green800, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 3 },
    planButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    rsvpButton: {
      backgroundColor: c.green800,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    rsvpText: { color: c.ivory, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
    rsvpStatus: {
      color: c.green800,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    declinedStatus: {
      color: c.mutedForeground,
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    outlineButton: {
      borderColor: c.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    outlineText: { color: c.foreground, fontFamily: 'Inter_500Medium', fontSize: 11 },
    uberButton: {
      alignItems: 'center',
      backgroundColor: c.secondary,
      borderRadius: 12,
      flexDirection: 'row',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    uberText: { color: c.green900, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
    uberHome: { justifyContent: 'center', paddingHorizontal: 6 },
    uberHomeText: { color: c.goldDeep, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
    cancelText: { color: c.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
    friendRail: { gap: 16, paddingVertical: 3 },
    friendBubble: { alignItems: 'center', width: 72 },
    friendBubbleName: {
      color: c.foreground,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      marginTop: 6,
      maxWidth: 72,
    },
    friendBubbleHandle: {
      color: c.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 9,
      marginTop: 2,
      maxWidth: 72,
    },
    addFriendBubble: { alignItems: 'center', width: 74 },
    addCircle: {
      alignItems: 'center',
      backgroundColor: c.card,
      borderColor: c.border,
      borderRadius: 27,
      borderStyle: 'dashed',
      borderWidth: 1,
      height: 54,
      justifyContent: 'center',
      width: 54,
    },
    pulseCard: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderRadius: 17,
      borderWidth: 1,
      paddingHorizontal: 12,
    },
    pulseRow: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 10,
      minHeight: 66,
    },
    pulsePhoto: { borderRadius: 11, height: 44, width: 44 },
    pulsePlace: { color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    pulseMeta: {
      color: c.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      marginTop: 3,
    },
    savedRail: { gap: 12, paddingRight: 4 },
    savedCard: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderRadius: 17,
      borderWidth: 1,
      overflow: 'hidden',
      paddingBottom: 10,
      width: 190,
    },
    savedPhoto: { height: 103, width: '100%' },
    savedPhotoFallback: {
      alignItems: 'center',
      backgroundColor: c.secondary,
      justifyContent: 'center',
    },
    savedName: {
      color: c.foreground,
      fontFamily: 'Inter_700Bold',
      fontSize: 13,
      marginHorizontal: 11,
      marginTop: 9,
    },
    savedMeta: {
      color: c.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      marginHorizontal: 11,
      marginTop: 3,
    },
    shareButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: c.secondary,
      borderRadius: 10,
      flexDirection: 'row',
      gap: 5,
      marginHorizontal: 11,
      marginTop: 8,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    shareText: { color: c.green900, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
    emptyInline: {
      alignItems: 'center',
      backgroundColor: c.card,
      borderColor: c.border,
      borderRadius: 17,
      borderWidth: 1,
      gap: 8,
      padding: 16,
    },
    promoCard: {
      alignItems: 'center',
      backgroundColor: c.honeySoft,
      borderColor: c.goldLine,
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 11,
      padding: 14,
    },
    promoRow: { alignItems: 'center', flexDirection: 'row', gap: 11, paddingVertical: 4 },
    promoMark: {
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 12,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    promoTitle: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 },
    promoDescription: {
      color: c.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      lineHeight: 15,
      marginTop: 3,
    },
    footerNote: {
      color: c.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      lineHeight: 15,
      textAlign: 'center',
    },
    card: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderRadius: 17,
      borderWidth: 1,
      paddingHorizontal: 12,
    },
    requestRow: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 9,
      minHeight: 62,
    },
    friendCopy: { flex: 1 },
    friendName: { color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    acceptButton: {
      backgroundColor: c.green800,
      borderRadius: 11,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    acceptText: { color: c.ivory, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
    declineButton: { alignItems: 'center', height: 34, justifyContent: 'center', width: 30 },
    modalScrim: { backgroundColor: c.overlay, flex: 1, justifyContent: 'flex-end' },
    sheetWrap: { maxHeight: '94%' },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingBottom: 28,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    tallSheet: { height: '86%' },
    messageSheet: { height: '78%' },
    sheetHandle: {
      alignSelf: 'center',
      backgroundColor: c.border,
      borderRadius: 3,
      height: 4,
      marginBottom: 16,
      width: 42,
    },
    sheetTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    sheetEyebrow: {
      color: c.green800,
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 1.4,
    },
    sheetTitle: { color: c.foreground, fontFamily: 'Georgia', fontSize: 25, marginTop: 3 },
    sheetBody: {
      color: c.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 18,
      marginTop: 7,
    },
    input: {
      backgroundColor: c.secondary,
      borderColor: c.border,
      borderRadius: 13,
      borderWidth: 1,
      color: c.foreground,
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      minHeight: 48,
      paddingHorizontal: 13,
      marginTop: 13,
    },
    sheetPrimary: {
      alignItems: 'center',
      backgroundColor: c.honey,
      borderRadius: 14,
      justifyContent: 'center',
      marginTop: 14,
      minHeight: 48,
    },
    sheetPrimaryText: { color: c.green950, fontFamily: 'Inter_700Bold', fontSize: 13 },
    disabled: { opacity: 0.65 },
    sheetCancel: { alignItems: 'center', paddingVertical: 13 },
    sheetCancelText: { color: c.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 12 },
    closeButton: {
      alignItems: 'center',
      backgroundColor: c.secondary,
      borderRadius: 17,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    searchRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 14 },
    searchInput: { flex: 1, marginTop: 0 },
    searchButton: {
      alignItems: 'center',
      backgroundColor: c.green800,
      borderRadius: 13,
      height: 48,
      justifyContent: 'center',
      width: 50,
    },
    sheetList: { marginTop: 8 },
    sheetHint: {
      color: c.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 18,
      paddingVertical: 14,
    },
    messageFriendButton: {
      alignItems: 'center',
      borderColor: c.border,
      borderRadius: 11,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    messageFriendText: { color: c.green900, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
    inputLabel: {
      color: c.green800,
      fontFamily: 'Inter_700Bold',
      fontSize: 9,
      letterSpacing: 1.2,
      marginTop: 14,
    },
    formScroll: { flexGrow: 0, marginTop: 4 },
    notesInput: { minHeight: 72, paddingTop: 12, textAlignVertical: 'top' },
    guestChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
    guestChip: {
      backgroundColor: c.secondary,
      borderColor: c.border,
      borderRadius: 15,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    guestChipSelected: { backgroundColor: c.green800, borderColor: c.green800 },
    guestChipText: { color: c.foreground, fontFamily: 'Inter_500Medium', fontSize: 11 },
    guestChipTextSelected: { color: c.ivory },
    messageList: { flex: 1, marginTop: 12 },
    messageListContent: { gap: 9, paddingVertical: 8 },
    threadRow: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 10,
      minHeight: 65,
    },
    messageBubble: {
      alignSelf: 'flex-start',
      backgroundColor: c.secondary,
      borderRadius: 16,
      maxWidth: '84%',
      padding: 11,
    },
    messageOwn: { alignSelf: 'flex-end', backgroundColor: c.green800 },
    messageOther: { borderColor: c.border, borderWidth: 1 },
    messageText: {
      color: c.foreground,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      lineHeight: 18,
    },
    messageOwnText: { color: c.ivory },
    messageLink: { color: c.goldDeep, fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 7 },
    sharedVenueCard: {
      backgroundColor: c.ivory,
      borderColor: c.border,
      borderRadius: 14,
      borderWidth: 1,
      marginTop: 10,
      overflow: 'hidden',
    },
    sharedVenueImage: { height: 118, width: '100%' },
    sharedVenueMeta: { gap: 5, padding: 10 },
    sharedVenueTitle: { color: c.green900, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    sharedVenueDetails: { color: c.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 11 },
    sharedVenueAttribution: {
      color: c.mutedForeground,
      fontFamily: 'Inter_400Regular',
      fontSize: 9,
    },
    sharedVenueButton: {
      alignItems: 'center',
      backgroundColor: c.green800,
      borderRadius: 10,
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      marginTop: 5,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    sharedVenueButtonText: { color: c.ivory, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
    composeRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingTop: 8 },
    composeInput: { flex: 1, marginTop: 0 },
    sendButton: {
      alignItems: 'center',
      backgroundColor: c.green800,
      borderRadius: 14,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
  });
}
