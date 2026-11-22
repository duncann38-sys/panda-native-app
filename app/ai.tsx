import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PandaLogo } from '@/components/PandaLogo';
import { useSandboxReservations } from '@/hooks/useSandboxReservations';
import { SandboxBookingAiEntry } from '@/components/SandboxBookingAiEntry';
import { useSandboxBookingConversation } from '@/hooks/useSandboxBookingConversation';
import { SandboxConversationCard } from '@/components/SandboxConversationCard';
import { conciergeGreeting, shownConciergeVenueIds } from '@/utils/concierge-session';
import { isGeneralLifeConversation, wantsOpenVenues, openVenueSelection, NO_OPEN_VENUES_REPLY } from '@/utils/concierge-conversation';
import { ConciergeTypingIndicator } from '@/components/ConciergeTypingIndicator';
import { isVerifiedTransitStation } from '@/utils/verified-transit-station';
import { conciergeChatPolish } from '@/utils/concierge-chat-polish';
import { PandaIcon } from '@/components/PandaIcon';
import { ReserveButton } from '@/components/ReserveButton';
import { getPandaTimeLabel, getPandaTimeMode } from '@/constants/panda-time';
import { PANDA_DISCOVERY_API, PANDA_PRODUCTION_API, PANDA_RUNTIME_API } from '@/constants/services';
import { useLiveVenues } from '@/context/live-venues';
import { venues as pandaVenues, type Venue } from '@/data/venues';
import { classifyGooglePlace } from '@/data/venue-categories';
import { useColors } from '@/hooks/useColors';
import { recordVenueActivity } from '@/utils/record-venue-activity';
import { getOfficialVenueLinks } from '@/utils/official-venue-links';
import { VenuePhoto } from '@/components/VenuePhoto';
import { googleDirectionsUrl } from '@/utils/venue-actions';
import { getPartnerTier } from '@/utils/partner-venues';
import { buildUberEstimate } from '@/utils/uber-estimate';
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
import { safeAiSources, type AiSource } from '@/utils/ai-source-links';
import { isWeatherIntent, requiresCurrentLocation } from '@/utils/location-intent';
import { liveDiscoveryNearbyTypes, liveDiscoverySearchQuery } from '@/utils/live-discovery-search';
import { distanceBetween } from '@/utils/venue-actions';
import { useAuth } from '@/context/auth';
import { parseProfilePreferences } from '@/utils/profile-preferences';
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
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  location?: { latitude?: number; longitude?: number; lat?: number; lng?: number } | null;
  driveDurationMinutes?: number;
  price?: string;
  website?: string;
  menuLink?: string;
  mapsUri?: string;
  photoName?: string;
  photoNames?: Venue['photoNames'];
  photoAttribution?: string;
  photoCount?: number;
  phone?: string;
  openNow?: boolean;
  todayHours?: string;
  nearest_station?: string;
  stopLabel?: string;
  openingSourceName?: string;
  openingSourceUrl?: string;
  openingReportedAt?: string;
  openingDate?: string;
  openingDesignation?: string;
  openingEvidence?: string;
  editorialNote?: string;
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
  sources?: AiSource[];
  sourceLabel?: string;
  weatherAttribution?: { label: string; url: string };
  newSelection?: boolean;
  newOpeningsHasMore?: boolean;
  newOpeningsNextOffset?: number;
  weeklyOpeningAlert?: boolean;
  rideRequest?: boolean;
  transit?: AiTransitContext;
  requestId?: number;
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
  vehicleType?: string | null;
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
const PANDA_AI_HISTORY_LIMIT = 48;
const PREFERENCE_PATTERN =
  /\b(?:i(?:'m| am) (?:a )?(?:vegetarian|vegan|pescatarian|gluten[- ]free|teetotal|sober|allergic)|i(?:'m| am) allergic|allergic to|i (?:don['’]?t|do not|never|can['’]?t|cannot) (?:eat|drink|like|want)|i (?:prefer|love|like|hate|avoid)|please (?:don['’]?t|do not|always|never)|call me|don['’]?t call me|no (?:meat|pork|alcohol|dairy|nuts|gluten|spice|seafood|fish)|my budget|keep it (?:under|below|cheap))\b/i;

// The backend owns the authoritative Panda personality prompt. The client only
// sends a bounded slice of this session's conversation, plus any explicit
// preference statements the user made in messages that were trimmed away.
// Nothing here is persisted beyond the in-memory chat session.
function buildPandaAiContents(conversation: Array<{ role: 'user' | 'model'; text: string }>) {
  const kept = conversation.slice(-PANDA_AI_HISTORY_LIMIT);
  const trimmed = conversation.slice(0, Math.max(0, conversation.length - kept.length));
  const preferenceNotes = trimmed
    .filter((message) => message.role === 'user' && PREFERENCE_PATTERN.test(message.text))
    .map((message) => message.text.trim().slice(0, 280))
    .slice(-12);
  const contents = kept.map((message) => ({
    role: message.role,
    parts: [{ text: message.text }],
  }));
  if (preferenceNotes.length) {
    const noteText = `Earlier in this chat I told you: ${preferenceNotes.join(' | ')}`;
    if (contents[0]?.role === 'user') contents[0] = { role: 'user', parts: [{ text: noteText }, ...contents[0].parts] };
    else contents.unshift({ role: 'user', parts: [{ text: noteText }] });
  }
  return contents;
}

function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function removeWeatherProviderFromReply(text: string) {
  return String(text || '')
    .replace(/\baccording to MET Norway\b/gi, 'the forecast')
    .replace(/\b(?:the\s+)?(?:latest\s+)?MET Norway(?:’s|'s)?\s+(?:(?:available|model)\s+)?forecast/gi, 'the forecast')
    .replace(/\bforecast\s+(?:from|by)\s+MET Norway\b/gi, 'forecast')
    .replace(/\bweather data (?:from|provided by) MET Norway(?:,?\s*(?:licensed )?under CC BY 4\.0)?\.?/gi, '')
    .replace(/\bMET Norway\b/gi, '')
    .replace(/\bCC BY 4\.0\b\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

const suggestions = ['Nearest station & directions', 'Open right now', 'Dinner tonight', 'Nearby bars', 'Cheap eats', 'Pint'];
const nearbyShortcutPrompts: Record<string, string> = {
  'Open right now': 'Restaurants open right now near me',
  'Nearby bars': 'Bars near me',
  'Cheap eats': 'Cheap eats near me',
  'Dinner tonight': 'Dinner tonight near me',
  Pint: 'Pubs near me',
};
const discoveryShortcutCategories: Record<string, string> = {
  'Bars near me': 'Bar',
  'Pubs near me': 'Pubs',
};
function isNearbyShortcut(text: string) {
  return Object.values(nearbyShortcutPrompts).includes(text)
    || Object.prototype.hasOwnProperty.call(nearbyShortcutPrompts, text);
}
function isUberRequest(text: string) {
  return /\b(?:get|call|book|order|hail|request|send|need|want|like|arrange|take)\b[^.!?]{0,28}\b(?:uber|taxi|cab|ride(?:\s+share)?)\b/i.test(text);
}
function isUberHomeRequest(text: string) {
  return /\b(?:uber|taxi|cab|ride(?:\s+share)?)\b[^.!?]{0,20}\b(?:to\s+)?(?:my\s+)?home\b/i.test(text)
    || /\bhome\b[^.!?]{0,24}\b(?:uber|taxi|cab|ride(?:\s+share)?)\b/i.test(text);
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
  if (!venue.id || !isGooglePlaceSessionVenue(venue)) return venue;

  try {
    const response = await fetchWithTimeout(
      `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(venue.id)}/profile?hoursVersion=1`,
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
  const tier = getPartnerTier(venue.id);
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
    premium: tier === 'banging',
    banging: tier === 'banging',
    promoted: Boolean(tier),
    photoName: venue.photoName,
    photoNames: venue.photoNames,
    photoAttributions: venue.photoAttribution ? [venue.photoAttribution] : [],
  };
}

function getPandaGreeting(date = new Date(),name = '') { return conciergeGreeting(name,date); }

export function PandaAiScreen({ embedded = false }: { embedded?: boolean }) {
  const sandboxBookings = useSandboxReservations();
  const booking = useSandboxBookingConversation(sandboxBookings);
  const timeMode = getPandaTimeMode();
  const isNight = timeMode === 'night';
  const colors = useColors(isNight ? 'dark' : undefined);
  const polish = conciergeChatPolish(colors);
  const navigation = useNavigation();
  const subscribeToFocus = useCallback((notify: () => void) => {
    const focus = navigation.addListener('focus', notify);
    const blur = navigation.addListener('blur', notify);
    return () => { focus(); blur(); };
  }, [navigation]);
  const isRouteFocused = React.useSyncExternalStore(subscribeToFocus, navigation.isFocused, navigation.isFocused);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coordinates, refreshLocation, liveVenues } = useLiveVenues();
  const { account, getIdToken } = useAuth();
  const { prompt: promptParam, weeklyOpenings: weeklyOpeningsParam } = useLocalSearchParams<{ prompt?: string | string[]; weeklyOpenings?: string | string[] }>();
  const initialPrompt = Array.isArray(promptParam) ? promptParam[0]?.trim() ?? '' : promptParam?.trim() ?? '';
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: getPandaGreeting(new Date(), sandboxBookings.account?.name),
    },
  ]);
  const suggestionsWithPlanner = [
    { label: 'Make me smile', prompt: 'Make me smile', planner: false },
    { label: 'Talk it through', prompt: 'Can we talk something through?', planner: false },
    { label: `Plan my ${getPandaTimeLabel(timeMode)}`, planner: true },
    { label: 'Uber home', prompt: 'Uber home', planner: false },
    { label: 'New restaurants', prompt: 'New restaurants near me', planner: false },
    ...suggestions.map((suggestion) => ({ label: suggestion, planner: false })),
  ];
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const listRef = useRef<FlatList<{ message: Message; index: number }>>(null);
  const inputRef = useRef<TextInput>(null);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
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
  const newOpeningOffsetRef = useRef(0);
  const newOpeningHasMoreRef = useRef(false);
  const syncedOpeningCityRef = useRef('');

  useFocusEffect(useCallback(() => {
    const uid = account?.uid;
    if (!uid) return;
    let active = true;
    void (async () => {
      try {
        const idToken = await getIdToken();
        const response = await fetch(PANDA_PRODUCTION_API + '/api/new-openings-notifications', {
          method: 'POST', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ action: 'consume-chat-alerts' }),
        });
        if (!response.ok) return;
        const data = await response.json() as { venues?: AiVenue[]; text?: string };
        const verified = (data.venues || []).filter(venue => hasDatedOpeningEvidence(venue));
        if (!active || !verified.length) return;
        setMessages(current => {
          const shown = new Set(current.flatMap(message => (message.venues || []).map(venue => venue.id).filter((id): id is string => Boolean(id))));
          const fresh = verified.filter(venue => venue.id && !shown.has(venue.id));
          if (!fresh.length) return current;
          return [...current, { role: 'model', text: data.text || 'A few new high-end openings are worth a look ✨',
            venues: fresh.slice(0, 15), newSelection: true, newOpeningsHasMore: false, weeklyOpeningAlert: true }];
        });
      } catch { /* Opening alerts are optional; regular chat remains available. */ }
    })();
    return () => { active = false; };
  }, [account?.uid, getIdToken, weeklyOpeningsParam]));

  useEffect(() => {
    return () => {
      voiceRef.current?.abort?.();
      currentRequestRef.current = ++requestSequenceRef.current;
      chatGenerationRef.current += 1;
      primaryControllerRef.current?.abort();
    };
  }, []);

  const sendUberHome = async (text: string) => {
    if (primaryPendingRef.current || booking.isBusy) return;
    const requestId = ++requestSequenceRef.current;
    currentRequestRef.current = requestId;
    const generation = chatGenerationRef.current;
    primaryPendingRef.current = true;
    setDraft('');
    inputRef.current?.blur();
    setMessages((current) => [
      ...current,
      { role: 'user', text },
      { role: 'model', text: '', requestId },
    ]);
    setSending(true);
    const updateHomeReply = (reply: string, venue?: AiVenue) => {
      if (chatGenerationRef.current !== generation) return;
      setMessages((current) => current.map((message) => message.requestId === requestId
        ? { ...message, text: reply, venues: venue ? [venue] : [], rideRequest: Boolean(venue) }
        : message));
    };
    try {
      const preferences = parseProfilePreferences(await profilePreferenceStore.read(account?.uid));
      const homeLatitude = preferences.homeLatitude;
      const homeLongitude = preferences.homeLongitude;
      if (
        !preferences.homeAddress
        || typeof homeLatitude !== 'number'
        || !Number.isFinite(homeLatitude)
        || typeof homeLongitude !== 'number'
        || !Number.isFinite(homeLongitude)
      ) {
        updateHomeReply('Add a home address in Profile → Home for Uber first. Panda keeps it encrypted on this device and won’t send it to chat.');
        return;
      }
      const locationResult = await withTimeout(
        refreshLocation(true, { forceFresh: true }),
        REQUIRED_LOCATION_TIMEOUT_MS,
        null,
      );
      if (currentRequestRef.current !== requestId) return;
      const pickup = locationResult?.coordinates;
      if (!pickup) {
        updateHomeReply(locationResult?.status === 'permission-denied'
          ? 'Allow Panda to use your location so I can estimate the ride from your current pickup point.'
          : 'I couldn’t get a fresh pickup location. Turn on device location services and try Uber Home again.');
        return;
      }
      const distanceMeters = distanceBetween(pickup, {
        latitude: homeLatitude,
        longitude: homeLongitude,
      });
      if (!distanceMeters || distanceMeters <= 0 || distanceMeters > 250_000) {
        updateHomeReply('I can’t make a reliable local Uber estimate for that distance. Check your saved Home address in Profile.');
        return;
      }
      updateHomeReply('Your Home destination is ready 🚗 Review Panda’s estimate, then check the live fare in Uber.', {
        id: 'panda-saved-home',
        name: 'Home',
        address: 'Saved privately on this device',
        fullAddress: 'Saved privately on this device',
        latitude: homeLatitude,
        longitude: homeLongitude,
        distanceMeters,
      });
    } catch {
      updateHomeReply('I couldn’t load your saved Home destination. Check Profile and try again.');
    } finally {
      if (currentRequestRef.current === requestId && chatGenerationRef.current === generation) {
        primaryPendingRef.current = false;
        setSending(false);
      }
    }
  };

  const sendMessage = async (text = draft) => {
    const trimmed = text.trim();
    if (!trimmed || primaryPendingRef.current) return;
    if (booking.isBusy) return;
    if (isUberHomeRequest(trimmed)) {
      await sendUberHome(trimmed);
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

    const isNextOpeningPage = /next\s+15/i.test(trimmed) && newOpeningHasMoreRef.current;
    const isNewOpeningSearch = isNewOpeningPrompt(trimmed);
    if (isNewOpeningSearch && !isNextOpeningPage) { newOpeningOffsetRef.current = 0; newOpeningHasMoreRef.current = false; }
    const isTransit = isTransitQuestion(trimmed);
    const rideIntent = isUberRequest(trimmed);
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
    if (rideIntent && sessionVenueResolution.isReference && sessionVenueResolution.ambiguous) {
      const choices = sessionVenueContext.recentVenues.map((venue) =>
        findOriginalSessionVenue(messages, venue, activeAiVenueRef.current),
      );
      setMessages([
        ...messages,
        { role: 'user', text: trimmed },
        {
          role: 'model',
          text: 'I can do that 🚗 There are a few places in our chat, so choose the right venue card and tap its Uber estimate—I won’t guess.',
          venues: choices,
        },
      ]);
      setDraft('');
      return;
    }
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
    const conversation = [...messages, { role: 'user' as const, text: trimmed }];
    const needsCurrentLocation = requiresCurrentLocation(
      trimmed,
      isGeneralLifeConversation,
      isTransitQuestion,
    ) || isNewOpeningSearch;
    const shortcutMatch = Object.entries(nearbyShortcutPrompts).find(([label, prompt]) =>
      label === trimmed || prompt === trimmed,
    );
    const discoveryCategory = discoveryShortcutCategories[shortcutMatch?.[1] ?? trimmed];
    setMessages([
      ...conversation,
      ...(needsCurrentLocation
        ? [{ role: 'model' as const, text: '', requestId }]
        : []),
    ]);
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
      // Refresh the foreground fix for every local/ride request. Discovery has
      // the phone's current fix; Panda AI must not silently reuse an old one.
      if (needsCurrentLocation) {
        const locationResult = await withTimeout(
          refreshLocation(true, { forceFresh: true }),
          REQUIRED_LOCATION_TIMEOUT_MS,
          null,
        );
        if (!isCurrentRequest()) return;
        requestCoordinates = locationResult?.coordinates ?? null;
        if (!requestCoordinates) {
          const locationError = isWeatherIntent(trimmed)
            ? locationResult?.status === 'permission-denied'
              ? 'To check the weather where you are, allow Panda to use your location. Or just tell me your town or city.'
              : 'I couldn’t get your location for a local forecast. Turn on device location services, or tell me your town or city.'
            : locationResult?.status === 'permission-denied'
              ? 'Panda needs location permission to find nearby places. Allow location access for Panda in your device settings, then try again.'
              : 'I couldn’t get your current location. Turn on device location services and allow Panda to use your location, then try again.';
          updateResult((message) => ({ ...message, text: locationError, venues: [] }));
          return;
        }
      }

      if (
        rideIntent
        && sessionVenueResolution.isReference
        && referencedVenue
        && requestCoordinates
      ) {
        const destinationLatitude = referencedVenue.latitude
          ?? referencedVenue.location?.latitude
          ?? referencedVenue.location?.lat
          ?? referencedVenue.lat;
        const destinationLongitude = referencedVenue.longitude
          ?? referencedVenue.location?.longitude
          ?? referencedVenue.location?.lng
          ?? referencedVenue.lng;
        const distanceMeters = distanceBetween(requestCoordinates, {
          latitude: destinationLatitude,
          longitude: destinationLongitude,
        });
        if (!distanceMeters || distanceMeters <= 0 || distanceMeters > 250_000) {
          updateResult((message) => ({
            ...message,
            text: `I found ${referencedVenue.name ?? 'that place'} in our chat, but I can’t make a reliable local ride estimate for it. Tell me the venue name and city, and I’ll check it.`,
            venues: [],
          }));
        } else {
          updateResult((message) => ({
            ...message,
            text: `I’ve got ${referencedVenue.name ?? 'your destination'} 🚗 Review Panda’s estimate, then check the live fare in Uber. I haven’t requested a ride.`,
            venues: [{ ...referencedVenue, distanceMeters }],
            rideRequest: true,
          }));
        }
        primaryPendingRef.current = false;
        setSending(false);
        return;
      }

      if (isNewOpeningSearch) {
        if (!isCurrentRequest()) return;
      }

      const controller = new AbortController();
      primaryControllerRef.current = controller;
      const requestBody = discoveryCategory && requestCoordinates
        ? {
            venuesOnly: true,
            discoveryMode: 'cover',
            searchMode: 'nearby',
            includedTypes: liveDiscoveryNearbyTypes(discoveryCategory),
            query: liveDiscoverySearchQuery(discoveryCategory),
            location: {
              lat: requestCoordinates.latitude,
              lng: requestCoordinates.longitude,
            },
            radius_meters: 6000,
          }
        : {
            contents: buildPandaAiContents(conversation),
            shownVenueIds: shownConciergeVenueIds(conversation),
            chatContext: { timeZone: localTimeZone() },
            ...(sessionVenueContext.recentVenues.length ? { sessionVenueContext } : {}),
            ...(isNewOpeningSearch ? {newOpeningsOnly:true, offset:newOpeningOffsetRef.current, limit:15} : {}),
            generationConfig: { temperature: 0.85, maxOutputTokens: 700 },
            ...(requestCoordinates
              ? {
                  location: {
                    lat: requestCoordinates.latitude,
                    lng: requestCoordinates.longitude,
                  },
                }
              : {}),
          };
      const response = await fetchWithTimeout(
        discoveryCategory ? `${PANDA_DISCOVERY_API}/api/panda-ai` : PANDA_AI_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(requestBody),
        },
        PANDA_AI_REQUEST_TIMEOUT_MS,
        controller.signal,
      );
      const data = (await response.json()) as {
        text?: string;
        venues?: AiVenue[];
        sources?: unknown;
        customItinerary?: boolean;
        customPubCrawl?: boolean;
        newOpeningsSearch?: boolean;
        nextOffset?: number;
        hasMore?: boolean;
        citySlug?: string;
        rideRequest?: boolean;
        aiMode?: string;
        weather?: { attribution?: string; attributionUrl?: string; source?: string } | null;
      };
      if (!response.ok) throw new Error('Panda AI request failed');
      if (!isCurrentRequest()) return;

      const openingSearch = isNewOpeningSearch || data.newOpeningsSearch === true;
      if (openingSearch && data.citySlug && account?.uid) {
        const syncKey = account.uid + '|' + data.citySlug;
        if (syncedOpeningCityRef.current !== syncKey) {
          void getIdToken().then(async idToken => {
            const response = await fetch(PANDA_PRODUCTION_API + '/api/new-openings-notifications', {
              method: 'POST', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
              body: JSON.stringify({ citySlug: data.citySlug }),
            });
            if (response.ok) syncedOpeningCityRef.current = syncKey;
          }).catch(() => {});
        }
      }
      if (data.newOpeningsSearch === true) {
        newOpeningOffsetRef.current = Number.isSafeInteger(data.nextOffset) ? Math.max(0, data.nextOffset!) : 0;
        newOpeningHasMoreRef.current = data.hasMore === true;
      }
      const rideRequest = data.rideRequest === true;
      const rideOptions = data.aiMode === 'ride-options' || data.aiMode === 'ride-choices';
      const sources = safeAiSources(data.sources);
      const sourceLabel = data.aiMode === 'grounded-prices'
        ? 'PRICE SOURCES'
        : data.aiMode === 'grounded-events'
          ? 'LIVE SHOW SOURCES'
          : data.aiMode === 'grounded-news'
            ? 'GOOD NEWS SOURCES'
          : sources.length
            ? 'LIVE SOURCES'
            : undefined;
      const weatherAttribution = typeof data.weather?.attribution === 'string'
        ? {
            label: 'Weather data from MET Norway · CC BY 4.0',
            url: typeof data.weather.attributionUrl === 'string'
              ? data.weather.attributionUrl
              : 'https://creativecommons.org/licenses/by/4.0/',
          }
        : undefined;
      const discoveryCoordinates = requestCoordinates;
      const venueResults = discoveryCategory && discoveryCoordinates
        ? (data.venues ?? []).map((venue) => {
            const latitude = venue.latitude ?? venue.location?.latitude ?? venue.location?.lat ?? venue.lat;
            const longitude = venue.longitude ?? venue.location?.longitude ?? venue.location?.lng ?? venue.lng;
            const distanceMeters = Number.isFinite(venue.distanceMeters)
              ? venue.distanceMeters
              : distanceBetween(discoveryCoordinates, {
                  latitude: Number.isFinite(latitude) ? latitude : null,
                  longitude: Number.isFinite(longitude) ? longitude : null,
                });
            return {
              ...venue,
              latitude: Number.isFinite(latitude) ? latitude : undefined,
              longitude: Number.isFinite(longitude) ? longitude : undefined,
              distanceMeters: distanceMeters ?? undefined,
            };
          })
        : (data.venues ?? []);
      const eligibleVenues = venueResults.filter((venue) => {
        if (discoveryCategory) {
          return Boolean(venue.id)
            && Number.isFinite(venue.distanceMeters)
            && Number(venue.distanceMeters) >= 0
            && Number(venue.distanceMeters) <= 6000;
        }
        if (rideOptions) {
          const latitude = venue.latitude ?? venue.location?.latitude ?? venue.location?.lat ?? venue.lat;
          const longitude = venue.longitude ?? venue.location?.longitude ?? venue.location?.lng ?? venue.lng;
          return Boolean(venue.id)
            && Number.isFinite(latitude)
            && Number.isFinite(longitude)
            && Number.isFinite(venue.distanceMeters)
            && Number(venue.distanceMeters) > 0
            && Number(venue.distanceMeters) <= 250_000;
        }
        if (rideRequest) {
          const latitude = venue.latitude ?? venue.location?.latitude ?? venue.location?.lat ?? venue.lat;
          const longitude = venue.longitude ?? venue.location?.longitude ?? venue.location?.lng ?? venue.lng;
          return Boolean(venue.id)
            && Number.isFinite(latitude)
            && Number.isFinite(longitude)
            && Number.isFinite(venue.distanceMeters)
            && Number(venue.distanceMeters) > 0;
        }
        if (openingSearch) return data.newOpeningsSearch === true && hasDatedOpeningEvidence(venue);
        return Boolean(venue.photoName)
          && Number(venue.photoCount) >= 5
          && (!isNearbyShortcut(trimmed) || (Number.isFinite(venue.distanceMeters)
            && Number(venue.distanceMeters) >= 0 && Number(venue.distanceMeters) <= 5000));
      });
      if (!data.customItinerary && !data.customPubCrawl && !data.newOpeningsSearch && !rideRequest) {
        eligibleVenues.sort(
          (left, right) => (isNearbyShortcut(trimmed)
            ? Number(right.rating ?? 0) - Number(left.rating ?? 0)
              || Number(right.ratingCount ?? 0) - Number(left.ratingCount ?? 0) : 0)
            || Number(left.distanceMeters ?? Infinity) - Number(right.distanceMeters ?? Infinity),
        );
      }
      eligibleVenues.splice(rideRequest ? 1 : data.newOpeningsSearch ? 15 : PANDA_AI_VENUE_LIMIT);
      const onlyOpenNow = wantsOpenVenues(trimmed);
      const initialVenues = rideRequest
        ? eligibleVenues.slice(0, 1)
        : isNearestStationOnly(trimmed) ? [] : openVenueSelection(eligibleVenues, onlyOpenNow);
      const rawBaseReply = onlyOpenNow && !initialVenues.length && !openingSearch
        ? NO_OPEN_VENUES_REPLY
        : data.text?.trim() || (discoveryCategory
          ? initialVenues.length
            ? `I found ${initialVenues.length} nearby ${discoveryCategory === 'Pubs' ? 'pubs and beer gardens' : 'bars and cocktail bars'} from your current location. Tap a card for details ✨`
            : `I couldn’t find verified ${discoveryCategory === 'Pubs' ? 'pubs' : 'bars'} within 6 km just now. Want me to widen the search?`
          : openingSearch && !initialVenues.length
        ? 'I couldn’t verify any new-restaurant reports for this search. Try another area or check again later — I won’t substitute ordinary restaurant results.'
        : 'I’m not sure I caught that. Try asking for a place, mood, or time of day.');
      const baseReply = data.weather ? removeWeatherProviderFromReply(rawBaseReply) : rawBaseReply;
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
      if (needsCurrentLocation) {
        updateResult((message) => ({
          ...message,
          text: isTransit ? 'Checking live station and route information…' : baseReply,
          venues: initialVenues,
          sources,
          sourceLabel,
          weatherAttribution,
          newSelection: data.newOpeningsSearch === true,
          newOpeningsHasMore: data.newOpeningsSearch === true && data.hasMore === true,
          newOpeningsNextOffset: data.newOpeningsSearch === true ? data.nextOffset : undefined,
          rideRequest,
        }));
      } else {
        setMessages((current) => [
          ...current,
          { role: 'model', requestId, text: baseReply, venues: initialVenues, sources, sourceLabel, weatherAttribution, newSelection: data.newOpeningsSearch === true, newOpeningsHasMore: data.newOpeningsSearch === true && data.hasMore === true, newOpeningsNextOffset: data.newOpeningsSearch === true ? data.nextOffset : undefined, rideRequest },
        ]);
      }
      primaryPendingRef.current = false;
      setSending(false);
      primaryControllerRef.current = null;

      if (!rideRequest) void Promise.all(initialVenues.map(enrichAiVenue))
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
              const venueWithStation = { ...venue, nearest_station: liveTransit.destinationStation.name };
              activeAiVenueRef.current = venueWithStation;
              const transit: AiTransitContext = {
                venueId: venue.id,
                venueName: venue.name,
                venue: venueWithStation,
                originStation: liveTransit.originStation,
                destinationStation: liveTransit.destinationStation,
                originWalk: liveTransit.originWalk,
                transitRoute: liveTransit.transitRoute,
                venueWalk: liveTransit.venueWalk,
              };
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
        if (needsCurrentLocation) {
          updateResult((message) => ({ ...message, text: requestError, venues: [] }));
        } else {
          setMessages((current) => [...current, { role: 'model', requestId, text: requestError }]);
        }
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

  const muteWeeklyOpeningAlerts = async () => {
    if (!account?.uid) return;
    try {
      const idToken = await getIdToken();
      const response = await fetch(PANDA_PRODUCTION_API + '/api/new-openings-notifications', {
        method: 'POST', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      if (!response.ok) throw new Error();
      setMessages(current => current.map(message => message.weeklyOpeningAlert ? { ...message, weeklyOpeningAlert: false } : message));
      Alert.alert('Weekly openings muted', 'You can turn these alerts back on in Profile settings.');
    } catch {
      Alert.alert('Could not mute alerts', 'Panda could not update this setting right now. Try Profile settings later.');
    }
  };

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
    if (routeVenue) router.push({ pathname: '/(tabs)/map', params: { directionsVenueId: routeVenue.id,
      directionsVenueData: JSON.stringify(routeVenue), directionsReturn: 'back', routeMode: 'transit' } });
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
    router.push({ pathname: '/(tabs)/map', params: { directionsVenueId: venue.id,
      directionsVenueData: JSON.stringify(venue), directionsReturn: 'back', routeMode: 'walking' } });
  };
  const menuOpeningRef = useRef(false);
  const openAiVenueMenu = async (venue: AiVenue) => {
    if (!venue.id || menuOpeningRef.current) return;
    menuOpeningRef.current = true;
    try {
      const links = await getOfficialVenueLinks(venue.id);
      if (!links?.menuUrl) throw new Error('No verified menu link');
      const record = aiVenueToVenue(venue);
      if (!record) throw new Error('Venue unavailable');
      router.push({ pathname: '/venue/[id]/menu', params: { id: record.id, venueData: JSON.stringify(record), pageUrl: links.menuUrl } });
    } catch {
      const record = aiVenueToVenue(venue);
      if (record) recordVenueActivity('menu_click', record);
      Alert.alert('Menu link unavailable', 'A correct official menu link could not be verified. No homepage or search link has been substituted.');
    } finally {
      menuOpeningRef.current = false;
    }
  };

  // Mirrors the absolute tab bar in (tabs)/_layout.tsx, which hides itself
  // while the keyboard is open (tabBarHideOnKeyboard).
  const embeddedTabBarHeight =
    Platform.OS === 'web' ? 84 : 78 + (Platform.OS === 'android' ? Math.max(insets.bottom, 24) : 0);

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
        text: getPandaGreeting(new Date(), sandboxBookings.account?.name),
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      enabled
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
        <View accessible accessibilityLabel="Panda logo" accessibilityRole="image" style={[styles.pandaAvatar, polish.pandaAvatar, { backgroundColor: colors.ivory, borderColor: colors.goldLine }]}>
          <PandaLogo size={36} />
        </View>
        <View accessible accessibilityRole="header" accessibilityLabel="Panda AI, Your life concierge" style={styles.headerCopy}>
          <Text numberOfLines={1} style={[styles.headerTitle, polish.headerTitle, styles.headerTitleRefined, { color: colors.primaryForeground }]}>Panda AI</Text>
          <Text numberOfLines={1} style={[styles.headerSubtitle, polish.headerSubtitle, styles.headerSubtitleRefined, { color: colors.mint300 }]}>Your life concierge</Text>
        </View>
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

      <SandboxBookingAiEntry enabled={sandboxBookings.capabilities.data?.enabled === true}
        onPress={() => void sendMessage('Book a table at OpenTable Sandbox — 264001')} />
      <FlatList
        ref={listRef}
        inverted
        data={messages.map((message, index) => ({ message, index })).reverse()}
        keyExtractor={(item) => `${item.message.role}-${item.index}`}
        style={styles.messageList}
        contentContainerStyle={[styles.messages, { paddingBottom: 18, paddingTop: 16 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        maintainVisibleContentPosition={{ minIndexForVisible: 1, autoscrollToTopThreshold: 80 }}
        ListHeaderComponent={
          <View>
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
          </View>
        }
        renderItem={({ item: { message, index } }) => !message.text.trim() && !message.venues?.length && !message.transit ? null : (
          <View style={[styles.messageRow, polish.messageRow, message.role === 'user' && styles.userRow]}>
            {message.role === 'model' && messages[index - 1]?.role !== 'model' ? (
              <Text style={[polish.speaker, { color: isNight ? colors.goldLine : colors.green700 }]}>Panda</Text>
            ) : null}
            {message.text.trim() && !(message.role === 'model' && message.rideRequest && message.venues?.length) ? (
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
                  {message.text}
                </Text>
              </View>
            ) : null}
            {message.venues?.length ? (
              message.role === 'model' && message.rideRequest ? (
                <UberJourneyCard venue={message.venues[0]} colors={colors} />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.results}>
                  {message.venues.slice(0, message.newSelection ? 15 : PANDA_AI_VENUE_LIMIT).map((venue, venueIndex) => {
                    const liveMatch = liveVenues.find((candidate) => candidate.id === venue.id);
                    const cardVenue: AiVenue = {
                      ...venue,
                      latitude: venue.latitude ?? venue.location?.latitude ?? venue.location?.lat ?? venue.lat ?? liveMatch?.latitude,
                      longitude: venue.longitude ?? venue.location?.longitude ?? venue.location?.lng ?? venue.lng ?? liveMatch?.longitude,
                      distanceMeters:
                        typeof venue.distanceMeters === "number"
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
                      onMenu={() => void openAiVenueMenu(venue)}
                      onOpen={() => openAiVenue(venue)}
                    />
                  );
                  })}
                </ScrollView>
              )
            ) : null}
            {message.role === 'model' && message.newSelection && message.newOpeningsHasMore ? (
              <Pressable testID="ai-new-openings-next" accessibilityRole="button" accessibilityLabel="Show the next 15 new openings"
                disabled={sending} onPress={() => void sendMessage('Show me the next 15 new openings')}
                style={({ pressed }) => [styles.newOpeningsMore, { backgroundColor: colors.card, borderColor: colors.border }, (pressed || sending) && { opacity: 0.6 }]}>
                <Text style={[styles.newOpeningsMoreText, { color: colors.primary }]}>Discover the next 15</Text>
                <Feather name="arrow-right" size={15} color={colors.primary} />
              </Pressable>
            ) : null}
            {message.weeklyOpeningAlert ? (
              <Pressable testID="ai-mute-weekly-openings" accessibilityRole="button" accessibilityLabel="Mute weekly new opening alerts"
                onPress={() => void muteWeeklyOpeningAlerts()}
                style={({ pressed }) => [styles.newOpeningsMore, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.6 }]}> 
                <Text style={[styles.newOpeningsMoreText, { color: colors.mutedForeground }]}>Mute weekly alerts</Text>
              </Pressable>
            ) : null}
            {message.sources?.length ? (
              <View style={styles.aiEventSources}>
                <Text style={[styles.aiEventSourcesLabel, { color: isNight ? colors.goldLine : colors.green700 }]}>
                  {message.sourceLabel ?? 'LIVE SOURCES'}
                </Text>
                {message.sources.slice(0, 6).map((source) => (
                  <Pressable
                    key={source.url}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${source.title}`}
                    onPress={() => {
                      void Linking.openURL(source.url).catch(() =>
                        Alert.alert('Panda source', 'This source link could not be opened right now.'),
                      );
                    }}
                    style={({ pressed }) => [
                      styles.aiEventSourceLink,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      pressed && styles.iconPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.aiEventSourceIcon,
                        { backgroundColor: isNight ? colors.gold : colors.green600 },
                      ]}
                    >
                      <Feather name="link-2" size={15} color={isNight ? colors.foreground : colors.card} />
                    </View>
                    <View style={styles.aiEventSourceCopy}>
                      <Text numberOfLines={2} style={[styles.aiEventSourceTitle, { color: colors.foreground }]}>
                        {source.title}
                      </Text>
                      <Text numberOfLines={1} style={[styles.aiEventSourceDomain, { color: colors.mutedForeground }]}>
                        {source.domain || 'Source'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.aiEventSourceArrow,
                        { backgroundColor: isNight ? colors.background : colors.mint100 },
                      ]}
                    >
                      <Feather name="arrow-up-right" size={14} color={isNight ? colors.goldLine : colors.green700} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {message.weatherAttribution ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={message.weatherAttribution.label}
                onPress={() => {
                  void Linking.openURL(message.weatherAttribution!.url).catch(() =>
                    Alert.alert('Weather data credit', 'Panda could not open the weather attribution details right now.'),
                  );
                }}
                style={styles.weatherCredit}
              >
                <Feather name="cloud" size={11} color={colors.mutedForeground} />
                <Text style={[styles.weatherCreditText, { color: colors.mutedForeground }]}>
                  {message.weatherAttribution.label}
                </Text>
                <Feather name="external-link" size={10} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
            {message.transit ? (
              <AiTransitCard
                colors={colors}
                context={message.transit}
                refreshLive={message === [...messages].reverse().find(item => item.transit)}
                onDirections={() => openAiTransitDirections(message.transit as AiTransitContext)}
              />
            ) : null}
          </View>
        )}
      />

      <View style={styles.footer}>
      <ScrollView
        horizontal
        style={styles.suggestionRail}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.suggestions, { paddingBottom: 7 }]}
        keyboardShouldPersistTaps="handled"
      >
        {suggestionsWithPlanner.map((suggestion) => suggestion.label === 'Uber home' ? (
          <UberHomeSuggestion
            key={suggestion.label}
            colors={colors}
            isNight={isNight}
            onPress={() => void sendMessage('prompt' in suggestion ? suggestion.prompt : 'Uber home')}
          />
        ) : (
          <Pressable
            key={suggestion.label}
            accessibilityRole="button"
            accessibilityLabel={suggestion.planner ? `Plan my ${timeMode}` : suggestion.label}
            testID={'prompt' in suggestion ? 'panda-ai-new-openings-shortcut' : undefined}
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
              {suggestion.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View
        style={[
          styles.composer, polish.composer,
          {
             backgroundColor: isNight ? colors.input : colors.background,
            borderTopColor: colors.border,
            // Only one bottom offset at a time: the keyboard (owned by the
            // KeyboardAvoidingView padding) OR the absolute tab bar / safe inset.
            paddingBottom: keyboardVisible
              ? 10
              : embedded
                ? 12 + embeddedTabBarHeight
                : Math.max(12, insets.bottom + 8),
          },
        ]}
      >
        <TextInput
          accessibilityLabel="Ask Panda a question"
          value={draft}
          onChangeText={setDraft}
          ref={inputRef}
          onSubmitEditing={() => void sendMessage()}
          submitBehavior="submit"
          blurOnSubmit={false}
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
          onPress={() => {
            void sendMessage();
            inputRef.current?.focus();
          }}
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
      </View>
    </KeyboardAvoidingView>
  );
}

export default function PandaAiRoute() {
  return <PandaAiScreen />;
}

function UberHomeSuggestion({
  colors,
  isNight,
  onPress,
}: {
  colors: ReturnType<typeof useColors>;
  isNight: boolean;
  onPress: () => void;
}) {
  const pulse = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.018, { duration: 1700 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Uber home"
        accessibilityHint="Uses your private saved Home destination. Review the estimate before continuing in Uber."
        onPress={onPress}
        testID="panda-ai-uber-home-shortcut"
        style={({ pressed }) => [styles.uberHomeSuggestion, pressed && styles.pressed]}
      >
        <LinearGradient
          colors={isNight ? [colors.gold, '#F6D17B'] : ['#0B6A4D', '#064E3B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.uberHomeGradient}
        >
          <Feather name="home" size={14} color={isNight ? colors.green950 : '#FFF8E5'} />
          <Text style={[styles.uberHomeText, { color: isNight ? colors.green950 : '#FFF8E5' }]}>Uber home</Text>
          <Feather name="arrow-up-right" size={13} color={isNight ? colors.green950 : colors.goldLine} />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function UberJourneyCard({ venue, colors }: { venue: AiVenue; colors: ReturnType<typeof useColors> }) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.max(260, Math.min(326, windowWidth - 40));
  const latitude = venue.latitude ?? venue.location?.latitude ?? venue.location?.lat ?? venue.lat;
  const longitude = venue.longitude ?? venue.location?.longitude ?? venue.location?.lng ?? venue.lng;
  const rideEstimate = buildUberEstimate({
    latitude,
    longitude,
    distanceMeters: venue.distanceMeters,
    driveDurationMinutes: venue.driveDurationMinutes,
    venueName: venue.name ?? 'Panda destination',
  });
  if (!rideEstimate) return null;

  const openUber = () => {
    void Linking.openURL(rideEstimate.deepLink).catch(() =>
      Alert.alert('Uber unavailable', 'Panda could not open Uber. You can still use Directions.'),
    );
  };
  const destinationAddress = venue.fullAddress || venue.address || 'Verified destination';
  const isSavedHome = venue.id === 'panda-saved-home';
  const addressLabel = isSavedHome ? 'Saved on this device · Private' : destinationAddress;

  return (
    <LinearGradient
      colors={[colors.green950, colors.green900, colors.green800]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.rideJourneyCard, { borderColor: colors.goldLine, width: cardWidth }]}
      testID="panda-ai-uber-journey-card"
    >
      <View style={styles.rideJourneyHeader}>
        <View style={[styles.rideJourneyIcon, { backgroundColor: colors.gold }]}>
          <Feather name="navigation" size={16} color={colors.green950} />
        </View>
        <View style={styles.rideJourneyHeaderCopy}>
          <Text style={[styles.rideJourneyEyebrow, { color: colors.goldLine }]}>PANDA RIDE · ESTIMATE ONLY</Text>
          <Text style={[styles.rideJourneyHeaderText, { color: colors.primaryForeground }]}>
            {isSavedHome ? 'Your way home' : 'Ride preview'}
          </Text>
        </View>
        <View style={[styles.rideJourneyBadge, { backgroundColor: 'rgba(255,226,153,0.14)', borderColor: 'rgba(255,226,153,0.3)' }]}>
          <Feather name="arrow-up-right" size={14} color={colors.goldLine} />
        </View>
      </View>

      <View style={[styles.rideJourneyRoute, { backgroundColor: 'rgba(255,255,255,0.075)', borderColor: 'rgba(255,255,255,0.13)' }]}>
        <View style={styles.rideJourneyRail}>
          <View style={[styles.rideJourneyPickupDot, { borderColor: colors.mint300 }]} />
          <View style={[styles.rideJourneyTrack, { backgroundColor: 'rgba(255,255,255,0.32)' }]} />
          <View style={[styles.rideJourneyDropDot, { backgroundColor: colors.gold }]} />
        </View>
        <View style={styles.rideJourneyStops}>
          <Text style={[styles.rideJourneyStopLabel, { color: colors.mint300 }]}>FROM · YOUR CURRENT LOCATION</Text>
          <Text style={[styles.rideJourneyStopLabel, { color: colors.goldLine, marginTop: 9 }]}>TO</Text>
          <Text style={[styles.rideJourneyDestination, { color: colors.primaryForeground }]}>{venue.name}</Text>
          <Text numberOfLines={1} style={[styles.rideJourneyAddress, { color: colors.mint100 }]}>{addressLabel}</Text>
        </View>
      </View>

      <View style={styles.rideJourneyStats}>
        <View style={styles.rideJourneyStat}>
          <Feather name="clock" size={13} color={colors.mint300} />
          <View>
            <Text style={[styles.rideJourneyStatLabel, { color: colors.mint300 }]}>DRIVE</Text>
            <Text style={[styles.rideJourneyStatValue, { color: colors.primaryForeground }]}>~{rideEstimate.minutes} min</Text>
          </View>
        </View>
        <View style={[styles.rideJourneyStat, styles.rideJourneyFare]}>
          <Feather name="credit-card" size={13} color={colors.goldLine} />
          <View>
            <Text style={[styles.rideJourneyStatLabel, { color: colors.goldLine }]}>PANDA ESTIMATE</Text>
            <Text style={[styles.rideJourneyFareValue, { color: colors.goldLine }]}>£{rideEstimate.minFare}–£{rideEstimate.maxFare}</Text>
          </View>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open Uber for ${venue.name}. Estimated ${rideEstimate.minutes} minutes, ${rideEstimate.label}.`}
        accessibilityHint="Opens Uber with this destination. Review the live fare there before confirming; no ride has been booked."
        onPress={openUber}
        testID="panda-ai-uber-journey-open"
        style={({ pressed }) => [
          styles.rideJourneyAction,
          { backgroundColor: colors.gold, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <Text style={[styles.rideJourneyActionText, { color: colors.green950 }]}>Open Uber · check live fare</Text>
        <Feather name="arrow-up-right" size={17} color={colors.green950} />
      </Pressable>
      <Text style={[styles.rideJourneyDisclaimer, { color: colors.mint100 }]}>
        Indicative only{rideEstimate.peakTime ? ' · includes £5 peak buffer' : ''} · No ride booked
      </Text>
    </LinearGradient>
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
  const photoVenue = aiVenueToVenue(venue);
  const scale = useSharedValue(1);
  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
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
          { backgroundColor: colors.card, borderColor: photoVenue?.promoted ? colors.goldDeep : colors.border, borderWidth: photoVenue?.promoted ? 2 : 1 },
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
            {photoVenue ? (
              <VenuePhoto
                venue={photoVenue}
                venueId={photoVenue.id}
                venueName={photoVenue.name}
                height={styles.resultHero.height}
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
              accessibilityLabel={venue.openingDesignation === 'panda-search-reported-new' ? `Check Google results for ${venue.name}` : `Read the opening report from ${venue.openingSourceName}`}
              accessibilityRole="link"
              onPress={onEvidence}
              style={styles.resultSourceLink}
            >
              <Feather name="file-text" size={11} color={colors.honeyInk} />
              <Text numberOfLines={1} style={[styles.resultStopLabel, { color: colors.honeyInk }]}>
                {venue.openingDesignation === 'panda-search-reported-new' ? 'GOOGLE RESULTS · VERIFY OPENING' : 'OPENING REPORTED'} · {formatOpeningReportDate(venue.openingReportedAt)} · {venue.openingSourceName}
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
              accessibilityHint="Panda's local estimate is not a live Uber quote. It includes an extra £5 planning buffer during weekday peak hours; Uber will show the live fare before you confirm."
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
                  {rideEstimate.peakTime
                    ? 'Includes an extra £5 peak buffer · Uber shows live fare'
                    : 'Indicative only · Uber shows the live fare'}
                </Text>
              </View>
              <Feather name="arrow-up-right" size={17} color={colors.mint300} />
            </Pressable>
          ) : null}
          <View style={styles.resultActions}>
            {photoVenue ? <ReserveButton venue={photoVenue} activitySurface="panda_ai" compact /> : null}
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
            {venue.id ? (
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
  context: initialContext,
  onDirections,
  refreshLive,
}: {
  colors: ReturnType<typeof useColors>;
  context: AiTransitContext;
  onDirections: () => void;
  refreshLive: boolean;
}) {
  const { coordinates } = useLiveVenues();
  const [context, setContext] = useState(initialContext);
  const [clock, setClock] = useState(Date.now());
  const [walking, setWalking] = useState<{ reason: string; duration?: number } | null>(null);
  useEffect(() => { setContext(initialContext); setWalking(null); }, [initialContext]);
  useFocusEffect(useCallback(() => {
    if (!refreshLive || !initialContext.venueId || !coordinates) return;
    let active = true;
    const refresh = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        const response = await fetch(`${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(initialContext.venueId!)}/transit?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}`);
        if (!response.ok) return;
        const next = await response.json() as AiTransitContext & {
          recommendation?: string; recommendationReason?: string;
          directWalk?: { durationMinutes: number } | null;
        };
        if (!active) return;
        if (next.recommendation === 'walk') {
          setWalking({ reason: next.recommendationReason || 'Check walking access in Google Maps', duration: next.directWalk?.durationMinutes });
        } else if (next.originStation && next.destinationStation) {
          setWalking(null);
          setContext({ ...initialContext, ...next });
        }
      } catch {
        // Retain the dated route; never label an expired prediction as live.
      } finally {
        if (active) setClock(Date.now());
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, [refreshLive, initialContext, coordinates?.latitude, coordinates?.longitude]));
  if (walking) {
    const venue = aiVenueToVenue(context.venue ?? { id: context.venueId, name: context.venueName });
    return <View style={[styles.aiTransitCard, { backgroundColor: colors.card, borderColor: colors.goldLine }]}>
      <Text style={[styles.aiTransitTitle, { color: colors.foreground }]}>
        {walking.duration ? 'Walking is the better option' : 'You’re very close'}
      </Text>
      <Text style={[styles.aiTransitWalk, { color: colors.green700 }]}>
        {walking.reason}{walking.duration ? ` · ${walking.duration} min walk` : ''}
      </Text>
      <Pressable onPress={() => {
        if (venue) void Linking.openURL(googleDirectionsUrl(venue, 'walking'))
          .catch(() => Alert.alert('Google Maps unavailable', 'Please check your maps app or browser.'));
      }} accessibilityRole="button" style={styles.aiTransitAction}>
        <Text style={[styles.aiTransitActionText, { color: colors.goldDeep }]}>Walk in Google Maps →</Text>
      </Pressable>
    </View>;
  }
  const transitSteps = context.transitRoute?.steps.filter(step => step.mode === 'TRANSIT') ?? [];
  const live = transitSteps.some(step => step.liveUpdatedAt &&
    clock - new Date(step.liveUpdatedAt).getTime() >= 0 &&
    clock - new Date(step.liveUpdatedAt).getTime() < 60000);
  const vehicle = transitSteps[0]?.vehicleType?.toUpperCase() ?? '';
  const symbol = vehicle === 'BUS' ? '🚌' : ['FERRY', 'BOAT'].includes(vehicle) ? '⛴' : '🚆';
  const vehicleLabel = vehicle === 'BUS' ? 'Bus' : ['FERRY', 'BOAT'].includes(vehicle) ? 'Boat' : 'Train';
  const hasRoute = Boolean(context.venueId && context.venueName && context.destinationStation);
  const walkLabel = context.venueWalk
    ? `${context.venueWalk.durationMinutes} min walk · ${
        context.venueWalk.distanceMeters < 1000
          ? `${Math.round(context.venueWalk.distanceMeters)} m`
          : `${(context.venueWalk.distanceMeters / 1000).toFixed(1)} km`
      }`
    : null;
  const routeLabel = context.transitRoute
    ? `${symbol} ${vehicleLabel} · ${context.transitRoute.durationMinutes} min · ${live ? 'live TfL' : 'Google route estimate'}`
    : null;

  return (
    <View style={[styles.aiTransitCard, { backgroundColor: colors.card, borderColor: colors.goldLine }]}>
      <View style={styles.aiTransitHeader}>
        <View style={[styles.aiTransitIcon, { backgroundColor: colors.mint100 }]}>
          <PandaIcon name="map" size={15} color={colors.green700} />
        </View>
        <View style={styles.aiTransitHeaderCopy}>
          <Text style={[styles.aiTransitEyebrow, { color: colors.green700 }]}>{live ? 'LIVE TRANSIT ANSWER' : 'TRANSIT ROUTE ESTIMATE'}</Text>
          <Text style={[styles.aiTransitTitle, { color: colors.foreground }]}>From your current location</Text>
        </View>
      </View>

      <View style={styles.aiTransitPoint}>
        <Text style={styles.aiTransitEmoji}>{symbol}</Text>
        <View style={styles.aiTransitPointCopy}>
          <Text style={[styles.aiTransitLabel, { color: colors.mutedForeground }]}>YOUR BOARDING STOP</Text>
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
                ALIGHTING STOP NEAR THE VENUE
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
          accessibilityLabel={`Get live directions to ${context.venueName} in Google Maps`}
          accessibilityRole="button"
          onPress={onDirections}
          style={({ pressed }) => [
            styles.aiTransitAction,
            { backgroundColor: colors.gold, borderColor: colors.goldLine },
            pressed && styles.pressed,
          ]}
        >
          <PandaIcon name="navigate" size={15} color={colors.goldDeep} />
          <Text style={[styles.aiTransitActionText, styles.embossedGoldText]}>Get directions in Google Maps</Text>
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
    minHeight: 0,
  },
  footer: {
    flexShrink: 0,
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
  newOpeningsMore: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 10, paddingHorizontal: 14, paddingVertical: 9 },
  newOpeningsMoreText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  aiEventSources: { gap: 8, marginTop: 10, width: '88%', maxWidth: 380 },
  aiEventSourcesLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1, marginBottom: 2 },
  aiEventSourceLink: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 11,
    width: '100%',
  },
  aiEventSourceIcon: { alignItems: 'center', borderRadius: 12, height: 36, justifyContent: 'center', width: 36 },
  aiEventSourceCopy: { flex: 1, minWidth: 0 },
  aiEventSourceTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 17 },
  aiEventSourceDomain: { fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 0.2, marginTop: 4 },
  aiEventSourceArrow: { alignItems: 'center', borderRadius: 10, height: 30, justifyContent: 'center', width: 30 },
  weatherCredit: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
    paddingVertical: 3,
  },
  weatherCreditText: { fontFamily: 'Inter_500Medium', fontSize: 8 },
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
  rideJourneyCard: {
    borderRadius: 23,
    borderWidth: 1,
    elevation: 6,
    marginTop: 8,
    overflow: 'hidden',
    padding: 13,
    shadowColor: '#071E18',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.17,
    shadowRadius: 12,
    width: 326,
  },
  rideJourneyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  rideJourneyIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  rideJourneyHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  rideJourneyEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 7,
    letterSpacing: 1.05,
  },
  rideJourneyHeaderText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  rideJourneyBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 27,
    justifyContent: 'center',
    width: 27,
  },
  rideJourneyRoute: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  rideJourneyRail: {
    alignItems: 'center',
    paddingTop: 2,
    width: 14,
  },
  rideJourneyPickupDot: {
    borderRadius: 6,
    borderWidth: 2,
    height: 9,
    width: 9,
  },
  rideJourneyTrack: {
    borderRadius: 2,
    height: 13,
    marginVertical: 2,
    width: 2,
  },
  rideJourneyDropDot: {
    borderRadius: 6,
    height: 9,
    width: 9,
  },
  rideJourneyStops: {
    flex: 1,
    paddingLeft: 6,
  },
  rideJourneyStopLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 7,
    letterSpacing: 0.75,
  },
  rideJourneyDestination: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 19,
    marginTop: 1,
  },
  rideJourneyAddress: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    lineHeight: 12,
    marginTop: 2,
  },
  rideJourneyStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
  },
  rideJourneyStat: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 39,
    paddingVertical: 3,
  },
  rideJourneyFare: {
    borderLeftColor: 'rgba(255,226,153,0.28)',
    borderLeftWidth: 1,
    paddingLeft: 10,
  },
  rideJourneyStatLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 6.5,
    letterSpacing: 0.9,
  },
  rideJourneyStatValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    marginTop: 2,
  },
  rideJourneyFareValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    marginTop: 2,
  },
  rideJourneyPeakNote: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rideJourneyPeakText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
  },
  rideJourneyAction: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
    minHeight: 43,
    paddingHorizontal: 13,
  },
  rideJourneyActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  rideJourneyDisclaimer: {
    fontFamily: 'Inter_500Medium',
    fontSize: 7,
    lineHeight: 10,
    marginTop: 6,
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
  uberHomeSuggestion: {
    borderColor: 'rgba(196,151,45,0.72)',
    borderRadius: 999,
    borderWidth: 1,
    elevation: 3,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
  },
  uberHomeGradient: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    minHeight: 39,
    paddingHorizontal: 13,
  },
  uberHomeText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.1 },
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
    flexShrink: 1,
    minWidth: 0,
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