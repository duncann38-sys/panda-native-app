import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PANDA_PRODUCTION_API } from '@/constants/services';
import { useLiveVenues } from '@/context/live-venues';
import { useAuth } from '@/context/auth';
import type { Venue } from '@/data/venues';
import { hasDatedOpeningEvidence } from '@/utils/ai-openings';

type NewVenue = {
  id?: string; name?: string; address?: string; fullAddress?: string;
  type?: string; lat?: number; lng?: number; distanceMeters?: number;
  photoName?: string; photoCount?: number; photoAttribution?: string;
  photoNames?: Array<{ name: string; attribution: string }>;
  rating?: number | null; ratingCount?: number; price?: string; priceLevel?: string | null; openNow?: boolean;
  website?: string; phone?: string; todayHours?: string;
  openingDesignation?: string; openingSourceName?: string; openingSourceUrl?: string;
  openingReportedAt?: string; openingDate?: string; openingEvidence?: string;
  editorialNote?: string; city?: string; country?: string;
};
type NewResponse = {
  newOpeningsSearch?: boolean; venues?: NewVenue[]; text?: string;
  status?: string; area?: string; city?: string; country?: string; citySlug?: string;
  totalCount?: number; offset?: number; nextOffset?: number; limit?: number; hasMore?: boolean;
};
type SavedCursor = { citySlug: string; nextOffset: number; seenPlaceIds: string[] };
const CURSOR_KEY = 'panda.new-openings.feed.v1';
const MAX_SEEN = 120;

function validCursor(raw: string | null): SavedCursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedCursor>;
    if (typeof value.citySlug !== 'string' || !value.citySlug || !Number.isSafeInteger(value.nextOffset)
      || Number(value.nextOffset) < 0) return null;
    return { citySlug: value.citySlug, nextOffset: Number(value.nextOffset),
      seenPlaceIds: Array.isArray(value.seenPlaceIds) ? [...new Set(value.seenPlaceIds.filter((id): id is string => typeof id === 'string' && id.length <= 255))].slice(-MAX_SEEN) : [] };
  } catch { return null; }
}

function card(venue: NewVenue): Venue | null {
  if (!hasDatedOpeningEvidence(venue) || !venue.name || !venue.id
    || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng) || !Number.isFinite(venue.distanceMeters)) return null;
  const distanceMeters = venue.distanceMeters!;
  const mapsUri = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(venue.name)
    + '&query_place_id=' + encodeURIComponent(venue.id);
  const openingDateLabel = venue.openingDate ? new Date(venue.openingDate + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return {
    id: venue.id, name: venue.name, neighborhood: venue.address || [venue.city, venue.country].filter(Boolean).join(', '),
    category: 'Restaurant', type: venue.type || 'Restaurant',
    distance: distanceMeters < 1000 ? Math.round(distanceMeters) + ' m' : (distanceMeters / 1000).toFixed(1) + ' km',
    distanceMeters, walkingTime: 'See directions', rating: venue.rating?.toFixed(1) || '',
    ratingCount: venue.ratingCount || 0, price: venue.price || '',
    description: [openingDateLabel ? 'Opened ' + openingDateLabel : 'Recently opened', venue.editorialNote].filter(Boolean).join(' · '),
    hours: venue.todayHours || '', feature: 'New Opening',
    fullAddress: venue.fullAddress || venue.address || '',
    latitude: venue.lat, longitude: venue.lng, source: 'google_places',
    sourceAttribution: 'Google Places', openNow: venue.openNow === true,
    website: venue.website || '', phone: venue.phone || '', mapsUri,
    premium: false, banging: false, promoted: false, photoName: venue.photoName || '',
    photoCount: Number(venue.photoCount || 0), photoNames: venue.photoNames || [],
    photoAttributions: venue.photoAttribution ? [venue.photoAttribution] : [],
    openingSourceName: venue.openingSourceName, openingSourceUrl: venue.openingSourceUrl,
    openingDate: venue.openingDate, openingReportedAt: venue.openingReportedAt,
    openingDesignation: venue.openingDesignation, openingEvidence: venue.openingEvidence,
  };
}

/** City-keyed local cursor: guests get the same no-repeat paging as signed-in users. */
export function useNewRestaurants() {
  const { coordinates, refreshLocation } = useLiveVenues();
  const { account, getIdToken } = useAuth();
  const storageKey = account?.uid ? CURSOR_KEY + ':' + account.uid : CURSOR_KEY + ':guest';
  const [venues, setVenues] = useState<Venue[]>([]);
  const venuesRef = useRef<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('idle');
  const [city, setCity] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const citySlug = useRef('');
  const nextOffset = useRef(0);
  const seenPlaceIds = useRef<string[]>([]);
  const syncedUserCity = useRef('');

  const load = useCallback(async (reset: boolean) => {
    if (pending.current) return;
    pending.current = true;
    const request = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => abort.abort(), 30_000);
    try {
      const point = coordinates || (await refreshLocation(true)).coordinates;
      if (request !== sequence.current) return;
      if (!point) throw new Error('Allow Panda to use your location, then try again.');
      let saved: SavedCursor | null = null;
      if (!reset && !citySlug.current && venuesRef.current.length === 0) {
        try { saved = validCursor(await AsyncStorage.getItem(storageKey)); } catch { saved = null; }
      }
      let offset = reset ? 0 : citySlug.current ? nextOffset.current : saved?.nextOffset || 0;
      const fetchPage = async (pageOffset: number, excludedPlaceIds: string[] = []) => {
        const response = await fetch(PANDA_PRODUCTION_API + '/api/discovery/new-openings', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: abort.signal,
          body: JSON.stringify({ location: { lat: point.latitude, lng: point.longitude }, offset: pageOffset, limit: 15, excludedPlaceIds }),
        });
        const data = await response.json() as NewResponse;
        if (!response.ok) throw new Error(data.text || 'Panda could not verify new openings. Please try again.');
        if (data.newOpeningsSearch !== true) throw new Error('Panda’s verified New Openings service is not available yet.');
        return data;
      };
      const savedExclusions = !reset && offset === 0 && saved?.citySlug ? saved.seenPlaceIds : [];
      let data = await fetchPage(offset, savedExclusions);
      if (!reset && offset > 0 && saved?.citySlug && data.citySlug && saved.citySlug !== data.citySlug) {
        offset = 0;
        data = await fetchPage(0, []);
      }
      if (request !== sequence.current) return;
      const rawVenues = data.venues || [];
      const mapped = rawVenues.map(card).filter((venue): venue is Venue => venue !== null);
      const replace = reset || offset === 0 || citySlug.current !== data.citySlug;
      const existing = new Set(replace ? [] : venuesRef.current.map(venue => venue.id));
      const fresh = mapped.filter(venue => !existing.has(venue.id));
      const nextVenues = replace ? fresh : [...venuesRef.current, ...fresh];
      venuesRef.current = nextVenues;
      setVenues(nextVenues);
      const currentSlug = data.citySlug || '';
      if (account?.uid && currentSlug) {
        const syncKey = account.uid + '|' + currentSlug;
        if (syncedUserCity.current !== syncKey) {
          void getIdToken().then(async idToken => {
            const response = await fetch(PANDA_PRODUCTION_API + '/api/new-openings-notifications', {
              method: 'POST', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
              body: JSON.stringify({ citySlug: currentSlug }),
            });
            if (response.ok) syncedUserCity.current = syncKey;
          }).catch(() => {});
        }
      }
      citySlug.current = currentSlug;
      nextOffset.current = data.nextOffset || 0;
      setHasMore(data.hasMore === true);
      setText(data.text || '');
      setStatus(data.status || 'unavailable');
      setCity(data.city || null);
      setCountry(data.country || null);
      setArea(data.area || null);
      if (replace) seenPlaceIds.current = [];
      seenPlaceIds.current = [...new Set([...seenPlaceIds.current, ...fresh.map(venue => venue.id)])].slice(-MAX_SEEN);
      if (citySlug.current) {
        const cursor: SavedCursor = { citySlug: citySlug.current, nextOffset: nextOffset.current, seenPlaceIds: seenPlaceIds.current };
        AsyncStorage.setItem(storageKey, JSON.stringify(cursor)).catch(() => {});
      }
    } catch (failure) {
      if (request !== sequence.current) return;
      setError(failure instanceof Error && failure.name !== 'AbortError'
        ? failure.message : 'The verified openings search took too long. Please try again.');
    } finally {
      clearTimeout(timer);
      if (request === sequence.current) { pending.current = false; setLoading(false); }
    }
  }, [account?.uid, coordinates, getIdToken, refreshLocation, storageKey]);

  const refresh = useCallback(() => load(true), [load]);
  const loadNext = useCallback(() => load(false), [load]);
  const initialLoad = useRef(refresh);
  useEffect(() => {
    void initialLoad.current();
    return () => { sequence.current++; pending.current = false; controller.current?.abort(); };
  }, []);
  return { venues, loading, text, error, status, city, country, area, hasMore, refresh, loadNext };
}
