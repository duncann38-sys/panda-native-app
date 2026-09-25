import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { PandaLogo } from '@/components/PandaLogo';
import { PandaIcon } from '@/components/PandaIcon';
import { getPandaTimeEmoji, getPandaTimeLabel, getPandaTimeMode } from '@/constants/panda-time';
import { PANDA_PRODUCTION_API, PANDA_RUNTIME_API } from '@/constants/services';
import { useLiveVenues } from '@/context/live-venues';
import { venues as pandaVenues, type Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

type AiVenue = {
  id?: string;
  name?: string;
  address?: string;
  fullAddress?: string;
  type?: string;
  rating?: number;
  distanceMeters?: number;
  price?: string;
  website?: string;
  menuLink?: string;
  mapsUri?: string;
  photoName?: string;
  photoAttribution?: string;
  photoCount?: number;
  openNow?: boolean;
  todayHours?: string;
};

type GoogleAiVenueProfile = {
  openNow: boolean | null;
  todayHours: string | null;
  googleMapsUrl: string;
  website: string | null;
};

type Message = {
  role: 'user' | 'model';
  text: string;
  venues?: AiVenue[];
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
const suggestions = ['Nearest station & directions', 'What’s open now?', 'Dinner tonight', 'Cocktails nearby', 'Cheap eats'];

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

function requiresCurrentLocation(text: string) {
  if (
    isTransitQuestion(text)
    || /\b(near(?:by)?|near me|around (?:me|here)|local|closest|nearest|recommend(?:ation)?|suggest(?:ion)?|find me|looking for|where can i|where should i|where to go|where am i|what(?:'s|’s| is) happening here|what(?:'s|’s| is) around here|places?|spots?|somewhere|venues?|restaurants?|caf(?:e|é)s?|coffee|pubs?|bars?|food|eat|dinner|lunch|breakfast|brunch|drinks?|open now|open tonight|tonight|this evening|how far|this area|this place|here)\b/i.test(text)
  ) {
    return true;
  }

  const normalizedText = text.trim();
  const clearlyGeneral =
    /^(?:hi|hello|hey|thanks|thank you|cheers|goodbye|bye|ok|okay)[!.?]*$/i.test(normalizedText)
    || /^(?:what (?:is|are|does|did|was|were)|who (?:is|are|was|were)|when\b|why\b|how (?:do|does|did|is|are|to)\b|explain\b|define\b|translate\b|summari[sz]e\b|write\b|draft\b|calculate\b|solve\b|tell me (?:about|a joke)\b)/i.test(normalizedText);

  // Panda is primarily a local concierge: ambiguous follow-ups should keep
  // using real location rather than silently returning empty nearby results.
  return !clearlyGeneral;
}

function isNearestStationOnly(text: string) {
  return /\b(nearest|closest|local)\s+(?:tube|underground|train|rail)?\s*station\b/i.test(text)
    && !/\b(?:to|for)\s+[a-z0-9]/i.test(text);
}

async function resolveTransitVenue(text: string, candidates: AiVenue[]) {
  const aiVenue = candidates.find((venue) => venue.id?.startsWith('ChI') && venue.name);
  if (aiVenue) return aiVenue;

  const normalizedText = text.toLocaleLowerCase('en-GB');
  const catalogVenue = [...pandaVenues]
    .sort((left, right) => right.name.length - left.name.length)
    .find((venue) => normalizedText.includes(venue.name.toLocaleLowerCase('en-GB')));
  if (catalogVenue) {
    return {
      id: catalogVenue.id,
      name: catalogVenue.name,
      type: catalogVenue.type,
      rating: Number.parseFloat(catalogVenue.rating),
      price: catalogVenue.price,
      openNow: catalogVenue.openNow,
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
    const result = payload.results?.[0];
    if (!result) return null;
    return { id: result.id, name: result.name, type: result.category };
  } catch {
    return null;
  }
}

async function enrichAiVenue(venue: AiVenue): Promise<AiVenue> {
  if (!venue.id || !venue.id.startsWith('ChI')) return venue;

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
    };
  } catch {
    return venue;
  }
}

function aiVenueToVenue(venue: AiVenue): Venue | null {
  if (!venue.id || !venue.name) return null;
  const normalizedType = venue.type?.toLowerCase() ?? '';
  const category: Venue['category'] =
    normalizedType.includes('coffee') || normalizedType.includes('cafe')
      ? 'Coffee'
      : normalizedType.includes('pub')
        ? 'Pub'
        : normalizedType.includes('bar')
          ? 'Bar'
          : 'Restaurant';
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
    phone: '',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: venue.photoAttribution ? [venue.photoAttribution] : [],
  };
}

function getPandaGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour < 5) {
    return 'Still out, Duncan? I’m Panda 🐼 — looking for something to eat or somewhere that’s still open? We don’t do delivery just yet, but I can recommend open spots nearby.';
  }

  if (hour < 12) {
    return 'Good morning, Duncan! I’m Panda 🐼 — fancy breakfast, coffee, or an early start? I’ll find the best spots right by you.';
  }

  if (hour < 16) {
    return 'Good afternoon, Duncan! I’m Panda 🐼 — fancy lunch, a coffee, or somewhere to start the afternoon? I’ll find the best spots right by you.';
  }

  return 'Good evening, Duncan! I’m Panda 🐼 — tell me what you fancy (dinner, a cheeky cocktail, or somewhere lively) and I’ll find the best spots right by you.';
}

export function PandaAiScreen({ embedded = false }: { embedded?: boolean }) {
  const timeMode = getPandaTimeMode();
  const isNight = timeMode === 'night';
  const colors = useColors(isNight ? 'dark' : undefined);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coordinates, refreshLocation } = useLiveVenues();
  const { prompt: promptParam } = useLocalSearchParams<{ prompt?: string | string[] }>();
  const initialPrompt = Array.isArray(promptParam) ? promptParam[0]?.trim() ?? '' : promptParam?.trim() ?? '';
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: getPandaGreeting(),
    },
  ]);
  const suggestionsWithPlanner = [
    { label: `${getPandaTimeEmoji(timeMode)} Plan my ${getPandaTimeLabel(timeMode)}`, planner: true },
    ...suggestions.map((suggestion) => ({ label: suggestion, planner: false })),
  ];
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const voiceRef = useRef<VoiceRecognition | null>(null);
  const finalTranscriptRef = useRef('');
  const submittedPromptRef = useRef('');
  const requestSequenceRef = useRef(0);
  const currentRequestRef = useRef(0);
  const chatGenerationRef = useRef(0);
  const primaryPendingRef = useRef(false);
  const primaryControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(timer);
  }, [messages, sending]);

  useEffect(() => {
    return () => {
      voiceRef.current?.abort?.();
      currentRequestRef.current = ++requestSequenceRef.current;
      chatGenerationRef.current += 1;
      primaryControllerRef.current?.abort();
    };
  }, []);

  const sendMessage = async (text = draft) => {
    const trimmed = text.trim();
    if (!trimmed || primaryPendingRef.current) return;

    const requestId = ++requestSequenceRef.current;
    currentRequestRef.current = requestId;
    primaryPendingRef.current = true;
    const chatGeneration = chatGenerationRef.current;
    const conversation = [...messages, { role: 'user' as const, text: trimmed }];
    const needsCurrentLocation = requiresCurrentLocation(trimmed);
    setMessages([
      ...conversation,
      ...(needsCurrentLocation
        ? [{ role: 'model' as const, text: 'Getting your current location…', requestId }]
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
      if (!requestCoordinates) {
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
            systemInstruction: {
              parts: [
                {
                  text:
                    'You are Panda, a very polite British going-out concierge with a cheeky, playful sense of humour. Be warm, witty and useful, never rude or over-familiar. Reply concisely in two or three short sentences. Recommend only real places returned by the venue search. Do not invent opening hours, addresses, station names, routes or offers. For station and directions questions, say you are checking the customer’s live location; the app will append verified Google transit data.',
                },
              ],
            },
            contents: conversation.map((message) => ({
              role: message.role,
              parts: [{ text: message.text }],
            })),
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
      const data = (await response.json()) as { text?: string; venues?: AiVenue[] };
      if (!response.ok) throw new Error('Panda AI request failed');
      if (!isCurrentRequest()) return;

      const isTransit = isTransitQuestion(trimmed);
      const eligibleVenues = (data.venues ?? [])
        .filter((venue) => Boolean(venue.photoName) && Number(venue.photoCount) >= 5)
        .sort((left, right) => Number(left.distanceMeters ?? Infinity) - Number(right.distanceMeters ?? Infinity))
        .slice(0, PANDA_AI_VENUE_LIMIT);
      const initialVenues = isNearestStationOnly(trimmed) ? [] : eligibleVenues;
      const baseReply =
        data.text?.trim() || 'I’m not sure I caught that. Try asking for a place, mood, or time of day.';

      // Show the primary answer and venue results before any optional live-data lookups.
      if (needsCurrentLocation) {
        updateResult((message) => ({
          ...message,
          text: isTransit ? 'Checking live station and route information…' : baseReply,
          venues: initialVenues,
        }));
      } else {
        setMessages((current) => [
          ...current,
          { role: 'model', requestId, text: baseReply, venues: initialVenues },
        ]);
      }
      primaryPendingRef.current = false;
      setSending(false);
      primaryControllerRef.current = null;

      void Promise.all(initialVenues.map(enrichAiVenue))
        .then((enrichedVenues) => {
          const verifiedHours = enrichedVenues
            .filter((venue) => venue.name && venue.todayHours)
            .slice(0, 3)
            .map((venue) => `${venue.name} — ${venue.todayHours}`)
            .join('; ');
          updateResult((message) => ({
            ...message,
            venues: enrichedVenues,
            text:
              !isTransit && verifiedHours && /\b(open|opening|close|closing|hours|time)\b/i.test(trimmed)
                ? `${baseReply}\n\nToday’s verified hours: ${verifiedHours}.`
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
            const venue = isNearestStationOnly(trimmed)
              ? null
              : await resolveTransitVenue(trimmed, initialVenues);
            if (!isCurrentRequest()) return;

            if (venue?.id && venue.name) {
              const transitResponse = await fetchWithTimeout(
                `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(venue.id)}/transit?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`,
                { headers: { Accept: 'application/json' } },
                TRANSIT_REQUEST_TIMEOUT_MS,
              );
              if (!transitResponse.ok) {
                updateResult((message) => ({
                  ...message,
                  text: 'I couldn’t load live station information for that venue right now.',
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
              if (!liveTransit.originStation || !liveTransit.destinationStation) {
                updateResult((message) => ({
                  ...message,
                  text: 'I couldn’t load live station information for that venue right now.',
                }));
                return;
              }
              const transit: AiTransitContext = {
                venueId: venue.id,
                venueName: venue.name,
                venue,
                originStation: liveTransit.originStation,
                destinationStation: liveTransit.destinationStation,
                originWalk: liveTransit.originWalk,
                transitRoute: liveTransit.transitRoute,
                venueWalk: liveTransit.venueWalk,
              };
              const walkText = liveTransit.venueWalk
                ? `It’s a ${liveTransit.venueWalk.durationMinutes}-minute walk from there to the venue.`
                : 'I’ll keep the final walk visible in the route panel.';
              const transitText = liveTransit.transitRoute
                ? `The live station-to-station journey is about ${liveTransit.transitRoute.durationMinutes} minutes.`
                : 'I’ll show the verified station context while live route details are unavailable.';
              updateResult((message) => ({
                ...message,
                text: `Your nearest station is ${liveTransit.originStation.name}. For ${venue.name}, use ${liveTransit.destinationStation.name}. ${transitText} ${walkText}`,
                venues: message.venues?.some((item) => item.id === venue.id)
                  ? message.venues
                  : [venue, ...(message.venues ?? [])].slice(0, PANDA_AI_VENUE_LIMIT),
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
            if (!nearest.station) {
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

  const startVoiceInput = () => {
    if (sending) return;

    if (isListening) {
      voiceRef.current?.stop();
      return;
    }

    if (Platform.OS !== 'web') {
      Alert.alert(
        'Voice input',
        'Voice input is available in the Panda web preview. Native microphone support will be connected when the mobile build uses a speech-recognition module.',
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

      setDraft(transcript.trim());
      if (finalTranscript.trim()) finalTranscriptRef.current = finalTranscript.trim();
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      voiceRef.current = null;
      if (event.error !== 'aborted') {
        Alert.alert('Voice input error', 'I could not hear that clearly. Please try again or type your question.');
      }
    };
    recognition.onend = () => {
      setIsListening(false);
      voiceRef.current = null;
      const spokenText = finalTranscriptRef.current.trim();
      if (spokenText) {
        setDraft('');
        void sendMessage(spokenText);
      }
    };

    voiceRef.current = recognition;
    setIsListening(true);
    recognition.start();
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
    const venue = aiVenueToVenue(aiVenue);
    if (!venue) return;
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
          if (liveTransit.originStation && liveTransit.destinationStation) {
            openAiTransitDirections({
              venueId: venue.id,
              venueName: venue.name,
              venue: aiVenue,
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

  const clearChat = () => {
    currentRequestRef.current = ++requestSequenceRef.current;
    chatGenerationRef.current += 1;
    primaryPendingRef.current = false;
    primaryControllerRef.current?.abort();
    primaryControllerRef.current = null;
    setSending(false);
    setDraft('');
    setMessages([
      {
        role: 'model',
        text: getPandaGreeting(),
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={0}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { backgroundColor: colors.green800, paddingTop: insets.top + 12 }]}>
        {embedded ? (
          <View style={styles.headerIcon} />
        ) : (
          <Pressable
            accessibilityLabel="Close Panda AI"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.headerIcon}
          >
            <PandaIcon name="arrow-left" size={22} color={colors.primaryForeground} />
          </Pressable>
        )}
        <View style={[styles.pandaAvatar, { backgroundColor: colors.ivory }]}>
          <PandaLogo size={42} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.primaryForeground }]}>Panda AI</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mint300 }]}>Your night-out concierge</Text>
        </View>
        <Pressable
          accessibilityLabel="Clear Panda AI chat"
          accessibilityRole="button"
          onPress={clearChat}
          style={styles.headerIcon}
        >
          <PandaIcon name="trash" size={19} color={colors.primaryForeground} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={[styles.messages, { paddingBottom: 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((message, index) => (
          <View key={`${message.role}-${index}`} style={[styles.messageRow, message.role === 'user' && styles.userRow]}>
            <View
              style={[
                styles.bubble,
                {
                   backgroundColor: message.role === 'user' ? (isNight ? colors.gold : colors.green600) : colors.card,
                  borderBottomRightRadius: message.role === 'user' ? 7 : 20,
                  borderBottomLeftRadius: message.role === 'model' ? 7 : 20,
                },
              ]}
            >
               <Text
                 style={[
                   styles.bubbleText,
                   { color: message.role === 'user' && isNight ? colors.accentForeground : message.role === 'user' ? colors.primaryForeground : colors.foreground },
                 ]}
               >
                {message.text}
              </Text>
            </View>
            {message.venues?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.results}>
                {message.venues.slice(0, PANDA_AI_VENUE_LIMIT).map((venue, venueIndex) => (
                  <AiVenueCard
                    key={`${venue.id ?? venue.name}-${venueIndex}`}
                    venue={venue}
                    colors={colors}
                    onDirections={() => void openAiVenueDirections(venue)}
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
                ))}
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
        {sending ? (
          <View style={styles.messageRow}>
            <View style={[styles.bubble, { backgroundColor: colors.card }]}>
              <ActivityIndicator color={colors.green700} />
            </View>
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
                : sendMessage(suggestion.label)
            }
            style={({ pressed }) => [
              styles.suggestion,
              {
                backgroundColor: suggestion.planner ? colors.gold : colors.card,
                borderColor: suggestion.planner ? colors.goldLine : colors.border,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.suggestionText, { color: suggestion.planner ? colors.accentForeground : colors.foreground }]}>
              {suggestion.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View
        style={[
          styles.composer,
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
          accessibilityLabel="Ask Panda a question"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => sendMessage()}
          placeholder="Ask Panda anything…"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="send"
           style={[
             styles.input,
             { backgroundColor: isNight ? colors.green950 : colors.card, borderColor: colors.border, color: colors.foreground },
           ]}
        />
        <Pressable
          accessibilityLabel={isListening ? 'Stop listening to Panda' : 'Talk to Panda'}
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
              backgroundColor: colors.green900,
              opacity: draft.trim() && !sending ? 1 : 0.46,
            },
            pressed && styles.pressed,
          ]}
        >
          <PandaIcon
            name="send"
            size={20}
            color={colors.primaryForeground}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function PandaAiRoute() {
  return <PandaAiScreen />;
}

function AiVenueCard({
  venue,
  colors,
  onDirections,
  onMenu,
  onOpen,
}: {
  venue: AiVenue;
  colors: ReturnType<typeof useColors>;
  onDirections: () => void;
  onMenu: () => void;
  onOpen: () => void;
}) {
  const photoUri = venue.photoName
    ? `${PANDA_PRODUCTION_API}/api/place-photo?name=${encodeURIComponent(venue.photoName)}&max=500`
    : null;
  const distance =
    typeof venue.distanceMeters === 'number'
      ? venue.distanceMeters < 1000
        ? `${Math.round(venue.distanceMeters)} m`
        : `${(venue.distanceMeters / 1000).toFixed(1)} km`
      : null;
  const openingText = venue.todayHours
    ? `${venue.openNow === true ? 'Open now' : venue.openNow === false ? 'Closed' : 'Today'} · ${venue.todayHours}`
    : venue.openNow === true
      ? 'Open now'
      : venue.openNow === false
        ? 'Closed'
        : null;

  return (
    <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        accessibilityLabel={`Open ${venue.name ?? 'Panda recommendation'}`}
        accessibilityHint="Opens live venue details"
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => pressed && styles.pressed}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} contentFit="cover" style={styles.resultPhoto} />
        ) : (
          <View style={[styles.resultPhotoFallback, { backgroundColor: colors.ivory }]}>
            <PandaLogo size={48} />
          </View>
        )}
        <View style={styles.resultBody}>
          <Text numberOfLines={1} style={[styles.resultName, { color: colors.foreground }]}>
            {venue.name ?? 'Panda pick'}
          </Text>
          <Text numberOfLines={1} style={[styles.resultMeta, { color: colors.mutedForeground }]}>
            {venue.rating ? `★ ${venue.rating}` : venue.type ?? 'Local venue'}
            {distance ? ` · ${distance}` : ''}
            {venue.price ? ` · ${venue.price}` : ''}
          </Text>
          {openingText ? (
            <View style={[styles.resultHours, { backgroundColor: colors.honeySoft, borderColor: colors.goldLine }]}>
              <PandaIcon name="clock" size={12} color={colors.honeyInk} />
              <Text numberOfLines={2} style={[styles.resultHoursText, { color: colors.honeyInk }]}>
                {openingText}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={[styles.resultActions, styles.resultActionsInset]}>
        <View style={styles.resultActions}>
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
            <Pressable accessibilityRole="button" onPress={onMenu}>
              <Text style={[styles.resultActionText, { color: colors.green700 }]}>Menu</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
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
    height: 38,
    justifyContent: 'center',
    width: 36,
  },
  pandaAvatar: {
    alignItems: 'center',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    width: 42,
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
  resultCard: {
    borderRadius: 17,
    borderWidth: 1,
    overflow: 'hidden',
    width: 190,
  },
  resultPhoto: {
    height: 96,
    width: '100%',
  },
  resultPhotoFallback: {
    alignItems: 'center',
    height: 96,
    justifyContent: 'center',
    width: '100%',
  },
  resultBody: {
    padding: 10,
  },
  resultName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  resultMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    marginTop: 5,
  },
  resultActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 9,
  },
  resultActionsInset: {
    marginTop: 0,
    paddingBottom: 11,
    paddingHorizontal: 11,
  },
  embossedGoldText: {
    color: '#171006',
    textShadowColor: 'rgba(255, 247, 196, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  resultHours: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginTop: 7,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  resultHoursText: {
    flex: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    lineHeight: 12,
  },
  resultPrimaryAction: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  resultActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
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