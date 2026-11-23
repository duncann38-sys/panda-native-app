import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PandaLogo } from '@/components/PandaLogo';
import { PandaIcon } from '@/components/PandaIcon';
import { ReserveButton } from '@/components/ReserveButton';
import { getPandaTimeLabel, getPandaTimeMode } from '@/constants/panda-time';
import { PANDA_PRODUCTION_API, PANDA_RUNTIME_API } from '@/constants/services';
import { useLiveVenues } from '@/context/live-venues';
import { useAuth } from '@/context/auth';
import { conciergeGreeting, shownConciergeVenueIds } from '@/utils/concierge-session';
import { buildPandaPersonalInstruction, isGeneralLifeConversation, isPubOnlyConciergeRequest, localDateReply, presentConciergeReplyText, wantsOpenVenues, openVenueSelection, NO_OPEN_VENUES_REPLY } from '@/utils/concierge-conversation';
import { isVerifiedTransitStation } from '@/utils/verified-transit-station';
import { conciergeChatPolish } from '@/utils/concierge-chat-polish';
import { useSandboxReservations } from '@/hooks/useSandboxReservations';
import { SandboxBookingAiEntry } from '@/components/SandboxBookingAiEntry';
import { ConciergeTypingIndicator } from '@/components/ConciergeTypingIndicator';
import { useSandboxBookingConversation } from '@/hooks/useSandboxBookingConversation';
import { SandboxConversationCard } from '@/components/SandboxConversationCard';
import { venues as pandaVenues, type Venue } from '@/data/venues';
import { classifyGooglePlace } from '@/data/venue-categories';
import { useColors } from '@/hooks/useColors';
import {
  buildSessionVenueContext,
  findExplicitSessionVenue,
  isGooglePlaceSessionVenue,
  resolveSessionVenueReference,
  type SessionVenueCard,
} from '@/utils/ai-session-context';
import {
  hasDatedOpeningEvidence,
  isNewOpeningPrompt,
} from '@/utils/ai-openings';
import { requiresCurrentLocation } from '@/utils/location-intent';
import { recordVenueActivity } from '@/utils/record-venue-activity';
import {
  buildUberEstimate,
  isUberHomeRequest,
  isUberRideRequest,
} from '@/utils/uber-estimate';
import { parsePandaMemoryCommand, parseProfilePreferences } from '@/utils/profile-preferences';
import { profilePreferenceStore } from '@/utils/profile-preferences-store';

type AiVenue = {
  id?: string;
  name?: string;
  address?: string;
  fullAddress?: string;
  type?: string;
  rating?: number;
  ratingCount?: number;
  distanceMeters?: number;
  price?: string;
  website?: string;
  menuLink?: string;
  mapsUri?: string;
  photoName?: string;
  photoAttribution?: string;
  photoCount?: number;
  phone?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  location?: { latitude?: number; longitude?: number; lat?: number; lng?: number } | null;
  driveDurationMinutes?: number;
  openNow?: boolean;
  todayHours?: string;
  nearest_station?: string;
  stopLabel?: string;
  openingSourceName?: string;
  openingSourceUrl?: string;
  openingReportedAt?: string;
  openingDate?: string;
  openingEvidence?: string;
};

type GoogleAiVenueProfile = {
  openNow: boolean | null;
  todayHours: string | null;
  googleMapsUrl: string;
  website: string | null;
  phone: string | null;
};

type Message = {
  role: 'user' | 'model';
  text: string;
  venues?: AiVenue[];
  newSelection?: boolean;
  rideRequest?: boolean;
  transit?: AiTransitContext;
  requestId?: number;
};

type SavedHomeDestination = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type AiTransitStation = {
  id: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
};

type AiRouteWalk = {
  distanceMeters: number;
  durationMinutes: number;
  polyline?: string;
};

type AiTransitStep = {
  mode: 'WALK' | 'TRANSIT';
  instruction: string;
  durationMinutes: number;
  distanceMeters: number;
  lineName: string | null;
  headsign: string | null;
  departureStop: string | null;
  arrivalStop: string | null;
  departureTime?: string;
  arrivalTime?: string;
  liveDepartureTime?: string;
  liveUpdatedAt?: string;
  departurePlatform?: string;
  polyline?: string;
};

type AiTransitContext = {
  venueId?: string;
  venueName?: string;
  venue?: AiVenue;
  originStation: AiTransitStation;
  destinationStation?: AiTransitStation;
  originWalk?: AiRouteWalk | null;
  transitRoute?: {
    durationMinutes: number;
    distanceMeters: number;
    steps: AiTransitStep[];
    updatedAt?: string;
    timingSource?: string;
    polyline?: string;
  } | null;
  venueWalk?: {
    distanceMeters: number;
    durationMinutes: number;
    polyline?: string;
  } | null;
};

type VoiceResult = {
  isFinal: boolean;
  0?: { transcript?: string };
};

type VoiceResultEvent = {
  results: {
    length: number;
    [index: number]: VoiceResult;
  };
};

type VoiceRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: VoiceResultEvent) => void) | null;
  abort?: () => void;
  start: () => void;
  stop: () => void;
};

type VoiceRecognitionConstructor = new () => VoiceRecognition;

const PANDA_AI_URL = `${PANDA_PRODUCTION_API}/api/panda-ai`;
const PANDA_AI_VENUE_LIMIT = 15;
const PANDA_AI_REQUEST_TIMEOUT_MS = 18_000;
const OPTIONAL_REQUEST_TIMEOUT_MS = 5_000;
const TRANSIT_REQUEST_TIMEOUT_MS = 9_000;
const REQUIRED_LOCATION_TIMEOUT_MS = 14_000;
const suggestions = ['Nearest station & directions', 'Open right now', 'Dinner tonight', 'Nearby bars', 'Cheap eats', 'Pint'];
const nearbyShortcutPrompts: Record<string, string> = {
  'Open right now': 'Restaurants open right now near me',
  'Nearby bars': 'Bars near me',
  'Cheap eats': 'Cheap eats near me',
  'Dinner tonight': 'Dinner tonight near me',
  Pint: 'Pubs near me',
};
const suggestionEmojis: Record<string, string> = {
  'Make me smile': '🌻',
  'Talk it through': '💭',
  'New restaurants': '🍽️',
  'Nearest station & directions': '🚇',
  'Open right now': '✨',
  'Dinner tonight': '🍽️',
  'Nearby bars': '🍸',
  'Cheap eats': '💸',
  Pint: '🍺',
};
function isNearbyShortcut(text: string) {
  return Object.values(nearbyShortcutPrompts).includes(text)
    || Object.prototype.hasOwnProperty.call(nearbyShortcutPrompts, text);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = OPTIONAL_REQUEST_TIMEOUT_MS,
  externalSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortRequest = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortRequest, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortRequest);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutValue: T) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => resolve(timeoutValue), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function isTransitQuestion(text: string) {
  return /\b(station|tube|underground|train|transport|directions?|get there|how do i get)\b/i.test(text);
}

function formatOpeningReportDate(value?: string) {
  if (!value) return 'recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function isNearestStationOnly(text: string) {
  return /\b(nearest|closest|local)\s+(?:tube|underground|train|rail)?\s*station\b/i.test(text)
    && !/\b(?:to|for)\s+[a-z0-9]/i.test(text);
}

function asksForVenueStation(text: string) {
  return /\b(?:nearest|closest|local)\s+(?:(?:tube|underground|train|rail)\s+)?station\b/i.test(text)
    || /\b(?:nearest|closest)\s+(?:tube|underground)\b/i.test(text);
}

function asksForSpecificVenueDestination(text: string) {
  return /\b(?:how\s+(?:do|can|would)\s+i\s+get\s+to|(?:get|take|guide)\s+me\s+to|directions?\s+to|route\s+to|navigate\s+to|travel\s+to)\s+(?:(?:the|a)\s+)?(?!there\b|here\b|that\b|it\b|me\b|nearest\b|station\b|tube\b)[a-z0-9][\w'&.-]*/i.test(text)
    || /\b(?:nearest|closest|local)\s+(?:(?:tube|underground|train|rail)\s+)?station\s+(?:to|for)\s+(?:(?:the|a)\s+)?(?!there\b|here\b|that\b|it\b|me\b)[a-z0-9][\w'&.-]*/i.test(text);
}

function sameSessionVenue(left: SessionVenueCard, right: SessionVenueCard) {
  if (left.id && right.id) return left.id === right.id;
  return Boolean(left.name && right.name && left.name.toLocaleLowerCase('en-GB') === right.name.toLocaleLowerCase('en-GB'));
}

function findOriginalSessionVenue(
  messages: Message[],
  target: SessionVenueCard,
  preferredVenue?: AiVenue | null,
): AiVenue {
  if (preferredVenue && sameSessionVenue(preferredVenue, target)) {
    return { ...preferredVenue, nearest_station: target.nearest_station ?? preferredVenue.nearest_station };
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const candidates = [
      ...(message.transit?.venue ? [message.transit.venue] : []),
      ...(message.venues ?? []),
    ];
    const match = candidates.find((candidate) => sameSessionVenue(candidate, target));
    if (!match) continue;
    const transit = message.transit;
    const station = target.nearest_station
      ?? (transit && transit.venueId === match.id ? transit.destinationStation?.name : undefined);
    return { ...match, ...(station ? { nearest_station: station } : {}) };
  }

  return target as AiVenue;
}

async function resolveTransitVenue(text: string, candidates: AiVenue[]) {
  const googleCandidates = candidates.filter(
    (venue) => isGooglePlaceSessionVenue(venue) && venue.name,
  );
  const currentMatch = findExplicitSessionVenue(text, googleCandidates);
  if (currentMatch.ambiguous) return null;
  if (currentMatch.venue) {
    return googleCandidates.find((venue) => sameSessionVenue(venue, currentMatch.venue!))
      ?? currentMatch.venue as AiVenue;
  }

  const catalogCandidates = [...pandaVenues]
    .filter((venue) => isGooglePlaceSessionVenue(venue))
    .map((venue) => ({
      id: venue.id,
      name: venue.name,
      type: venue.type,
      rating: Number.parseFloat(venue.rating),
      price: venue.price,
      openNow: venue.openNow,
    }));
  const catalogMatch = findExplicitSessionVenue(text, catalogCandidates);
  if (catalogMatch.ambiguous) return null;
  if (catalogMatch.venue) {
    const catalogVenue = catalogCandidates.find((venue) => sameSessionVenue(venue, catalogMatch.venue!));
    if (!catalogVenue) return null;
    return {
      ...catalogVenue,
    };
  }

  try {
    const response = await fetchWithTimeout(
      `${PANDA_RUNTIME_API}/api/partner/venues?query=${encodeURIComponent(text.slice(0, 120))}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      results?: Array<{ id: string; name: string; category: string }>;
    };
    const directoryCandidates = (payload.results ?? [])
      .filter((result) => isGooglePlaceSessionVenue(result))
      .map((result) => ({ id: result.id, name: result.name, type: result.category }));
    const directoryMatch = findExplicitSessionVenue(text, directoryCandidates);
    if (directoryMatch.ambiguous || !directoryMatch.venue) return null;
    return directoryCandidates.find((venue) => sameSessionVenue(venue, directoryMatch.venue!)) ?? null;
  } catch {
    return null;
  }
}

async function enrichAiVenue(venue: AiVenue): Promise<AiVenue> {
  const placeId = venue.id;
  if (!placeId || !isGooglePlaceSessionVenue(venue)) return venue;

  try {
    const response = await fetchWithTimeout(
      `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(placeId)}/profile?hoursVersion=1`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return venue;
    const profile = (await response.json()) as GoogleAiVenueProfile;

    return {
      ...venue,
      openNow: profile.openNow ?? venue.openNow,
      todayHours: profile.todayHours ?? venue.todayHours,
      mapsUri: profile.googleMapsUrl || venue.mapsUri,
      website: venue.website || profile.website || undefined,
      phone: profile.phone || venue.phone,
    };
  } catch {
    return venue;
  }
}

function aiVenueToVenue(venue: AiVenue): Venue | null {
  if (!venue.id || !venue.name) return null;
  const category: Venue['category'] = classifyGooglePlace({ name: venue.name, type: venue.type || '' }).primary;
  const mapsUri =
    venue.mapsUri
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name)}&query_place_id=${encodeURIComponent(venue.id)}`;

  return {
    id: venue.id,
    name: venue.name,
    neighborhood: 'Live nearby',
    category,
    type: venue.type || 'Local venue',
    distance:
      typeof venue.distanceMeters === 'number'
        ? venue.distanceMeters < 1000
          ? `${Math.round(venue.distanceMeters)} m`
          : `${(venue.distanceMeters / 1000).toFixed(1)} km`
        : 'Nearby',
    walkingTime:
      typeof venue.distanceMeters === 'number'
        ? `≈ ${Math.max(1, Math.round(venue.distanceMeters / 80))} min walk`
        : 'Directions available',
    rating: venue.rating?.toFixed(1) ?? '',
    ratingCount: 0,
    price: venue.price || '££',
    distanceMeters: venue.distanceMeters ?? 0,
    description: `Live Panda recommendation for ${venue.name}.`,
    hours: venue.todayHours || 'Live hours unavailable',
    feature: venue.type || 'Panda pick',
    fullAddress: venue.fullAddress || venue.address || venue.name,
    openNow: venue.openNow === true,
    website: venue.website || mapsUri,
    mapsUri,
    phone: venue.phone ?? '',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: venue.photoAttribution ? [venue.photoAttribution] : [],
  };
}

function approximateDrivingDistanceMeters(
  originLatitude: number,
  originLongitude: number,
  destinationLatitude: number,
  destinationLongitude: number,
): number | null {
  if (
    !Number.isFinite(originLatitude) || Math.abs(originLatitude) > 90
    || !Number.isFinite(destinationLatitude) || Math.abs(destinationLatitude) > 90
    || !Number.isFinite(originLongitude) || Math.abs(originLongitude) > 180
    || !Number.isFinite(destinationLongitude) || Math.abs(destinationLongitude) > 180
  ) return null;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(destinationLatitude - originLatitude);
  const longitudeDelta = radians(destinationLongitude - originLongitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(originLatitude))
      * Math.cos(radians(destinationLatitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  const straightLineMeters = 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  if (!Number.isFinite(straightLineMeters) || straightLineMeters <= 0 || straightLineMeters > 200_000) return null;
  return Math.round(straightLineMeters * 1.3);
}

function getPandaGreeting(date = new Date(), name = '') { return conciergeGreeting(name, date); }

export function PandaAiScreen({ embedded = false }: { embedded?: boolean }) {
  const sandboxBookings = useSandboxReservations();
  const booking = useSandboxBookingConversation(sandboxBookings);
  const timeMode = getPandaTimeMode();
  const isNight = timeMode === 'night';
  const colors = useColors(isNight ? 'dark' : undefined);
  const polish = conciergeChatPolish(colors);
  const navigation = useNavigation();
  const subscribeToFocus = React.useCallback((notify: () => void) => {
    const focus = navigation.addListener('focus', notify);
    const blur = navigation.addListener('blur', notify);
    return () => { focus(); blur(); };
  }, [navigation]);
  const isRouteFocused = React.useSyncExternalStore(subscribeToFocus, navigation.isFocused, navigation.isFocused);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coordinates, refreshLocation, liveVenues } = useLiveVenues();
  const { account } = useAuth();
  const { prompt: promptParam } = useLocalSearchParams<{ prompt?: string | string[] }>();
  const initialPrompt = Array.isArray(promptParam) ? promptParam[0]?.trim() ?? '' : promptParam?.trim() ?? '';
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: getPandaGreeting(new Date(), account?.name),
    },
  ]);
  const [pandaMemory, setPandaMemory] = useState({ enabled: false, memories: [] as string[], displayName: '' });
  const [savedHome, setSavedHome] = useState<SavedHomeDestination>({
    address: '',
    latitude: null,
    longitude: null,
  });
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryNotice, setMemoryNotice] = useState('');
  const suggestionsWithPlanner = [
    { label: 'Make me smile', prompt: 'Make me smile', planner: false, emoji: suggestionEmojis['Make me smile'] },
    { label: 'Talk it through', prompt: 'Can we talk something through?', planner: false, emoji: suggestionEmojis['Talk it through'] },
    { label: `Plan my ${getPandaTimeLabel(timeMode)}`, planner: true, emoji: '✨' },
    { label: 'New restaurants', prompt: 'New restaurants near me', planner: false, emoji: suggestionEmojis['New restaurants'] },
    ...suggestions.map((suggestion) => ({
      label: suggestion,
      planner: false,
      emoji: suggestionEmojis[suggestion] || '✨',
    })),
  ];
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const voiceRef = useRef<VoiceRecognition | null>(null);
  const voiceDraftRef = useRef('');
  const finalTranscriptRef = useRef('');
  const submittedPromptRef = useRef('');
  const requestSequenceRef = useRef(0);
  const currentRequestRef = useRef(0);
  const chatGenerationRef = useRef(0);
  const primaryPendingRef = useRef(false);
  const primaryControllerRef = useRef<AbortController | null>(null);
  const activeAiVenueRef = useRef<AiVenue | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(timer);
  }, [messages, sending]);

  useEffect(() => {
    let active = true;
    profilePreferenceStore.read(account?.uid ?? null)
      .then((stored) => {
        if (!active) return;
        const preferences = parseProfilePreferences(stored);
        setPandaMemory({
          enabled: preferences.pandaMemoryEnabled,
          memories: preferences.pandaMemories,
          displayName: preferences.displayName,
        });
        setSavedHome({
          address: preferences.homeAddress,
          latitude: preferences.homeLatitude,
          longitude: preferences.homeLongitude,
        });
      })
      .catch(() => {
        if (active) {
          setPandaMemory({ enabled: false, memories: [], displayName: '' });
          setSavedHome({ address: '', latitude: null, longitude: null });
        }
      });
    return () => { active = false; };
  }, [account?.uid, isRouteFocused]);

  useEffect(() => {
    return () => {
      voiceRef.current?.abort?.();
      currentRequestRef.current = ++requestSequenceRef.current;
      chatGenerationRef.current += 1;
      primaryControllerRef.current?.abort();
    };
  }, []);

  const sendUberHome = async (userText = 'Get me an Uber home') => {
    setDraft('');
    inputRef.current?.blur();
    setMessages((current) => [...current, { role: 'user', text: userText }]);

    if (
      !savedHome.address
      || !Number.isFinite(savedHome.latitude)
      || !Number.isFinite(savedHome.longitude)
    ) {
      setMessages((current) => [...current, {
        role: 'model',
        text: 'Set your home address in Profile first. Panda keeps it on this device and won’t send it to chat.',
      }]);
      router.push('/(tabs)/profile');
      return;
    }

    setSending(true);
    try {
      const location = await withTimeout(
        refreshLocation(true),
        REQUIRED_LOCATION_TIMEOUT_MS,
        null,
      );
      const origin = location?.coordinates;
      if (!origin) {
        setMessages((current) => [...current, {
          role: 'model',
          text: 'I couldn’t verify your current pickup location. Allow location access and try the home ride again.',
        }]);
        return;
      }

      const distanceMeters = approximateDrivingDistanceMeters(
        origin.latitude,
        origin.longitude,
        savedHome.latitude as number,
        savedHome.longitude as number,
      );
      if (!distanceMeters) {
        setMessages((current) => [...current, {
          role: 'model',
          text: 'I couldn’t calculate a safe estimate for your saved home. Check the address in Profile and try again.',
        }]);
        return;
      }

      const homeVenue: AiVenue = {
        id: 'panda-saved-home',
        name: 'Your home',
        fullAddress: savedHome.address,
        latitude: savedHome.latitude as number,
        longitude: savedHome.longitude as number,
        distanceMeters,
        type: 'Saved home',
      };
      setMessages((current) => [...current, {
        role: 'model',
        text: 'Your home address stayed on this device. This is an estimate only; Uber will show its live route and fare before you confirm.',
        venues: [homeVenue],
        rideRequest: true,
      }]);
    } catch {
      setMessages((current) => [...current, {
        role: 'model',
        text: 'I couldn’t get a fresh pickup location just now. Try again when location access is available.',
      }]);
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async (text = draft) => {
    const trimmed = text.trim();
    if (!trimmed || primaryPendingRef.current) return;
    if (booking.isBusy) return;
    const todayReply = localDateReply(trimmed);
    if (todayReply) {
      setDraft('');
      inputRef.current?.blur();
      setMessages((current) => [
        ...current,
        { role: 'user', text: trimmed },
        { role: 'model', text: todayReply },
      ]);
      return;
    }
    if (isUberHomeRequest(trimmed)) {
      await sendUberHome(trimmed);
      return;
    }
    const memoryCommand = parsePandaMemoryCommand(trimmed);
    if (memoryCommand) {
      setDraft('');
      inputRef.current?.blur();
      setMessages((current) => [...current, { role: 'user', text: trimmed }]);
      try {
        if (memoryCommand.action === 'blocked') {
          setMessages((current) => [...current, {
            role: 'model',
            text: 'I don’t save passwords, medical details, payment information or ID numbers as Panda memories. If it helps with this conversation, you can still mention it here.',
          }]);
          return;
        }
        if (memoryCommand.action === 'remember') {
          const nextMemories = [...new Set([...pandaMemory.memories, memoryCommand.memory])].slice(-20);
          const stored = await profilePreferenceStore.update(account?.uid ?? null, {
            pandaMemoryEnabled: true,
            pandaMemories: nextMemories,
          });
          setPandaMemory({
            enabled: stored.pandaMemoryEnabled,
            memories: stored.pandaMemories,
            displayName: stored.displayName,
          });
          setMessages((current) => [...current, {
            role: 'model',
            text: 'I’ll keep that in mind on this device. You can review or remove it with the bookmark button above.',
          }]);
          return;
        }
        if (memoryCommand.action === 'forget-all') {
          const stored = await profilePreferenceStore.update(account?.uid ?? null, {
            pandaMemoryEnabled: false,
            pandaMemories: [],
          });
          setPandaMemory({
            enabled: stored.pandaMemoryEnabled,
            memories: stored.pandaMemories,
            displayName: stored.displayName,
          });
          setMessages((current) => [...current, {
            role: 'model',
            text: 'Done — I’ve cleared Panda’s saved memories from this device.',
          }]);
          return;
        }
        const nextMemories = pandaMemory.memories.filter(
          (memory) => !memory.toLocaleLowerCase().includes(memoryCommand.memory.toLocaleLowerCase()),
        );
        const stored = await profilePreferenceStore.update(account?.uid ?? null, { pandaMemories: nextMemories });
        setPandaMemory({
          enabled: stored.pandaMemoryEnabled,
          memories: stored.pandaMemories,
          displayName: stored.displayName,
        });
        setMessages((current) => [...current, {
          role: 'model',
          text: nextMemories.length < pandaMemory.memories.length
            ? 'Forgotten. I’ve removed that saved detail from this device.'
            : 'I couldn’t find that saved detail. You can review everything with the bookmark button above.',
        }]);
      } catch {
        setMessages((current) => [...current, {
          role: 'model',
          text: 'I couldn’t save that securely on this device just now, so I haven’t kept it.',
        }]);
      }
      return;
    }
    if (booking.canHandle(trimmed)) {
      setDraft('');
      inputRef.current?.blur();
      const generation=chatGenerationRef.current;
      setMessages(previous=>[...previous,{role:'user',text:trimmed}]);
      setSending(true);
      try {
        const reply=await booking.handleTurn(trimmed);
        if(generation===chatGenerationRef.current&&reply)setMessages(previous=>[...previous,{role:'model',text:reply}]);
      } finally { if(generation===chatGenerationRef.current)setSending(false); }
      return;
    }

    const isNewOpeningSearch = isNewOpeningPrompt(trimmed);
    const isTransit = isTransitQuestion(trimmed);
    const isUberRequest = isUberRideRequest(trimmed);
    const sessionVenueContext = buildSessionVenueContext(messages, activeAiVenueRef.current);
    const sessionVenueResolution = resolveSessionVenueReference(trimmed, sessionVenueContext);
    const hasExplicitVenueDestination = asksForSpecificVenueDestination(trimmed);
    const activeSessionCard = sessionVenueContext.recentVenues.find(
      (venue) => venue.id && venue.id === sessionVenueContext.activeVenueId,
    ) ?? (sessionVenueContext.recentVenues.length === 1 ? sessionVenueContext.recentVenues[0] : null);
    const referencedVenue = sessionVenueResolution.venue
      ? findOriginalSessionVenue(messages, sessionVenueResolution.venue, activeAiVenueRef.current)
      : isTransit && !hasExplicitVenueDestination && activeSessionCard
        ? findOriginalSessionVenue(messages, activeSessionCard, activeAiVenueRef.current)
        : null;
    if (isTransit && sessionVenueResolution.isReference && sessionVenueResolution.ambiguous) {
      setMessages([
        ...messages,
        { role: 'user', text: trimmed },
        {
          role: 'model',
          text: 'There are a couple of fine places in our chat, and I’d rather not send you to the wrong one. Tap the venue card you mean or tell me its name, and I’ll find the nearest station.',
        },
      ]);
      setDraft('');
      return;
    }
    if (
      isTransit
      && !hasExplicitVenueDestination
      && !isNearestStationOnly(trimmed)
      && !referencedVenue
      && sessionVenueContext.recentVenues.length > 1
    ) {
      setMessages([
        ...messages,
        { role: 'user', text: trimmed },
        {
          role: 'model',
          text: 'Which venue do you mean? Tap its card or tell me the venue name, and I’ll route to the right place.',
        },
      ]);
      setDraft('');
      return;
    }
    if (isTransit && referencedVenue && !isGooglePlaceSessionVenue(referencedVenue)) {
      setMessages([
        ...messages,
        { role: 'user', text: trimmed },
        {
          role: 'model',
          text: `I’ve got ${referencedVenue.name ?? 'that venue'} in our chat, but its card is missing the Google ID needed for a proper live route check. Open the full venue card and I’ll take another look.`,
        },
      ]);
      setDraft('');
      return;
    }

    const requestId = ++requestSequenceRef.current;
    currentRequestRef.current = requestId;
    primaryPendingRef.current = true;
    const chatGeneration = chatGenerationRef.current;
    const conversation: Message[] = [
      ...messages,
      { role: 'user', text: trimmed },
      { role: 'model', requestId, text: '' },
    ];
    const needsCurrentLocation = requiresCurrentLocation(
      trimmed,
      isGeneralLifeConversation,
      isTransitQuestion,
    ) || isNewOpeningSearch;
    setMessages(conversation);
    setDraft('');
    setSending(true);

    const isCurrentRequest = () => currentRequestRef.current === requestId;
    const updateResult = (update: (message: Message) => Message) => {
      if (chatGenerationRef.current !== chatGeneration) return;
      setMessages((current) =>
        current.map((message) => (message.requestId === requestId ? update(message) : message)),
      );
    };

    try {
      let requestCoordinates = coordinates;
      if (isUberRequest || (!requestCoordinates && !isGeneralLifeConversation(trimmed))) {
        const locationResult = await withTimeout(
          refreshLocation(true),
          needsCurrentLocation ? REQUIRED_LOCATION_TIMEOUT_MS : 2_200,
          null,
        );
        if (!isCurrentRequest()) return;
        requestCoordinates = locationResult?.coordinates ?? null;
        if (needsCurrentLocation && !requestCoordinates) {
          const locationError =
            locationResult?.status === 'permission-denied'
              ? 'Panda needs location permission to find nearby places. Allow location access for Panda in your device settings, then try again.'
              : 'I couldn’t get your current location. Turn on device location services and allow Panda to use your location, then try again.';
          updateResult((message) => ({ ...message, text: locationError, venues: [] }));
          return;
        }
      }

      const controller = new AbortController();
      primaryControllerRef.current = controller;
      const response = await fetchWithTimeout(
        PANDA_AI_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            shownVenueIds: shownConciergeVenueIds(conversation),
            systemInstruction: {
              parts: [
                {
                  text: buildPandaPersonalInstruction(
                    pandaMemory.displayName || account?.name,
                    pandaMemory.enabled ? pandaMemory.memories : [],
                  ),
                },
              ],
            },
            contents: conversation.map((message) => ({
              role: message.role,
              parts: [{ text: message.text }],
            })),
            chatContext: {
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
            },
            ...(sessionVenueContext.recentVenues.length ? { sessionVenueContext } : {}),
            ...(isNewOpeningSearch
              ? {
                  newOpeningsOnly: true,
                }
              : {}),
            generationConfig: { temperature: 0.85, maxOutputTokens: 700 },
            ...(requestCoordinates
              ? {
                  location: {
                    lat: requestCoordinates.latitude,
                    lng: requestCoordinates.longitude,
                  },
                }
              : {}),
          }),
        },
        PANDA_AI_REQUEST_TIMEOUT_MS,
        controller.signal,
      );
      const data = (await response.json()) as {
        text?: string;
        venues?: AiVenue[];
        customItinerary?: boolean;
        customPubCrawl?: boolean;
        newOpeningsSearch?: boolean;
        rideRequest?: boolean;
      };
      if (!response.ok && data.newOpeningsSearch !== true) throw new Error('Panda AI request failed');
      if (!isCurrentRequest()) return;

      const openingSearch = isNewOpeningSearch || data.newOpeningsSearch === true;
      const rideRequest = isUberRequest && data.rideRequest === true;
      // Live venue results stay in this conversation; the curated local catalogue is untouched.
      // Standard searches can use the existing branded fallback card when Google has no photos.
      const pubOnly = isPubOnlyConciergeRequest(trimmed);
      const eligibleVenues = (data.venues ?? []).filter((venue) =>
        Boolean(venue.id && venue.name)
        && (!pubOnly || classifyGooglePlace({ name: venue.name || '', type: venue.type || '' }).primary === 'Pub')
        && (!isNearbyShortcut(trimmed) || (Number.isFinite(venue.distanceMeters)
          && Number(venue.distanceMeters) >= 0 && Number(venue.distanceMeters) <= 5000))
        && (!openingSearch || (data.newOpeningsSearch === true && hasDatedOpeningEvidence(venue))),
      );
      if (!data.customItinerary && !data.customPubCrawl && !data.newOpeningsSearch) {
        eligibleVenues.sort(
          (left, right) => (isNearbyShortcut(trimmed)
            ? Number(right.rating ?? 0) - Number(left.rating ?? 0)
              || Number(right.ratingCount ?? 0) - Number(left.ratingCount ?? 0) : 0)
            || Number(left.distanceMeters ?? Infinity) - Number(right.distanceMeters ?? Infinity),
        );
      }
      eligibleVenues.splice(data.newOpeningsSearch ? 20 : PANDA_AI_VENUE_LIMIT);
      const onlyOpenNow = wantsOpenVenues(trimmed);
      const selectedVenues = isNearestStationOnly(trimmed) ? [] : openVenueSelection(eligibleVenues, onlyOpenNow);
      const initialVenues = rideRequest ? selectedVenues.slice(0, 1) : selectedVenues;
      const baseReply = pubOnly && !initialVenues.length
        ? 'I couldn’t verify any pubs in the live results just now. Try a nearby area or a more specific pub search. 🍺'
        : pubOnly
          ? 'Here are pubs only — I’ve left restaurants, bars and cafés out. 🍺'
        : onlyOpenNow && !initialVenues.length && !openingSearch
        ? NO_OPEN_VENUES_REPLY
        : openingSearch && !initialVenues.length
        ? data.newOpeningsSearch === true && data.text?.trim()
          ? data.text.trim()
          : 'Panda’s source-linked opening feed isn’t ready for this search yet. I won’t substitute ordinary restaurant results.'
        : data.text?.trim() || 'I’m not sure I caught that. Try asking for a place, mood, or time of day.';
      if (referencedVenue) {
        activeAiVenueRef.current = referencedVenue;
      } else if (initialVenues.length) {
        const inferredContext = buildSessionVenueContext([
          { role: 'model', text: baseReply, venues: initialVenues },
        ]);
        activeAiVenueRef.current = inferredContext.activeVenueId
          ? inferredContext.recentVenues.find((venue) => venue.id === inferredContext.activeVenueId) ?? null
          : null;
      }

      // Show the primary answer and venue results before any optional live-data lookups.
      updateResult((message) => ({
        ...message,
        text: isTransit ? 'Checking live station and route information…' : baseReply,
        venues: initialVenues,
        rideRequest,
        newSelection: data.newOpeningsSearch === true,
      }));
      primaryPendingRef.current = false;
      setSending(false);
      primaryControllerRef.current = null;

      void Promise.all(initialVenues.map(enrichAiVenue))
        .then((enrichedVenues) => {
          const visibleVenues = openVenueSelection(enrichedVenues, onlyOpenNow);
          updateResult((message) => ({
            ...message,
            venues: visibleVenues,
            text: onlyOpenNow && !visibleVenues.length && !isTransit
              ? NO_OPEN_VENUES_REPLY
              : message.text,
          }));
        })
        .catch(() => {
          // Profile enrichment is optional; the primary venue results remain usable.
        });

      if (isTransit) {
        void (async () => {
          try {
            const currentLocation = requestCoordinates
              ? { status: 'ready' as const, coordinates: requestCoordinates }
              : await withTimeout(refreshLocation(true), 13_000, {
                  status: 'unavailable' as const,
                  coordinates: null,
                });
            if (!isCurrentRequest()) return;

            if (currentLocation.status === 'permission-denied') {
              updateResult((message) => ({
                ...message,
                text: 'Allow location access and I can find your nearest station and map the journey in Panda.',
              }));
              return;
            }
            if (!currentLocation.coordinates) {
              updateResult((message) => ({
                ...message,
                text: 'I couldn’t get your current location, so I can’t safely identify your nearest station yet.',
              }));
              return;
            }

            const { latitude, longitude } = currentLocation.coordinates;
            const venue = referencedVenue
              ?? (isNearestStationOnly(trimmed) ? null : await resolveTransitVenue(trimmed, initialVenues));
            if (!isCurrentRequest()) return;

            if (!venue && hasExplicitVenueDestination) {
              updateResult((message) => ({
                ...message,
                text: 'I couldn’t confidently match that destination to a venue. Tap the correct venue card or give me its full name, and I’ll route you there rather than guess.',
              }));
              return;
            }

            if (venue?.id && venue.name) {
              const transitResponse = await fetchWithTimeout(
                `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(venue.id)}/transit?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`,
                { headers: { Accept: 'application/json' } },
                TRANSIT_REQUEST_TIMEOUT_MS,
              );
              if (!transitResponse.ok) {
                updateResult((message) => ({
                  ...message,
                  text: `I couldn’t verify the route to ${venue.name} right now, so I won’t guess its station or journey time.`,
                }));
                return;
              }

              const liveTransit = (await transitResponse.json()) as {
                originStation: AiTransitStation;
                destinationStation: AiTransitStation;
                originWalk: AiRouteWalk | null;
                transitRoute: AiTransitContext['transitRoute'];
                venueWalk: { distanceMeters: number; durationMinutes: number } | null;
              };
              if (!isVerifiedTransitStation(liveTransit.originStation) || !isVerifiedTransitStation(liveTransit.destinationStation)) {
                updateResult((message) => ({
                  ...message,
                  text: `I couldn’t verify the route to ${venue.name} right now, so I won’t guess its station or journey time.`,
                }));
                return;
              }
              const transit: AiTransitContext = {
                venueId: venue.id,
                venueName: venue.name,
                venue: { ...venue, nearest_station: liveTransit.destinationStation.name },
                originStation: liveTransit.originStation,
                destinationStation: liveTransit.destinationStation,
                originWalk: liveTransit.originWalk,
                transitRoute: liveTransit.transitRoute,
                venueWalk: liveTransit.venueWalk,
              };
              const venueWithStation = { ...venue, nearest_station: liveTransit.destinationStation.name };
              activeAiVenueRef.current = venueWithStation;
              const walkText = liveTransit.venueWalk
                ? `Google estimates a ${liveTransit.venueWalk.durationMinutes}-minute walk from there to the venue.`
                : 'I’ll keep the final walk visible in the route panel.';
              const transitText = liveTransit.transitRoute
                ? liveTransit.transitRoute.timingSource === 'tfl_live'
                  ? `TfL live timings show about ${liveTransit.transitRoute.durationMinutes} minutes between stations.`
                  : `Google’s route estimate is about ${liveTransit.transitRoute.durationMinutes} minutes between stations.`
                : 'I can show the verified stations, but no journey time was confirmed.';
              const venueStationText = asksForVenueStation(trimmed)
                ? `For ${venue.name}, the recommended arrival station is ${liveTransit.destinationStation.name}. ${transitText} ${walkText}`
                : `To reach ${venue.name}, start at ${liveTransit.originStation.name} and get off at ${liveTransit.destinationStation.name}. ${transitText} ${walkText}`;
              updateResult((message) => ({
                ...message,
                text: venueStationText,
                venues: message.venues?.some((item) => item.id === venue.id)
                  ? message.venues.map((item) => item.id === venue.id ? venueWithStation : item)
                  : [venueWithStation, ...(message.venues ?? [])].slice(0, PANDA_AI_VENUE_LIMIT),
                transit,
              }));
              return;
            }

            const stationResponse = await fetchWithTimeout(
              `${PANDA_RUNTIME_API}/api/partner/transit/nearest?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`,
              { headers: { Accept: 'application/json' } },
              TRANSIT_REQUEST_TIMEOUT_MS,
            );
            if (!stationResponse.ok) {
              updateResult((message) => ({ ...message, text: 'I couldn’t find a live nearby station right now.' }));
              return;
            }
            const nearest = (await stationResponse.json()) as { station: AiTransitStation };
            if (!isVerifiedTransitStation(nearest.station)) {
              updateResult((message) => ({ ...message, text: 'I couldn’t find a live nearby station right now.' }));
              return;
            }
            updateResult((message) => ({
              ...message,
              text: `Your nearest station right now is ${nearest.station.name}. Tell me where you’re heading and I’ll map the journey in Panda.`,
              transit: { originStation: nearest.station },
            }));
          } catch {
            updateResult((message) => ({
              ...message,
              text: 'Live station and route information is unavailable right now. Please try again shortly.',
            }));
          }
        })();
      }
    } catch {
      if (isCurrentRequest()) {
        const requestError = 'I couldn’t reach the Panda kitchen just now. Check your connection and try again.';
        updateResult((message) => ({ ...message, text: requestError, venues: [], rideRequest: false }));
      }
    } finally {
      if (isCurrentRequest()) {
        primaryPendingRef.current = false;
        primaryControllerRef.current = null;
        setSending(false);
      }
    }
  };

  useEffect(() => {
    if (!initialPrompt || submittedPromptRef.current === initialPrompt) return;
    submittedPromptRef.current = initialPrompt;
    void sendMessage(initialPrompt);
  }, [initialPrompt]);

  const startVoiceInput = () => {
    if (sending) return;

    if (isListening) {
      voiceRef.current?.stop();
      return;
    }

    if (Platform.OS !== 'web') {
      Alert.alert(
        'Dictate to Panda',
        'You can use your keyboard’s microphone to dictate, if dictation is enabled on your phone. Review your question, then tap Send. You can also type as usual.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open keyboard', onPress: () => inputRef.current?.focus() },
        ],
      );
      return;
    }

    const speechGlobal = globalThis as typeof globalThis & {
      SpeechRecognition?: VoiceRecognitionConstructor;
      webkitSpeechRecognition?: VoiceRecognitionConstructor;
    };
    const Recognition = speechGlobal.SpeechRecognition ?? speechGlobal.webkitSpeechRecognition;

    if (!Recognition) {
      Alert.alert(
        'Voice input unavailable',
        'This browser does not support speech recognition. You can still type your question to Panda.',
      );
      return;
    }

    const recognition = new Recognition();
    voiceDraftRef.current = draft.trim();
    finalTranscriptRef.current = '';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';
    recognition.onresult = (event) => {
      let transcript = '';
      let finalTranscript = '';

      for (let index = 0; index < event.results.length; index += 1) {
        const phrase = event.results[index][0]?.transcript?.trim() ?? '';
        transcript += `${phrase} `;
        if (event.results[index].isFinal) finalTranscript += `${phrase} `;
      }

      setDraft([voiceDraftRef.current, transcript.trim()].filter(Boolean).join(' '));
      if (finalTranscript.trim()) finalTranscriptRef.current = finalTranscript.trim();
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      voiceRef.current = null;
      finalTranscriptRef.current = '';
      if (event.error !== 'aborted') {
        Alert.alert(
          'Voice input unavailable',
          event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? 'Microphone access was not allowed. Enable microphone access in your browser settings, or type your question. Your draft is still here.'
            : 'I could not hear that clearly. Please try again or type your question. Your draft is still here.',
        );
      }
    };
    recognition.onend = () => {
      setIsListening(false);
      voiceRef.current = null;
      // Leave dictation in the composer for the customer to review. Stopping
      // or denying the microphone must never submit a half-heard request.
      const spokenText = finalTranscriptRef.current.trim();
      if (spokenText) setDraft([voiceDraftRef.current, spokenText].filter(Boolean).join(' '));
      finalTranscriptRef.current = '';
    };

    voiceRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      voiceRef.current = null;
      finalTranscriptRef.current = '';
      Alert.alert('Voice input unavailable', 'Panda could not start the microphone. Your draft is unchanged; please try again or type your question.');
    }
  };

  const openAiTransitDirections = (transit: AiTransitContext) => {
    if (!transit.venueId || !transit.venueName || !transit.destinationStation) return;
    const routeVenue = aiVenueToVenue(
      transit.venue ?? { id: transit.venueId, name: transit.venueName, type: 'Live venue' },
    );
    router.push({
      pathname: '/map',
      params: {
        directionsVenueId: transit.venueId,
        directionsVenueData: routeVenue ? JSON.stringify(routeVenue) : '',
        directionsReturn: 'back',
        plannerLocation: 'Current location',
        transitOriginName: transit.originStation.name,
        transitDestinationName: transit.destinationStation.name,
        transitOriginCoordinates: `${transit.originStation.latitude},${transit.originStation.longitude}`,
        transitDestinationCoordinates: `${transit.destinationStation.latitude},${transit.destinationStation.longitude}`,
        transitOriginPolyline: transit.originWalk?.polyline ?? '',
        transitPolyline: transit.transitRoute?.polyline ?? '',
        transitDestinationPolyline: transit.venueWalk?.polyline ?? '',
        transitOriginWalkMinutes: transit.originWalk?.durationMinutes.toString() ?? '',
        transitOriginWalkDistance: transit.originWalk?.distanceMeters.toString() ?? '',
        transitDurationMinutes: transit.transitRoute?.durationMinutes.toString() ?? '',
        transitDistanceMeters: transit.transitRoute?.distanceMeters.toString() ?? '',
        transitSteps: transit.transitRoute?.steps?.length
          ? JSON.stringify(transit.transitRoute.steps)
          : '',
        transitWalkMinutes: transit.venueWalk?.durationMinutes.toString() ?? '',
        transitWalkDistance: transit.venueWalk?.distanceMeters.toString() ?? '',
        transitUpdatedAt: transit.transitRoute?.updatedAt ?? '',
      },
    });
  };

  const openAiVenue = (aiVenue: AiVenue) => {
    activeAiVenueRef.current = aiVenue;
    const venue = aiVenueToVenue(aiVenue);
    if (!venue) return;
    router.push({
      pathname: '/venue/[id]',
      params: {
        id: venue.id,
        venueData: JSON.stringify(venue),
        plannerLocation: 'Current location',
      },
    });
  };

  const openAiVenueDirections = async (aiVenue: AiVenue) => {
    activeAiVenueRef.current = aiVenue;
    const venue = aiVenueToVenue(aiVenue);
    if (!venue) return;
    recordVenueActivity('directions_click', venue);
    const locationState = coordinates
      ? { status: 'ready' as const, coordinates }
      : await refreshLocation(true);
    const currentLocation = locationState.coordinates;
    if (currentLocation) {
      const { latitude, longitude } = currentLocation;
      try {
        const transitResponse = await fetch(
          `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(venue.id)}/transit?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`,
          { headers: { Accept: 'application/json' } },
        );
        if (transitResponse.ok) {
          const liveTransit = (await transitResponse.json()) as {
            originStation: AiTransitStation;
            destinationStation: AiTransitStation;
            originWalk: AiRouteWalk | null;
            transitRoute: AiTransitContext['transitRoute'];
            venueWalk: { distanceMeters: number; durationMinutes: number } | null;
          };
          if (isVerifiedTransitStation(liveTransit.originStation) && isVerifiedTransitStation(liveTransit.destinationStation)) {
            activeAiVenueRef.current = {
              ...aiVenue,
              nearest_station: liveTransit.destinationStation.name,
            };
            openAiTransitDirections({
              venueId: venue.id,
              venueName: venue.name,
              venue: {
                ...aiVenue,
                nearest_station: liveTransit.destinationStation.name,
              },
              originStation: liveTransit.originStation,
              destinationStation: liveTransit.destinationStation,
              originWalk: liveTransit.originWalk,
              transitRoute: liveTransit.transitRoute,
              venueWalk: liveTransit.venueWalk,
            });
            return;
          }
        }
      } catch {
        // Keep the established map directions route as a safe fallback.
      }
    }
    router.push({
      pathname: '/map',
      params: {
        directionsVenueId: venue.id,
        directionsVenueData: JSON.stringify(venue),
        directionsReturn: 'back',
        plannerLocation: 'Current location',
      },
    });
  };

  const saveMemoryPreferences = async (patch: { pandaMemoryEnabled?: boolean; pandaMemories?: string[] }) => {
    try {
      const stored = await profilePreferenceStore.update(account?.uid ?? null, patch);
      setPandaMemory({
        enabled: stored.pandaMemoryEnabled,
        memories: stored.pandaMemories,
        displayName: stored.displayName,
      });
      setMemoryNotice(
        stored.pandaMemoryEnabled
          ? 'Panda will use only details you explicitly asked it to remember.'
          : 'Memory is off. Saved details stay on this device but are not used in replies.',
      );
    } catch {
      setMemoryNotice('I couldn’t update secure memory on this device.');
    }
  };

  const removePandaMemory = (memory: string) => {
    void saveMemoryPreferences({
      pandaMemories: pandaMemory.memories.filter((item) => item !== memory),
    });
  };

  const clearChat = () => {
    if(booking.isSubmitting){Alert.alert('Confirming your test booking','Please wait for the result before clearing the conversation.');return;}
    booking.reset();
    currentRequestRef.current = ++requestSequenceRef.current;
    chatGenerationRef.current += 1;
    primaryPendingRef.current = false;
    primaryControllerRef.current?.abort();
    primaryControllerRef.current = null;
    activeAiVenueRef.current = null;
    setSending(false);
    setDraft('');
    setMessages([
      {
        role: 'model',
        text: getPandaGreeting(new Date(), account?.name),
      },
    ]);
  };

  const visibleMessages = messages.filter(
    (message) => !(message.role === 'model' && message.requestId && !message.text.trim()),
  );

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={0}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, polish.header, { backgroundColor: colors.green800, paddingTop: insets.top + 8 }]}>
        {isRouteFocused ? <StatusBar style="light" /> : null}
        {embedded ? (
          <View style={styles.headerIcon} />
        ) : (
          <Pressable
            accessibilityLabel="Close Panda AI"
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerIcon, pressed && styles.headerIconPressed]}
          >
            <PandaIcon name="arrow-left" size={22} color={colors.primaryForeground} />
          </Pressable>
        )}
        <View accessible accessibilityLabel="Panda logo" accessibilityRole="image" style={[styles.pandaAvatar, { backgroundColor: colors.ivory, borderColor: colors.goldLine }]}>
          <PandaLogo size={36} />
        </View>
        <View accessible accessibilityRole="header" accessibilityLabel="Panda AI, Your life concierge" style={styles.headerCopy}>
          <Text numberOfLines={1} style={[styles.headerTitle, polish.headerTitle, styles.headerTitleRefined, { color: colors.primaryForeground }]}>Panda AI</Text>
          <Text numberOfLines={1} style={[styles.headerSubtitle, polish.headerSubtitle, styles.headerSubtitleRefined, { color: colors.mint300 }]}>Your life concierge</Text>
        </View>
        <Pressable
          accessibilityLabel={`Manage Panda memories${pandaMemory.memories.length ? `, ${pandaMemory.memories.length} saved` : ''}`}
          accessibilityHint="Review, turn off or remove details Panda remembers"
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => { setMemoryNotice(''); setMemoryOpen(true); }}
          style={({ pressed }) => [styles.headerIcon, pressed && styles.headerIconPressed]}
        >
          <Feather name="bookmark" size={19} color={colors.primaryForeground} />
        </Pressable>
        <Pressable
          accessibilityLabel="Clear Panda AI chat"
          accessibilityHint="Removes the current conversation"
          accessibilityRole="button"
          hitSlop={6}
          onPress={clearChat}
          style={({ pressed }) => [styles.headerIcon, pressed && styles.headerIconPressed]}
        >
          <PandaIcon name="trash" size={20} color={colors.primaryForeground} />
        </Pressable>
      </View>

      <Modal
        animationType="slide"
        transparent
        visible={memoryOpen}
        onRequestClose={() => setMemoryOpen(false)}
      >
        <View style={styles.memoryOverlay}>
          <Pressable
            accessibilityLabel="Close Panda memory settings"
            style={StyleSheet.absoluteFill}
            onPress={() => setMemoryOpen(false)}
          />
          <View style={[styles.memorySheet, { backgroundColor: colors.ivory }]}>
            <View style={styles.memorySheetHeader}>
              <View style={styles.memoryTitleGroup}>
                <Text style={[styles.memoryEyebrow, { color: colors.green700 }]}>PRIVATE BY DESIGN</Text>
                <Text style={[styles.memoryTitle, { color: colors.green950 }]}>Panda remembers</Text>
              </View>
              <Pressable
                accessibilityLabel="Close memory settings"
                accessibilityRole="button"
                onPress={() => setMemoryOpen(false)}
                style={[styles.memoryClose, { backgroundColor: colors.mint100 }]}
              >
                <Feather name="x" size={19} color={colors.green900} />
              </Pressable>
            </View>
            <Text style={[styles.memoryDescription, { color: colors.green800 }]}>
              Panda saves a detail only when you say “remember”. It stays in SecureStore on this device; it is not synced to your account.
            </Text>
            <View style={[styles.memoryToggleRow, { borderColor: colors.goldLine }]}>
              <View style={styles.memoryToggleCopy}>
                <Text style={[styles.memoryToggleTitle, { color: colors.green950 }]}>Use saved details</Text>
                <Text style={[styles.memoryToggleSubtitle, { color: colors.green700 }]}>
                  {pandaMemory.enabled ? 'Personalise replies when relevant' : 'Paused — nothing is used in replies'}
                </Text>
              </View>
              <Switch
                accessibilityLabel="Use Panda saved memories"
                value={pandaMemory.enabled}
                onValueChange={(enabled) => void saveMemoryPreferences({ pandaMemoryEnabled: enabled })}
                trackColor={{ false: '#C8D6CC', true: colors.green700 }}
                thumbColor={colors.ivory}
              />
            </View>
            {memoryNotice ? (
              <Text accessibilityLiveRegion="polite" style={[styles.memoryNotice, { color: colors.green700 }]}>
                {memoryNotice}
              </Text>
            ) : null}
            <ScrollView style={styles.memoryList} showsVerticalScrollIndicator={false}>
              {pandaMemory.memories.length ? pandaMemory.memories.map((memory) => (
                <View key={memory} style={[styles.memoryItem, { backgroundColor: colors.mint100 }]}>
                  <Text style={[styles.memoryItemText, { color: colors.green950 }]}>{memory}</Text>
                  <Pressable
                    accessibilityLabel={`Forget ${memory}`}
                    accessibilityRole="button"
                    onPress={() => removePandaMemory(memory)}
                    style={styles.memoryRemove}
                  >
                    <Feather name="x-circle" size={19} color={colors.green700} />
                  </Pressable>
                </View>
              )) : (
                <View style={[styles.memoryEmpty, { backgroundColor: colors.mint100 }]}>
                  <Text style={styles.memoryEmptyEmoji}>🌱</Text>
                  <Text style={[styles.memoryEmptyTitle, { color: colors.green950 }]}>Nothing saved yet</Text>
                  <Text style={[styles.memoryEmptyCopy, { color: colors.green700 }]}>
                    Try “Remember that I love live jazz” or “Remember my birthday is 12 May”.
                  </Text>
                </View>
              )}
            </ScrollView>
            {pandaMemory.memories.length ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void saveMemoryPreferences({ pandaMemoryEnabled: false, pandaMemories: [] })}
                style={[styles.memoryClearButton, { borderColor: colors.goldLine }]}
              >
                <Feather name="trash-2" size={15} color={colors.green700} />
                <Text style={[styles.memoryClearText, { color: colors.green700 }]}>Clear all saved details</Text>
              </Pressable>
            ) : null}
            <Text style={[styles.memoryPrivacyNote, { color: colors.green700 }]}>
              Don’t save passwords, medical details, payment information or ID numbers.
            </Text>
          </View>
        </View>
      </Modal>

      <SandboxBookingAiEntry enabled={sandboxBookings.capabilities.data?.enabled === true}
        onPress={() => void sendMessage('Book a table at OpenTable Sandbox — 264001')} />
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={[styles.messages, { paddingBottom: 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {visibleMessages.map((message, index) => (
          <View key={`${message.role}-${index}`} style={[styles.messageRow, polish.messageRow, message.role === 'user' && styles.userRow]}>
            {message.role === 'model' && visibleMessages[index - 1]?.role !== 'model' ? (
              <Text style={[polish.speaker, { color: isNight ? colors.goldLine : colors.green700 }]}>Panda</Text>
            ) : null}
            <View
              style={[
                styles.bubble, polish.bubble,
                message.role === 'user' ? polish.userBubble : polish.modelBubble,
                {
                  borderColor: message.role === 'user' ? 'transparent' : isNight ? colors.border : colors.goldLine,
                   backgroundColor: message.role === 'user' ? (isNight ? colors.gold : colors.green600) : colors.card,
                  borderBottomRightRadius: message.role === 'user' ? 7 : 20,
                  borderBottomLeftRadius: message.role === 'model' ? 7 : 20,
                },
              ]}
            >
               <Text
                 style={[
                   styles.bubbleText, polish.bubbleText,
                   { color: message.role === 'user' && isNight ? colors.accentForeground : message.role === 'user' ? colors.primaryForeground : colors.foreground },
                 ]}
               >
                 {presentConciergeReplyText(message.text)}
              </Text>
            </View>
            {message.role === 'model' && message.rideRequest && message.venues?.length ? (
              <UberJourneyCard venue={message.venues[0]} colors={colors} />
            ) : message.venues?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.results}>
                {message.venues.slice(0, message.newSelection ? 20 : PANDA_AI_VENUE_LIMIT).map((venue, venueIndex) => {
                  const liveMatch = liveVenues.find((candidate) => candidate.id === venue.id);
                  const cardVenue: AiVenue = {
                    ...venue,
                    latitude:
                      venue.latitude
                      ?? venue.location?.latitude
                      ?? venue.location?.lat
                      ?? venue.lat
                      ?? liveMatch?.latitude,
                    longitude:
                      venue.longitude
                      ?? venue.location?.longitude
                      ?? venue.location?.lng
                      ?? venue.lng
                      ?? liveMatch?.longitude,
                    distanceMeters:
                      typeof venue.distanceMeters === 'number'
                      && Number.isFinite(venue.distanceMeters)
                      && venue.distanceMeters > 0
                        ? venue.distanceMeters
                        : liveMatch?.distanceMeters ?? venue.distanceMeters,
                  };

                  return (
                    <AiVenueCard
                      key={`${venue.id ?? venue.name}-${venueIndex}`}
                      venue={cardVenue}
                      colors={colors}
                      onDirections={() => void openAiVenueDirections(venue)}
                      onEvidence={() => {
                        if (!venue.openingSourceUrl) return;
                        void Linking.openURL(venue.openingSourceUrl).catch(() =>
                          Alert.alert('Opening source', 'This source link could not be opened right now.'),
                        );
                      }}
                      onMenu={() => {
                        const routeVenue = aiVenueToVenue(venue);
                        if (!routeVenue) return;
                        router.push({
                          pathname: '/venue/[id]/menu',
                          params: {
                            id: routeVenue.id,
                            venueData: JSON.stringify(routeVenue),
                            pageUrl: venue.menuLink || venue.website || routeVenue.website,
                          },
                        });
                      }}
                      onOpen={() => openAiVenue(venue)}
                    />
                  );
                })}
              </ScrollView>
            ) : null}
            {message.transit ? (
              <AiTransitCard
                colors={colors}
                context={message.transit}
                onDirections={() => openAiTransitDirections(message.transit as AiTransitContext)}
              />
            ) : null}
          </View>
        ))}
        <SandboxConversationCard state={booking.state} onChooseTime={time=>void booking.chooseTime(time)}
          onGuestChange={booking.setGuest} onReview={booking.reviewGuest} onConfirm={()=>void booking.confirm()}
          onEdit={booking.editGuest} onRefresh={()=>void booking.refresh()} onHistory={()=>void booking.checkHistory()} />
        {sending ? (
          <View style={styles.messageRow}>
            <ConciergeTypingIndicator
              dotColor={isNight ? colors.goldLine : colors.green600}
              labelColor={colors.mutedForeground}
              backgroundColor={colors.card}
              borderColor={isNight ? colors.border : colors.goldLine}
            />
          </View>
        ) : null}
      </ScrollView>

      <ScrollView
        horizontal
        style={styles.suggestionRail}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.suggestions, { paddingBottom: 7 }]}
        keyboardShouldPersistTaps="handled"
      >
        {suggestionsWithPlanner.map((suggestion) => (
          <Pressable
            key={suggestion.label}
            accessibilityRole="button"
            accessibilityLabel={suggestion.planner ? `Plan my ${timeMode}` : suggestion.label}
            onPress={() =>
              suggestion.planner
                ? router.push({ pathname: '/', params: { openPlanner: timeMode } })
                : sendMessage('prompt' in suggestion ? suggestion.prompt : nearbyShortcutPrompts[suggestion.label] ?? suggestion.label)
            }
            style={({ pressed }) => [
              styles.suggestion, polish.suggestion,
              {
                backgroundColor: suggestion.planner ? colors.gold : colors.card,
                borderColor: suggestion.planner ? colors.goldLine : colors.border,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.suggestionText, polish.suggestionText, { color: suggestion.planner ? colors.accentForeground : colors.foreground }]}>
              {suggestion.emoji} {suggestion.label}
            </Text>
          </Pressable>
        ))}
        <UberHomeSuggestion
          hasHome={Boolean(savedHome.address && savedHome.latitude !== null && savedHome.longitude !== null)}
          colors={colors}
          onPress={() => void sendUberHome()}
        />
      </ScrollView>

      <View
        style={[
          styles.composer, polish.composer,
          {
             backgroundColor: isNight ? colors.input : colors.background,
            borderTopColor: colors.border,
            marginBottom:
              embedded && Platform.OS === 'android'
                ? 78 + Math.max(insets.bottom, 24)
                : 0,
            paddingBottom: embedded ? 12 : Math.max(12, insets.bottom + 8),
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          accessibilityLabel="Ask Panda a question"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => sendMessage()}
          placeholder="What’s on your mind?"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="send"
           style={[
             styles.input, polish.input,
             { backgroundColor: isNight ? colors.green950 : colors.card, borderColor: colors.border, color: colors.foreground },
           ]}
        />
        <Pressable
          accessibilityLabel={isListening ? 'Stop listening to Panda' : Platform.OS === 'web' ? 'Talk to Panda' : 'Use keyboard dictation to talk to Panda'}
          accessibilityRole="button"
          disabled={sending}
          onPress={startVoiceInput}
          style={({ pressed }) => [
            styles.voiceButton,
            { backgroundColor: isListening ? colors.green900 : colors.gold },
            pressed && styles.pressed,
          ]}
        >
          <PandaIcon
            name={isListening ? 'mic-off' : 'mic'}
            size={19}
            color={isListening ? colors.primaryForeground : colors.green950}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Send message to Panda"
          accessibilityRole="button"
          disabled={!draft.trim() || sending}
          onPress={() => sendMessage()}
          style={({ pressed }) => [
            styles.send,
            {
              backgroundColor: isNight ? colors.gold : colors.green900,
              borderColor: isNight ? colors.goldLine : colors.green700,
              borderWidth: 1,
              opacity: draft.trim() && !sending ? 1 : 0.46,
            },
            pressed && styles.pressed,
          ]}
        >
          <PandaIcon
            name="send"
            size={20}
            color={isNight ? colors.green950 : colors.primaryForeground}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function PandaAiRoute() {
  return <PandaAiScreen />;
}

function UberHomeSuggestion({
  hasHome,
  colors,
  onPress,
}: {
  hasHome: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hasHome ? 'Get an Uber home' : 'Set your home address for Uber'}
      accessibilityHint={hasHome ? 'Uses your saved home privately on this device' : 'Opens Profile to add your home address'}
      onPress={onPress}
      testID="panda-ai-uber-home-shortcut"
      style={({ pressed }) => [
        styles.suggestion,
        {
          backgroundColor: colors.green950,
          borderColor: colors.green700,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
    >
      <Text style={[styles.suggestionText, { color: colors.primaryForeground }]}>
        🏠 {hasHome ? 'Uber home' : 'Set home'}
      </Text>
    </Pressable>
  );
}

function UberJourneyCard({
  venue,
  colors,
}: {
  venue: AiVenue;
  colors: ReturnType<typeof useColors>;
}) {
  const latitude = venue.latitude ?? venue.location?.latitude ?? venue.location?.lat ?? venue.lat;
  const longitude = venue.longitude ?? venue.location?.longitude ?? venue.location?.lng ?? venue.lng;
  const rideEstimate = buildUberEstimate({
    latitude,
    longitude,
    distanceMeters: venue.distanceMeters,
    driveDurationMinutes: venue.driveDurationMinutes,
    venueName: venue.name ?? 'Panda destination',
  });
  const openUber = () => {
    if (!rideEstimate) return;
    void Linking.openURL(rideEstimate.deepLink).catch(() =>
      Alert.alert('Uber unavailable', 'Panda could not open Uber. No ride has been booked.'),
    );
  };

  return (
    <View
      accessibilityLabel={`Panda ride estimate to ${venue.name ?? 'your destination'}`}
      style={[
        styles.uberJourneyCard,
        { backgroundColor: colors.green950, borderColor: colors.green700, shadowColor: colors.green950 },
      ]}
    >
      <View style={styles.uberJourneyHeader}>
        <View style={[styles.uberIconWrap, { backgroundColor: colors.gold }]}>
          <Feather name="navigation" size={17} color={colors.green950} />
        </View>
        <View style={styles.uberCopy}>
          <Text style={[styles.uberJourneyEyebrow, { color: colors.mint300 }]}>PANDA RIDE · ESTIMATE ONLY</Text>
          <Text style={[styles.uberJourneyTitle, { color: colors.primaryForeground }]} numberOfLines={1}>
            Destination ready
          </Text>
        </View>
        <Text style={styles.uberJourneyCar}>🚗</Text>
      </View>

      <View style={[styles.uberJourneyDestination, { backgroundColor: colors.green900, borderColor: colors.green700 }]}>
        <Text style={[styles.uberJourneyEyebrow, { color: colors.mint300 }]}>FROM · YOUR CURRENT LOCATION</Text>
        <View style={styles.uberJourneyRoute}>
          <View style={[styles.uberJourneyDot, { backgroundColor: colors.mint300 }]} />
          <View style={[styles.uberJourneyLine, { backgroundColor: colors.green600 }]} />
          <View style={[styles.uberJourneyDot, { backgroundColor: colors.gold }]} />
          <View style={styles.uberJourneyDestinationCopy}>
            <Text style={[styles.uberJourneyEyebrow, { color: colors.mint300 }]}>TO</Text>
            <Text style={[styles.uberJourneyTitle, { color: colors.primaryForeground }]} numberOfLines={1}>
              {venue.name ?? 'Your destination'}
            </Text>
            {venue.fullAddress || venue.address ? (
              <Text style={[styles.uberJourneyAddress, { color: colors.mint100 }]} numberOfLines={2}>
                {venue.fullAddress || venue.address}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {rideEstimate ? (
        <View style={styles.uberJourneyMetrics}>
          <View style={[styles.uberJourneyMetric, { backgroundColor: colors.green900, borderColor: colors.green700 }]}>
            <Text style={[styles.uberJourneyEyebrow, { color: colors.mint300 }]}>ESTIMATED DRIVE</Text>
            <Text style={[styles.uberJourneyMetricValue, { color: colors.primaryForeground }]}>
              ~{rideEstimate.minutes} min
            </Text>
          </View>
          <View style={[styles.uberJourneyMetric, { backgroundColor: colors.green900, borderColor: colors.green700 }]}>
            <Text style={[styles.uberJourneyEyebrow, { color: colors.mint300 }]}>PANDA ESTIMATE</Text>
            <Text style={[styles.uberJourneyMetricValue, { color: colors.gold }]}>
              £{rideEstimate.minFare}–£{rideEstimate.maxFare}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.uberJourneyAddress, { color: colors.mint100 }]}>
          I couldn’t verify enough route detail for a fare estimate. Uber will show its live fare before you confirm.
        </Text>
      )}
      {rideEstimate?.peakSurcharge ? (
        <Text style={[styles.uberJourneyPeak, { color: colors.mint100 }]}>
          Includes a £5 estimated peak-time uplift
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open Uber for ${venue.name ?? 'your destination'}`}
        accessibilityHint="Uber will show the live fare. No ride is booked until you confirm there."
        disabled={!rideEstimate}
        onPress={openUber}
        style={({ pressed }) => [
          styles.uberJourneyAction,
          { backgroundColor: colors.gold, opacity: !rideEstimate ? 0.55 : pressed ? 0.88 : 1 },
        ]}
      >
        <Text style={[styles.uberJourneyActionText, { color: colors.green950 }]}>
          Open Uber · check live fare
        </Text>
        <Feather name="arrow-up-right" size={18} color={colors.green950} />
      </Pressable>
      <Text style={[styles.uberJourneyFooter, { color: colors.mint100 }]}>
        Indicative only · Uber confirms the live route and fare · No ride booked
      </Text>
    </View>
  );
}

function AiVenueCard({
  venue,
  colors,
  onDirections,
  onEvidence,
  onMenu,
  onOpen,
}: {
  venue: AiVenue;
  colors: ReturnType<typeof useColors>;
  onDirections: () => void;
  onEvidence: () => void;
  onMenu: () => void;
  onOpen: () => void;
}) {
  const reservationVenue = aiVenueToVenue(venue);
  const scale = useSharedValue(1);
  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const photoUri = venue.photoName
    ? `${PANDA_PRODUCTION_API}/api/place-photo?name=${encodeURIComponent(venue.photoName)}&max=500`
    : null;
  const distanceMeters =
    typeof venue.distanceMeters === 'number'
    && Number.isFinite(venue.distanceMeters)
    && venue.distanceMeters > 0
      ? venue.distanceMeters
      : null;
  const distance =
    distanceMeters !== null
      ? distanceMeters < 1000
        ? `${Math.round(distanceMeters)} m`
        : `${(distanceMeters / 1000).toFixed(1)} km`
      : null;
  const openingText = venue.todayHours
    ? `${venue.openNow === true ? 'Open now' : venue.openNow === false ? 'Closed' : 'Today'} · ${venue.todayHours}`
    : venue.openNow === true
      ? 'Open now'
      : venue.openNow === false
        ? 'Closed'
        : null;
  const phoneNumber = venue.phone?.trim();
  const rideEstimate = buildUberEstimate({
    latitude: venue.latitude,
    longitude: venue.longitude,
    distanceMeters,
    driveDurationMinutes: venue.driveDurationMinutes,
    venueName: venue.name ?? 'Panda venue',
  });
  const callVenue = () => {
    if (!phoneNumber) return;
    const dialableNumber = phoneNumber.replace(/[^\d+]/g, '');
    if (!dialableNumber) {
      Alert.alert('Number unavailable', 'Panda could not prepare this venue’s phone number.');
      return;
    }
    const activityVenue = aiVenueToVenue(venue);
    if (activityVenue) void recordVenueActivity('call_click', activityVenue);
    void Linking.openURL(`tel:${dialableNumber}`).catch(() => {
      Alert.alert('Could not open the phone app', 'Please try calling this venue again.');
    });
  };
  const openUber = () => {
    if (!rideEstimate) return;
    void Linking.openURL(rideEstimate.deepLink).catch(() =>
      Alert.alert('Uber unavailable', 'Panda could not open Uber. You can still use Directions.'),
    );
  };

  return (
    <Animated.View
      style={[
        styles.resultCardShell,
        { shadowColor: colors.green950 },
        animatedCardStyle,
      ]}
    >
      <View
        style={[
          styles.resultCardSurface,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Pressable
          accessibilityLabel={`Open ${venue.name ?? 'Panda recommendation'}`}
          accessibilityHint="Opens live venue details"
          accessibilityRole="button"
          onPress={onOpen}
          onPressIn={() => {
            scale.value = withSpring(0.985, { damping: 19, stiffness: 260 });
          }}
          onPressOut={() => {
            scale.value = withSpring(1, { damping: 17, stiffness: 220 });
          }}
        >
          <View style={styles.resultHero}>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                contentFit="cover"
                transition={320}
                accessibilityLabel={`${venue.name ?? 'Venue'} photo`}
                style={StyleSheet.absoluteFillObject}
              />
            ) : (
              <View style={[styles.resultPhotoFallback, { backgroundColor: colors.secondary }]}>
                <PandaLogo size={54} />
              </View>
            )}
            <LinearGradient
              pointerEvents="none"
              colors={['transparent', colors.overlay, colors.photoOverlay]}
              locations={[0, 0.54, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.photoHalo, { borderColor: 'rgba(255,255,255,0.18)' }]} />
            <View style={styles.photoBadgeRow}>
              <BlurView intensity={26} tint="dark" style={styles.photoGlassBadge}>
                <Feather name="map-pin" size={11} color={colors.photoCredit} />
                <Text numberOfLines={1} style={[styles.photoBadgeText, { color: colors.photoCredit }]}>
                  {venue.type ?? 'Panda pick'}
                </Text>
              </BlurView>
              {typeof venue.openNow === 'boolean' ? (
                <View
                  style={[
                    styles.openBadge,
                    {
                      backgroundColor: venue.openNow ? colors.openBackground : colors.closedBackground,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.openDot,
                      { backgroundColor: venue.openNow ? colors.openForeground : colors.closedForeground },
                    ]}
                  />
                  <Text
                    style={[
                      styles.openBadgeText,
                      { color: venue.openNow ? colors.openForeground : colors.closedForeground },
                    ]}
                  >
                    {venue.openNow ? 'Open now' : 'Closed'}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.photoTitleBlock}>
              <Text numberOfLines={2} style={[styles.resultName, { color: colors.photoCredit }]}>
                {venue.name ?? 'Panda pick'}
              </Text>
              <View style={styles.photoDistanceRow}>
                <Feather name="map-pin" size={11} color={colors.photoCredit} />
                <Text numberOfLines={1} style={[styles.photoDistanceText, { color: colors.photoCredit }]}>
                  {distance ?? 'Nearby'}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
        <View style={styles.resultBody}>
          <View style={styles.resultMetaRow}>
            {hasDatedOpeningEvidence(venue) ? (
              <View style={[styles.resultMetaChip, { backgroundColor: colors.mint100, borderColor: colors.border }]}>
                <Text style={[styles.resultMetaChipText, { color: colors.green700 }]}>NEW · REPORTED OPENING</Text>
              </View>
            ) : null}
            {typeof venue.rating === 'number' ? (
              <View style={[styles.resultMetaChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="star" size={12} color={colors.goldDeep} />
                <Text style={[styles.resultMetaChipText, { color: colors.foreground }]}>
                  {venue.rating.toFixed(1)}
                </Text>
              </View>
            ) : null}
            {venue.price ? (
              <View style={[styles.resultMetaChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.resultMetaChipText, { color: colors.foreground }]}>
                  {venue.price}
                </Text>
              </View>
            ) : null}
            {venue.stopLabel ? (
              <View style={[styles.resultMetaChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="map-pin" size={11} color={colors.green700} />
                <Text numberOfLines={1} style={[styles.resultMetaChipText, { color: colors.foreground }]}>
                  {venue.stopLabel}
                </Text>
              </View>
            ) : null}
          </View>
          {venue.openingSourceName && venue.openingSourceUrl ? (
            <Pressable
              accessibilityLabel={`Read the opening report from ${venue.openingSourceName}`}
              accessibilityRole="link"
              onPress={onEvidence}
              style={styles.resultSourceLink}
            >
              <Feather name="file-text" size={11} color={colors.honeyInk} />
              <Text numberOfLines={1} style={[styles.resultStopLabel, { color: colors.honeyInk }]}>
                OPENING REPORTED · {formatOpeningReportDate(venue.openingReportedAt)} · {venue.openingSourceName}
              </Text>
            </Pressable>
          ) : null}
          {openingText ? (
            <View style={[styles.resultHours, { backgroundColor: colors.honeySoft, borderColor: colors.goldLine }]}>
              <PandaIcon name="clock" size={12} color={colors.honeyInk} />
              <Text numberOfLines={2} style={[styles.resultHoursText, { color: colors.honeyInk }]}>
                {openingText}
              </Text>
            </View>
          ) : null}
          {rideEstimate ? (
            <Pressable
              accessibilityLabel={`Open Uber for ${venue.name ?? 'this venue'}. ${rideEstimate.label}`}
              accessibilityHint="Indicative local estimate only; Uber will show the live fare before you confirm."
              accessibilityRole="button"
              onPress={openUber}
              testID={`panda-ai-uber-${venue.id ?? 'venue'}`}
              style={({ pressed }) => [
                styles.uberEstimateButton,
                {
                  backgroundColor: colors.green950,
                  borderColor: colors.green700,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <View style={[styles.uberIconWrap, { backgroundColor: colors.green800 }]}>
                <Feather name="navigation" size={15} color={colors.primaryForeground} />
              </View>
              <View style={styles.uberCopy}>
                <Text style={[styles.uberEyebrow, { color: colors.mint300 }]}>UBER · LOCAL ESTIMATE</Text>
                <Text style={[styles.uberFare, { color: colors.primaryForeground }]}>
                  {rideEstimate.label}
                </Text>
                <Text style={[styles.uberDisclaimer, { color: colors.mint100 }]}>
                  Indicative only · Uber shows the live fare
                </Text>
              </View>
              <Feather name="arrow-up-right" size={17} color={colors.mint300} />
            </Pressable>
          ) : null}
          <View style={styles.resultActions}>
            {reservationVenue ? <ReserveButton venue={reservationVenue} activitySurface="panda_ai" compact /> : null}
            <Pressable
              accessibilityLabel={`View details for ${venue.name ?? 'this venue'}`}
              accessibilityRole="button"
              onPress={onOpen}
              testID={`panda-ai-open-venue-${venue.id ?? 'venue'}`}
              style={[styles.resultSecondaryAction, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            >
              <PandaIcon name="map-pin" size={12} color={colors.green700} />
              <Text style={[styles.resultActionText, { color: colors.green700 }]}>View venue</Text>
            </Pressable>
            {venue.mapsUri ? (
              <Pressable
                accessibilityLabel={`Directions to ${venue.name ?? 'venue'}`}
                accessibilityRole="button"
                onPress={onDirections}
                style={[styles.resultPrimaryAction, { backgroundColor: colors.gold, borderColor: colors.goldLine }]}
              >
                <PandaIcon name="navigate" size={12} color="#171006" />
                <Text style={[styles.resultActionText, styles.embossedGoldText]}>Directions</Text>
              </Pressable>
            ) : null}
            {venue.website || venue.menuLink ? (
              <Pressable
                accessibilityRole="button"
                onPress={onMenu}
                style={[styles.resultSecondaryAction, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name="book-open" size={12} color={colors.green700} />
                <Text style={[styles.resultActionText, { color: colors.green700 }]}>{venue.menuLink && venue.menuLink !== venue.website ? 'Menu' : 'Website'}</Text>
              </Pressable>
            ) : null}
            {phoneNumber ? (
              <Pressable
                accessibilityLabel={`Call ${venue.name ?? 'venue'}`}
                accessibilityRole="button"
                onPress={callVenue}
                style={[styles.resultSecondaryAction, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name="phone" size={12} color={colors.green700} />
                <Text style={[styles.resultActionText, { color: colors.green700 }]}>Call</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function AiTransitCard({
  colors,
  context,
  onDirections,
}: {
  colors: ReturnType<typeof useColors>;
  context: AiTransitContext;
  onDirections: () => void;
}) {
  const hasRoute = Boolean(context.venueId && context.venueName && context.destinationStation);
  const walkLabel = context.venueWalk
    ? `${context.venueWalk.durationMinutes} min walk · ${
        context.venueWalk.distanceMeters < 1000
          ? `${Math.round(context.venueWalk.distanceMeters)} m`
          : `${(context.venueWalk.distanceMeters / 1000).toFixed(1)} km`
      }`
    : null;
  const routeLabel = context.transitRoute
    ? `${context.transitRoute.durationMinutes} min by public transport · ${context.transitRoute.steps.length} live steps`
    : null;

  return (
    <View style={[styles.aiTransitCard, { backgroundColor: colors.card, borderColor: colors.goldLine }]}>
      <View style={styles.aiTransitHeader}>
        <View style={[styles.aiTransitIcon, { backgroundColor: colors.mint100 }]}>
          <PandaIcon name="map" size={15} color={colors.green700} />
        </View>
        <View style={styles.aiTransitHeaderCopy}>
          <Text style={[styles.aiTransitEyebrow, { color: colors.green700 }]}>LIVE STATION ANSWER</Text>
          <Text style={[styles.aiTransitTitle, { color: colors.foreground }]}>From your current location</Text>
        </View>
      </View>

      <View style={styles.aiTransitPoint}>
        <Text style={styles.aiTransitEmoji}>📍</Text>
        <View style={styles.aiTransitPointCopy}>
          <Text style={[styles.aiTransitLabel, { color: colors.mutedForeground }]}>YOUR NEAREST STATION</Text>
          <Text style={[styles.aiTransitName, { color: colors.foreground }]}>{context.originStation.name}</Text>
        </View>
      </View>

      {context.destinationStation ? (
        <>
          <View style={[styles.aiTransitLine, { backgroundColor: colors.goldLine }]} />
          <View style={styles.aiTransitPoint}>
            <Text style={styles.aiTransitEmoji}>🎯</Text>
            <View style={styles.aiTransitPointCopy}>
              <Text style={[styles.aiTransitLabel, { color: colors.mutedForeground }]}>
                VENUE’S NEAREST STATION
              </Text>
              <Text style={[styles.aiTransitName, { color: colors.foreground }]}>
                {context.destinationStation.name}
              </Text>
              {walkLabel ? <Text style={[styles.aiTransitWalk, { color: colors.green700 }]}>{walkLabel}</Text> : null}
            </View>
          </View>
        </>
      ) : null}

      {routeLabel ? (
        <View style={[styles.aiTransitSummary, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <PandaIcon name="navigate" size={14} color={colors.green700} />
          <Text style={[styles.aiTransitSummaryText, { color: colors.foreground }]}>{routeLabel}</Text>
        </View>
      ) : null}

      {hasRoute ? (
        <Pressable
          accessibilityLabel={`Get directions to ${context.venueName} in Panda`}
          accessibilityRole="button"
          onPress={onDirections}
          style={({ pressed }) => [
            styles.aiTransitAction,
            { backgroundColor: colors.gold, borderColor: colors.goldLine },
            pressed && styles.pressed,
          ]}
        >
          <PandaIcon name="navigate" size={15} color={colors.goldDeep} />
          <Text style={[styles.aiTransitActionText, styles.embossedGoldText]}>Get directions in Panda</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 14,
    paddingHorizontal: 14,
  },
  headerIcon: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginHorizontal: -4,
    width: 44,
  },
  headerIconPressed: {
    opacity: 0.55,
  },
  pandaAvatar: {
    alignItems: 'center',
    borderRadius: 23,
    borderWidth: 1.5,
    height: 46,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 46,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  headerSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 2,
  },
  headerTitleRefined: {
    fontSize: 20,
    lineHeight: 24,
  },
  headerSubtitleRefined: {
    fontSize: 11,
    letterSpacing: 0.6,
    lineHeight: 14,
    marginTop: 1,
  },
  messages: {
    gap: 13,
    paddingHorizontal: 14,
    paddingTop: 18,
  },
  messageList: {
    flex: 1,
  },
  messageRow: {
    alignItems: 'flex-start',
  },
  userRow: {
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 20,
    maxWidth: '84%',
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  bubbleText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    lineHeight: 22,
  },
  aiTransitCard: {
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 9,
    maxWidth: '92%',
    padding: 13,
    width: 330,
  },
  aiTransitHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  aiTransitIcon: {
    alignItems: 'center',
    borderRadius: 11,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  aiTransitHeaderCopy: {
    flex: 1,
    marginLeft: 9,
  },
  aiTransitEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.8,
  },
  aiTransitTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    marginTop: 2,
  },
  aiTransitPoint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  aiTransitEmoji: {
    fontSize: 14,
    width: 20,
  },
  aiTransitPointCopy: {
    flex: 1,
  },
  aiTransitLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.65,
  },
  aiTransitName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    marginTop: 2,
  },
  aiTransitWalk: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    marginTop: 3,
  },
  aiTransitLine: {
    height: 12,
    marginLeft: 9,
    marginVertical: 2,
    width: 2,
  },
  aiTransitSummary: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    marginTop: 11,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  aiTransitSummaryText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    lineHeight: 14,
  },
  aiTransitAction: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginTop: 13,
    minHeight: 42,
    paddingHorizontal: 13,
  },
  aiTransitActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  results: {
    gap: 10,
    paddingTop: 10,
    paddingRight: 14,
  },
  resultCardShell: {
    borderRadius: 24,
    elevation: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    width: 248,
  },
  resultCardSurface: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  resultHero: {
    height: 148,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  resultPhotoFallback: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  photoHalo: {
    borderRadius: 70,
    borderWidth: 1,
    height: 140,
    position: 'absolute',
    right: -42,
    top: -62,
    width: 140,
  },
  photoBadgeRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 11,
    position: 'absolute',
    right: 11,
    top: 11,
  },
  photoGlassBadge: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    maxWidth: 154,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  photoBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  openBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  openDot: {
    borderRadius: 4,
    height: 6,
    width: 6,
  },
  openBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
  },
  photoTitleBlock: {
    bottom: 12,
    left: 13,
    position: 'absolute',
    right: 13,
  },
  photoDistanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  photoDistanceText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  resultBody: {
    padding: 11,
  },
  resultName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    lineHeight: 21,
    textShadowColor: 'rgba(0,0,0,0.24)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  resultMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  resultMetaChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 25,
    paddingHorizontal: 8,
  },
  resultMetaChipText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  resultSourceLink: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 8,
  },
  resultStopLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  resultActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
    marginTop: 10,
  },
  embossedGoldText: {
    color: '#171006',
    textShadowColor: 'rgba(255, 247, 196, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  resultHours: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  resultHoursText: {
    flex: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    lineHeight: 14,
  },
  uberEstimateButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginTop: 10,
    minHeight: 62,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  uberIconWrap: {
    alignItems: 'center',
    borderRadius: 12,
    height: 33,
    justifyContent: 'center',
    width: 33,
  },
  uberCopy: {
    flex: 1,
    gap: 2,
  },
  uberEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.8,
  },
  uberFare: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    lineHeight: 16,
  },
  uberDisclaimer: {
    fontFamily: 'Inter_500Medium',
    fontSize: 8,
    lineHeight: 11,
  },
  uberJourneyCard: {
    alignSelf: 'stretch',
    borderRadius: 22,
    borderWidth: 1,
    elevation: 4,
    gap: 12,
    marginTop: 11,
    padding: 14,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  uberJourneyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  uberJourneyEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 1.05,
  },
  uberJourneyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 19,
  },
  uberJourneyCar: {
    fontSize: 20,
  },
  uberJourneyDestination: {
    borderRadius: 17,
    borderWidth: 1,
    padding: 12,
  },
  uberJourneyRoute: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 9,
  },
  uberJourneyDot: {
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  uberJourneyLine: {
    borderRadius: 1,
    height: 28,
    left: 4,
    position: 'absolute',
    top: 9,
    width: 1,
  },
  uberJourneyDestinationCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  uberJourneyAddress: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 15,
  },
  uberJourneyMetrics: {
    flexDirection: 'row',
    gap: 8,
  },
  uberJourneyMetric: {
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 62,
    padding: 10,
  },
  uberJourneyMetricValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  uberJourneyPeak: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  uberJourneyAction: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  uberJourneyActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  uberJourneyFooter: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    lineHeight: 13,
    textAlign: 'center',
  },
  resultPrimaryAction: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 33,
    paddingHorizontal: 9,
  },
  resultSecondaryAction: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 33,
    paddingHorizontal: 8,
  },
  resultActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
  },
  suggestions: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  suggestionRail: {
    flexGrow: 0,
    maxHeight: 54,
  },
  suggestion: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  suggestionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  memoryOverlay: {
    backgroundColor: 'rgba(4, 23, 17, 0.58)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  memorySheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 13,
    maxHeight: '82%',
    paddingBottom: 28,
    paddingHorizontal: 22,
    paddingTop: 24,
  },
  memorySheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  memoryTitleGroup: {
    gap: 4,
  },
  memoryEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 1.5,
  },
  memoryTitle: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 25,
    lineHeight: 31,
  },
  memoryClose: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  memoryDescription: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  memoryToggleRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  memoryToggleCopy: {
    flex: 1,
    gap: 3,
  },
  memoryToggleTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  memoryToggleSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  memoryNotice: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
  },
  memoryList: {
    flexGrow: 0,
    maxHeight: 250,
  },
  memoryItem: {
    alignItems: 'center',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  memoryItemText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
  memoryRemove: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  memoryEmpty: {
    alignItems: 'center',
    borderRadius: 20,
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  memoryEmptyEmoji: {
    fontSize: 25,
  },
  memoryEmptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  memoryEmptyCopy: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  memoryClearButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 13,
  },
  memoryClearText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  memoryPrivacyNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 14,
  },
  composer: {
    alignItems: 'center',
    borderTopWidth: 1,
    elevation: 12,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 9,
    paddingHorizontal: 14,
    paddingTop: 10,
    position: 'relative',
    zIndex: 40,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    minHeight: 49,
    paddingHorizontal: 15,
  },
  send: {
    alignItems: 'center',
    borderRadius: 16,
    height: 49,
    justifyContent: 'center',
    width: 49,
  },
  voiceButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 49,
    justifyContent: 'center',
    width: 49,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
});