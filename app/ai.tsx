import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PandaLogo } from '@/components/PandaLogo';
import { PandaIcon } from '@/components/PandaIcon';
import { getPandaTimeEmoji, getPandaTimeLabel, getPandaTimeMode } from '@/constants/panda-time';
import { PANDA_PRODUCTION_API, PANDA_RUNTIME_API } from '@/constants/services';
import { venues as pandaVenues } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

type AiVenue = {
  id?: string;
  name?: string;
  type?: string;
  rating?: number;
  distanceMeters?: number;
  price?: string;
  website?: string;
  menuLink?: string;
  mapsUri?: string;
  photoName?: string;
  photoAttribution?: string;
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
};

type AiTransitStation = {
  id: string;
  name: string;
  address: string;
};

type AiRouteWalk = {
  distanceMeters: number;
  durationMinutes: number;
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
};

type AiTransitContext = {
  venueId?: string;
  venueName?: string;
  originStation: AiTransitStation;
  destinationStation?: AiTransitStation;
  originWalk?: AiRouteWalk | null;
  transitRoute?: {
    durationMinutes: number;
    distanceMeters: number;
    steps: AiTransitStep[];
  } | null;
  venueWalk?: {
    distanceMeters: number;
    durationMinutes: number;
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
const suggestions = ['Nearest station & directions', 'What’s open now?', 'Dinner tonight', 'Cocktails nearby', 'Cheap eats'];

function isTransitQuestion(text: string) {
  return /\b(station|tube|underground|train|transport|directions?|get there|how do i get)\b/i.test(text);
}

async function getCurrentLocation() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return { status: 'permission-denied' as const };

  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      status: 'ready' as const,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return { status: 'unavailable' as const };
  }
}

async function resolveTransitVenue(text: string, candidates: AiVenue[]) {
  const aiVenue = candidates.find((venue) => venue.id?.startsWith('ChI') && venue.name);
  if (aiVenue) return aiVenue;

  const normalizedText = text.toLocaleLowerCase('en-GB');
  const catalogVenue = [...pandaVenues]
    .sort((left, right) => right.name.length - left.name.length)
    .find((venue) => normalizedText.includes(venue.name.toLocaleLowerCase('en-GB')));
  if (catalogVenue) {
    return enrichAiVenue({
      id: catalogVenue.id,
      name: catalogVenue.name,
      type: catalogVenue.type,
      rating: Number.parseFloat(catalogVenue.rating),
      price: catalogVenue.price,
      openNow: catalogVenue.openNow,
    });
  }

  try {
    const response = await fetch(
      `${PANDA_RUNTIME_API}/api/partner/venues?query=${encodeURIComponent(text.slice(0, 120))}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      results?: Array<{ id: string; name: string; category: string }>;
    };
    const result = payload.results?.[0];
    if (!result) return null;
    return enrichAiVenue({ id: result.id, name: result.name, type: result.category });
  } catch {
    return null;
  }
}

async function enrichAiVenue(venue: AiVenue): Promise<AiVenue> {
  if (!venue.id || !venue.id.startsWith('ChI')) return venue;

  try {
    const response = await fetch(
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
  const { prompt: promptParam } = useLocalSearchParams<{ prompt?: string | string[] }>();
  const initialPrompt = Array.isArray(promptParam) ? promptParam[0]?.trim() ?? '' : promptParam?.trim() ?? '';
  const androidBottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 24) : 0;
  const tabBarClearance =
    embedded && Platform.OS !== 'ios' ? (Platform.OS === 'web' ? 84 : 78 + androidBottomInset) : 0;
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

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(timer);
  }, [messages, sending]);

  useEffect(() => {
    return () => {
      voiceRef.current?.abort?.();
    };
  }, []);

  const sendMessage = async (text = draft) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const nextMessages = [...messages, { role: 'user' as const, text: trimmed }];
    setMessages(nextMessages);
    setDraft('');
    setSending(true);

    try {
      const response = await fetch(PANDA_AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  'You are Panda, a warm, concise London going-out concierge. Reply in two short helpful sentences. Recommend real places returned by the venue search when available. Do not invent opening hours, addresses, station names, or routes. For station and directions questions, say you are checking the customer’s live location; the app will append verified Google transit data.',
              },
            ],
          },
          contents: nextMessages.map((message) => ({
            role: message.role,
            parts: [{ text: message.text }],
          })),
          generationConfig: { temperature: 0.85, maxOutputTokens: 700 },
        }),
      });
      const data = (await response.json()) as { text?: string; venues?: AiVenue[] };
      if (!response.ok) throw new Error('Panda AI request failed');
      let enrichedVenues = await Promise.all((data.venues ?? []).slice(0, 8).map(enrichAiVenue));
      const baseReply =
        data.text?.trim() || 'I’m not sure I caught that. Try asking for a place, mood, or time of day.';
      const verifiedHours = enrichedVenues
        .filter((venue) => venue.name && venue.todayHours)
        .slice(0, 3)
        .map((venue) => `${venue.name} — ${venue.todayHours}`)
        .join('; ');
      let transit: AiTransitContext | undefined;
      let transitNote = '';

      if (isTransitQuestion(trimmed)) {
        const currentLocation = await getCurrentLocation();
        if (currentLocation.status === 'permission-denied') {
          transitNote = 'Allow location access and I can find your nearest station and map the journey in Panda.';
        } else if (currentLocation.status === 'unavailable') {
          transitNote = 'I couldn’t get your current location, so I can’t safely identify your nearest station yet.';
        } else {
          const venue = await resolveTransitVenue(trimmed, enrichedVenues);
          if (venue?.id && venue.name) {
            if (!enrichedVenues.some((item) => item.id === venue.id)) {
              enrichedVenues = [venue, ...enrichedVenues].slice(0, 8);
            }
            const transitResponse = await fetch(
              `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(venue.id)}/transit?latitude=${encodeURIComponent(currentLocation.latitude)}&longitude=${encodeURIComponent(currentLocation.longitude)}`,
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
              transit = {
                venueId: venue.id,
                venueName: venue.name,
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
              transitNote = `Your nearest station is ${liveTransit.originStation.name}. For ${venue.name}, use ${liveTransit.destinationStation.name}. ${transitText} ${walkText}`;
            } else {
              transitNote = 'I couldn’t load live station information for that venue right now.';
            }
          } else {
            const stationResponse = await fetch(
              `${PANDA_RUNTIME_API}/api/partner/transit/nearest?latitude=${encodeURIComponent(currentLocation.latitude)}&longitude=${encodeURIComponent(currentLocation.longitude)}`,
              { headers: { Accept: 'application/json' } },
            );
            if (stationResponse.ok) {
              const nearest = (await stationResponse.json()) as { station: AiTransitStation };
              transit = { originStation: nearest.station };
              transitNote = `Your nearest station right now is ${nearest.station.name}. Tell me where you’re heading and I’ll map the journey in Panda.`;
            } else {
              transitNote = 'I couldn’t find a live nearby station right now.';
            }
          }
        }
      }

      const replyParts = isTransitQuestion(trimmed) ? [] : [baseReply];
      if (!isTransitQuestion(trimmed) && verifiedHours && /\b(open|opening|close|closing|hours|time)\b/i.test(trimmed)) {
        replyParts.push(`Today’s verified hours: ${verifiedHours}.`);
      }
      if (transitNote) replyParts.push(transitNote);
      const replyText = replyParts.join('\n\n');
      setMessages((current) => [
        ...current,
        {
          role: 'model',
          text: replyText,
          venues: enrichedVenues,
          transit,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: 'model',
          text: 'I couldn’t reach the Panda kitchen just now. Check your connection and try again.',
        },
      ]);
    } finally {
      setSending(false);
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
    router.push({
      pathname: '/map',
      params: {
        directionsVenueId: transit.venueId,
        transitOriginName: transit.originStation.name,
        transitDestinationName: transit.destinationStation.name,
        transitOriginWalkMinutes: transit.originWalk?.durationMinutes.toString() ?? '',
        transitOriginWalkDistance: transit.originWalk?.distanceMeters.toString() ?? '',
        transitDurationMinutes: transit.transitRoute?.durationMinutes.toString() ?? '',
        transitDistanceMeters: transit.transitRoute?.distanceMeters.toString() ?? '',
        transitSteps: transit.transitRoute?.steps?.length
          ? JSON.stringify(transit.transitRoute.steps)
          : '',
        transitWalkMinutes: transit.venueWalk?.durationMinutes.toString() ?? '',
        transitWalkDistance: transit.venueWalk?.distanceMeters.toString() ?? '',
      },
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          onPress={() =>
            setMessages([
              {
                role: 'model',
                text: getPandaGreeting(),
              },
            ])
          }
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
                {message.venues.slice(0, 8).map((venue, venueIndex) => (
                  <AiVenueCard key={`${venue.id ?? venue.name}-${venueIndex}`} venue={venue} colors={colors} />
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
            paddingBottom: Math.max(12, insets.bottom + 8) + tabBarClearance,
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

function AiVenueCard({ venue, colors }: { venue: AiVenue; colors: ReturnType<typeof useColors> }) {
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
        <View style={styles.resultActions}>
          {venue.mapsUri ? (
            <Pressable
              onPress={() => Linking.openURL(venue.mapsUri as string)}
              style={[styles.resultPrimaryAction, { backgroundColor: colors.gold, borderColor: colors.goldLine }]}
            >
              <PandaIcon name="navigate" size={12} color={colors.goldDeep} />
              <Text style={[styles.resultActionText, { color: colors.goldDeep }]}>Directions</Text>
            </Pressable>
          ) : null}
          {venue.website || venue.menuLink ? (
            <Pressable onPress={() => Linking.openURL((venue.menuLink || venue.website) as string)}>
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
          <Text style={[styles.aiTransitActionText, { color: colors.goldDeep }]}>Get directions in Panda</Text>
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
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 14,
    paddingTop: 10,
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