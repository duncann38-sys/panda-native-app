import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { decodeRoutePolyline, mapRouteFitPoints } from '@/utils/route-geometry';
import {
  normalizeDiscoveryVenue,
  normalizeMapCoordinate,
} from '@/utils/discovery-data-safety';
import type { NativeGoogleMapProps } from './NativeGoogleMap';

const LONDON: LatLng = { latitude: 51.49, longitude: -0.14 };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeVenueEntry(value: unknown): { venue: Venue; coordinate: LatLng } | null {
  const venue = normalizeDiscoveryVenue(value);
  const coordinate = venue ? normalizeMapCoordinate(venue) : null;
  return venue && coordinate ? { venue, coordinate } : null;
}

function safeVenueEntries(value: unknown): Array<{ venue: Venue; coordinate: LatLng }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    const entry = safeVenueEntry(candidate);
    if (!entry || seen.has(entry.venue.id)) return [];
    seen.add(entry.venue.id);
    return [entry];
  });
}

function safeStations(value: unknown): NativeGoogleMapProps['stations'] {
  const item = record(value);
  const origin = record(item?.origin);
  const destination = record(item?.destination);
  const originCoordinate = normalizeMapCoordinate(origin?.coordinate);
  const destinationCoordinate = normalizeMapCoordinate(destination?.coordinate);
  const originName = text(origin?.name);
  const destinationName = text(destination?.name);
  if (!originCoordinate || !destinationCoordinate || !originName || !destinationName) return null;
  return {
    origin: { name: originName, coordinate: originCoordinate },
    destination: { name: destinationName, coordinate: destinationCoordinate },
  };
}

export default function NativeGoogleMap({
  backgroundColor,
  venues,
  selectedVenue,
  onSelectVenue,
  routeVenues,
  userCoordinates,
  followUser = false,
  routeSegments = [],
  stations,
}: NativeGoogleMapProps) {
  const colors = useColors();
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const visible = useMemo(() => safeVenueEntries(venues), [venues]);
  const safeRouteVenues = useMemo(() => safeVenueEntries(routeVenues), [routeVenues]);
  const safeSelectedVenue = safeVenueEntry(selectedVenue);
  const selected = safeSelectedVenue?.coordinate ?? null;
  const safeUserCoordinates = normalizeMapCoordinate(userCoordinates);
  const safeRouteSegments = useMemo(() => (
    Array.isArray(routeSegments)
      ? routeSegments.flatMap((value) => {
        const segment = record(value);
        if (
          !segment
          || typeof segment.encoded !== 'string'
          || (segment.mode !== 'walking' && segment.mode !== 'transit')
        ) return [];
        return [{ encoded: segment.encoded, mode: segment.mode }];
      })
      : []
  ), [routeSegments]);
  const safeStationData = safeStations(stations);
  const route = safeRouteVenues.map(({ coordinate }) => coordinate);
  const mappedSegments = useMemo(
    () => safeRouteSegments.map((segment) => ({ ...segment, points: decodeRoutePolyline(segment.encoded) }))
      .filter((segment) => segment.points.length > 1),
    [safeRouteSegments],
  );
  const mappedPoints = mappedSegments.flatMap((segment) => segment.points);
  const stationPoints = safeStationData ? [safeStationData.origin.coordinate, safeStationData.destination.coordinate] : [];
  const routeKey = [
    ...route.map(({ latitude, longitude }) => `${latitude},${longitude}`),
    ...stationPoints.map(({ latitude, longitude }) => `${latitude},${longitude}`),
    ...safeRouteSegments.map(({ encoded }) => `${encoded.length}:${encoded.slice(-12)}`),
  ].join('|');
  const focusKey = selected ? `${selected.latitude},${selected.longitude}` : '';

  useEffect(() => {
    if (!ready || !map.current) return;
    if (followUser && safeUserCoordinates) {
      map.current.animateToRegion({
        ...safeUserCoordinates,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      }, 450);
      return;
    }
    if ((route.length || mappedPoints.length) && safeUserCoordinates) {
      const points = mapRouteFitPoints(route, stationPoints, mappedPoints, safeUserCoordinates);
      if (points.length > 1) map.current.fitToCoordinates(points, {
        edgePadding: { top: 115, right: 65, bottom: 360, left: 65 },
        animated: true,
      });
    } else if (route.length + stationPoints.length + mappedPoints.length > 1) {
      map.current.fitToCoordinates([...route, ...stationPoints, ...mappedPoints], {
        edgePadding: { top: 115, right: 65, bottom: 360, left: 65 },
        animated: true,
      });
    } else {
      const target = route[0] ?? selected ?? safeUserCoordinates ?? LONDON;
      map.current.animateToRegion({
        ...target,
        latitudeDelta: route.length ? 0.018 : 0.028,
        longitudeDelta: route.length ? 0.018 : 0.028,
      }, 350);
    }
  }, [ready, routeKey, focusKey, followUser, safeUserCoordinates?.latitude, safeUserCoordinates?.longitude]);

  return (
    <MapView
      ref={map}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      style={[StyleSheet.absoluteFill, { backgroundColor }]}
      initialRegion={{
        ...(safeUserCoordinates ?? selected ?? LONDON),
        latitudeDelta: 0.028,
        longitudeDelta: 0.028,
      }}
      onMapReady={() => setReady(true)}
      showsUserLocation={Boolean(safeUserCoordinates)}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      rotateEnabled={false}
    >
      {mappedSegments.map((segment, index) => (
        <Polyline
          key={`route-${index}`}
          coordinates={segment.points}
          strokeColor={segment.mode === 'transit' ? colors.goldDeep : colors.green700}
          strokeWidth={5}
          zIndex={2}
        />
      ))}
      {safeStationData ? (
        <>
          <Marker
            coordinate={safeStationData.origin.coordinate}
            title={safeStationData.origin.name}
            description="Your nearest station"
            pinColor={colors.green700}
          />
          <Marker
            coordinate={safeStationData.destination.coordinate}
            title={safeStationData.destination.name}
            description="Station near the venue"
            pinColor={colors.gold}
          />
        </>
      ) : null}
      {visible.map(({ venue, coordinate }) => {
        const isSelected = safeSelectedVenue?.venue.id === venue.id;
        const routeIndex = safeRouteVenues.findIndex((stop) => stop.venue.id === venue.id);
        return (
          <Marker
            key={`${venue.id}-${isSelected}-${routeIndex}`}
            coordinate={coordinate}
            title={venue.name}
            description={safeRouteVenues.length > 1 && routeIndex >= 0 ? `Stop ${routeIndex + 1} · ${venue.fullAddress || venue.name}` : venue.fullAddress}
            onPress={() => onSelectVenue(venue)}
            tracksViewChanges={false}
          >
            <View style={[
              styles.pin,
              { backgroundColor: isSelected ? colors.green600 : colors.green800 },
            ]}>
              <Text style={[styles.pinText, { color: colors.primaryForeground }]}>
                {safeRouteVenues.length > 1 && routeIndex >= 0 ? String(routeIndex + 1) : venue.price || '●'}
              </Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    elevation: 5,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 38,
    paddingHorizontal: 6,
  },
  pinText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
});