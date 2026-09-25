import type { Venue } from '@/data/venues';

export type NativeGoogleMapProps = {
  backgroundColor: string;
  venues: Venue[];
  selectedVenue?: Venue;
  onSelectVenue: (venue: Venue) => void;
  routeVenues: Venue[];
  userCoordinates: { latitude: number; longitude: number } | null;
  followUser?: boolean;
  routeSegments?: { encoded: string; mode: 'walking' | 'transit' }[];
  stations?: { origin: { name: string; coordinate: { latitude: number; longitude: number } }; destination: { name: string; coordinate: { latitude: number; longitude: number } } } | null;
};

declare const NativeGoogleMap: (props: NativeGoogleMapProps) => React.ReactElement;
export default NativeGoogleMap;