import { useCallback, useEffect, useRef, useState } from 'react';
import { PANDA_PRODUCTION_API } from '@/constants/services';
import { useLiveVenues } from '@/context/live-venues';
import type { Venue } from '@/data/venues';
import { hasDatedOpeningEvidence } from '@/utils/ai-openings';
import { distanceBetween } from '@/utils/venue-actions';

type NewVenue = {
  id?: string; name?: string; address?: string; fullAddress?: string;
  type?: string; lat?: number; lng?: number; distanceMeters?: number;
  photoName?: string; photoCount?: number; photoAttribution?: string;
  photoNames?: Array<{ name: string; attribution: string }>;
  rating?: number; ratingCount?: number; price?: string; openNow?: boolean;
  website?: string; phone?: string; todayHours?: string;
  openingDesignation?: string; openingSourceName?: string; openingSourceUrl?: string;
  openingReportedAt?: string; openingDate?: string; openingEvidence?: string;
};
type NewResponse = {
  newOpeningsSearch?: boolean; venues?: NewVenue[]; text?: string;
  status?: string; radiusKm?: number; area?: string;
};

function card(
  venue: NewVenue,
  origin: { latitude: number; longitude: number },
): Venue | null {
  if (!hasDatedOpeningEvidence(venue) || !venue.name || !venue.id
    || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return null;
  const distanceMeters = Number.isFinite(venue.distanceMeters)
    ? venue.distanceMeters!
    : distanceBetween(origin, { latitude: venue.lat, longitude: venue.lng });
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) return null;
  const mapsUri = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name)}&query_place_id=${encodeURIComponent(venue.id)}`;
  return {
    id: venue.id, name: venue.name, neighborhood: venue.address || 'Nearby',
    category: 'Restaurant', type: venue.type || 'Restaurant',
    distance: distanceMeters < 1000 ? `${Math.round(distanceMeters)} m` : `${(distanceMeters / 1000).toFixed(1)} km`,
    distanceMeters, walkingTime: 'See directions', rating: venue.rating?.toFixed(1) || '',
    ratingCount: venue.ratingCount || 0, price: venue.price || '',
    description: `Recently opened · source: ${venue.openingSourceName}.`,
    hours: venue.todayHours || '', feature: 'New opening',
    fullAddress: venue.fullAddress || venue.address || '',
    latitude: venue.lat, longitude: venue.lng, source: 'google_places',
    sourceAttribution: 'Google Places', openNow: venue.openNow === true,
    website: venue.website || '', phone: venue.phone || '', mapsUri,
    premium: false, banging: false, promoted: false, photoName: venue.photoName,
    photoCount: venue.photoCount, photoNames: venue.photoNames,
    photoAttributions: venue.photoAttribution ? [venue.photoAttribution] : [],
    openingSourceName: venue.openingSourceName,
    openingSourceUrl: venue.openingSourceUrl,
    openingDate: venue.openingDate,
    openingReportedAt: venue.openingReportedAt,
    openingDesignation: venue.openingDesignation,
    openingEvidence: venue.openingEvidence,
  };
}

/** Exactly one selection per mount or explicit refresh; Back does not reshuffle. */
export function useNewRestaurants() {
  const { coordinates, refreshLocation } = useLiveVenues();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('idle');
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
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
      const response = await fetch(`${PANDA_PRODUCTION_API}/api/panda-ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({ venuesOnly: true, newOpeningsOnly: true,
          location: { lat: point.latitude, lng: point.longitude } }),
      });
      const data = await response.json() as NewResponse;
      if (request !== sequence.current) return;
      if (data.newOpeningsSearch !== true) {
        throw new Error('The updated New feed has not been released on Panda’s API yet.');
      }
      if (!response.ok) throw new Error(data.text || 'The New selection could not be verified. Please try again.');
       const candidates = data.venues || [];
       if (candidates.length > 100) throw new Error('The opening search returned too many results. Please refresh.');
       const result = candidates.map(venue => card(venue, point))
         .filter((venue): venue is Venue => venue !== null)
         .slice(0, 20);
      setVenues(result);
      setText(data.text || '');
      setStatus(data.status || 'unavailable');
      setRadiusKm(data.radiusKm || null);
      setArea(data.area || null);
    } catch (failure) {
      if (request !== sequence.current) return;
      // Preserve the existing visit's cards if an explicit refresh fails.
      setError(failure instanceof Error && failure.name !== 'AbortError'
        ? failure.message : 'The New selection took too long. Please try again.');
    } finally {
      clearTimeout(timer);
      if (request === sequence.current) { pending.current = false; setLoading(false); }
    }
  }, [coordinates, refreshLocation]);
  const initialLoad = useRef(refresh);
  useEffect(() => {
    void initialLoad.current();
    return () => { sequence.current++; pending.current = false; controller.current?.abort(); };
  }, []);
  return { venues, loading, text, error, status, radiusKm, area, refresh };
}
