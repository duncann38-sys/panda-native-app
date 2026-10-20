import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VenuePhoto } from '@/components/VenuePhoto';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { PANDA_PRODUCTION_API } from '@/constants/services';
import { DiscoverVenueCard } from '@/components/DiscoverVenueCard';

let nextProfileRequestAt = 0;
let profileQueue: Promise<void> = Promise.resolve();
let blockedProfileMessage: string | null = null;
const profileCache = new Map<string, Record<string, unknown>>();
const pendingProfiles = new Map<string, Promise<Record<string, unknown>>>();

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

function fetchLiveProfile(placeId: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (blockedProfileMessage) return Promise.reject(new Error(blockedProfileMessage));
  const cached = profileCache.get(placeId);
  if (cached) return Promise.resolve(cached);
  const pending = pendingProfiles.get(placeId);
  if (pending) return pending;

  const request = profileQueue.then(async () => {
    if (blockedProfileMessage) throw new Error(blockedProfileMessage);
    if (signal.aborted) throw new Error('Profile request cancelled');
    const waitForSlot = Math.max(0, nextProfileRequestAt - Date.now());
    if (waitForSlot) await pause(waitForSlot, signal);
    if (signal.aborted) throw new Error('Profile request cancelled');
    nextProfileRequestAt = Date.now() + 400;

    const response = await fetch(
      `${PANDA_PRODUCTION_API}/api/partner/venues/${encodeURIComponent(placeId)}/profile`,
      { headers: { Accept: 'application/json' }, signal },
    );
    const profile = await response.json().catch(() => ({})) as Record<string, unknown>;
    const providerMessage = typeof profile.error === 'string' ? profile.error : '';
    const dailyQuotaExceeded = response.status === 429
      && /GetPlaceRequest.*per day|per day.*GetPlaceRequest|quota exceeded.*per day/i.test(providerMessage);
    if (dailyQuotaExceeded) {
      blockedProfileMessage = 'Google daily venue-details quota reached. Raise Places API (New) “GetPlaceRequest per day” or wait for its reset.';
      throw new Error(blockedProfileMessage);
    }
    if (response.status === 429 || profile.limited === true || profile.dataMode === 'independent_baseline') {
      blockedProfileMessage = typeof profile.availabilityMessage === 'string'
        ? profile.availabilityMessage
        : 'Google venue details are temporarily unavailable. The saved venue index is intact; live details can be retried shortly.';
      throw new Error(blockedProfileMessage);
    }
    if (!response.ok) {
      if (response.status >= 500) {
        blockedProfileMessage = 'Google venue details are temporarily unavailable. The saved 200-ID category feed is still intact.';
      }
      throw new Error(`Venue profile request failed: ${response.status}`);
    }
    if (typeof profile.name !== 'string' || !profile.name.trim()) {
      throw new Error('Google did not return venue details for this place.');
    }
    if (profileCache.size >= 400) profileCache.delete(profileCache.keys().next().value as string);
    profileCache.set(placeId, profile);
    return profile;
  });
  profileQueue = request.then(() => undefined, () => undefined);
  pendingProfiles.set(placeId, request);
  void request.finally(() => {
    if (pendingProfiles.get(placeId) === request) pendingProfiles.delete(placeId);
  }).catch(() => {});
  return request;
}

export function SuggestionRow({
  venue,
  saved,
  isVisible = true,
  onPress,
  onToggleSaved,
}: {
  venue: Venue;
  saved: boolean;
  isVisible?: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
}) {
  const colors = useColors();
  const [hydratedVenue, setHydratedVenue] = useState<Venue | null>(null);
  const [profileFailureMessage, setProfileFailureMessage] = useState<string | null>(null);

  useEffect(() => {
    setHydratedVenue(null);
    setProfileFailureMessage(null);
    const hasNameAndCover = Boolean(venue.name.trim() && venue.photoName?.trim());
    if (!isVisible || !venue.detailsDeferred || venue.id.startsWith('osm:') || hasNameAndCover) return;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15_000);
    void fetchLiveProfile(venue.id, controller.signal).then((profile) => {
      const photos = Array.isArray(profile.photoNames) ? profile.photoNames.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const photo = item as Record<string, unknown>;
        return typeof photo.name === 'string'
          ? [{ name: photo.name, attribution: typeof photo.attribution === 'string' ? photo.attribution : '' }]
          : [];
      }) : [];
      const display = {
        ...venue,
        name: profile.name,
        fullAddress: typeof profile.address === 'string' ? profile.address : venue.fullAddress,
        type: typeof profile.primaryType === 'string' ? profile.primaryType : venue.type,
        rating: typeof profile.rating === 'number' ? profile.rating.toFixed(1) : venue.rating,
        ratingCount: typeof profile.ratingCount === 'number' ? profile.ratingCount : venue.ratingCount,
        price: typeof profile.price === 'string' ? profile.price : venue.price,
        openNow: typeof profile.openNow === 'boolean' ? profile.openNow : venue.openNow,
        hours: typeof profile.todayHours === 'string' ? profile.todayHours : venue.hours,
        phone: typeof profile.phone === 'string' ? profile.phone : venue.phone,
        website: typeof profile.website === 'string' ? profile.website : venue.website,
        latitude: typeof profile.latitude === 'number' ? profile.latitude : venue.latitude,
        longitude: typeof profile.longitude === 'number' ? profile.longitude : venue.longitude,
        photoNames: photos,
        photoName: photos[0]?.name,
        photoAttributions: photos[0]?.attribution ? [photos[0].attribution] : [],
        photoCount: photos.length,
        detailsDeferred: false,
        cached: false,
      } as Venue;
      setHydratedVenue(display);
    }).catch((error: unknown) => {
      if (timedOut) {
        setProfileFailureMessage('Google venue details took too long to load. Try again after the details quota is available.');
      } else if (!controller.signal.aborted) {
        setProfileFailureMessage(error instanceof Error ? error.message : 'Google venue details are unavailable.');
      }
    });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [venue.id, venue.detailsDeferred, isVisible]);

  const card = hydratedVenue ?? venue;
  const cardTitle = card.name.trim()
    ? card.name
    : card.detailsDeferred
      ? profileFailureMessage ? 'Venue details paused' : 'Loading venue…'
      : card.name;

  return <DiscoverVenueCard
    venue={{ ...card, name: cardTitle }}
    saved={saved}
    onPress={onPress}
    onToggleSaved={onToggleSaved}
    warning={profileFailureMessage}
  />;
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
    minHeight: 76,
    overflow: 'hidden',
    padding: 6,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 11,
  },
  promoted: {
    borderWidth: 2,
    elevation: 5,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.19,
    shadowRadius: 13,
  },
  photo: {
    borderWidth: 0,
    borderRadius: 14,
    height: 64,
    overflow: 'hidden',
    width: 64,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 2,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleWrap: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  name: {
    flex: 1,
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: -0.25,
  },
  promotedLabel: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    marginTop: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  promotedLabelText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 7,
    letterSpacing: 0.65,
  },
  heart: {
    alignItems: 'center',
    height: 27,
    justifyContent: 'center',
    width: 27,
  },
  addressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 3,
  },
  address: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 3,
    minWidth: 0,
  },
  open: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    fontWeight: '700',
  },
  meta: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  type: {
    flex: 1,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  iconPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.9 }],
  },
  goldRail: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 5,
  },
  goldGlow: {
    borderRadius: 999,
    height: 110,
    opacity: 0.38,
    position: 'absolute',
    right: -52,
    top: -55,
    width: 110,
  },
});