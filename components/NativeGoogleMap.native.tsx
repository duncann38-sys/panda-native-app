import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { decodeRoutePolyline } from '@/utils/route-geometry';
import type { NativeGoogleMapProps } from './NativeGoogleMap';

const LONDON: LatLng = { latitude: 51.49, longitude: -0.14 };

function location(venue: Venue): LatLng | null {
  if (
    typeof venue.latitude !== 'number' || typeof venue.longitude !== 'number'
    || !Number.isFinite(venue.latitude) || !Number.isFinite(venue.longitude)
    || Math.abs(venue.latitude) > 90 || Math.abs(venue.longitude) > 180
  ) return null;
  return { latitude: venue.latitude, longitude: venue.longitude };
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
  const visible = useMemo(() => venues.flatMap((venue) => {
    const coordinate = location(venue);
    return coordinate ? [{ venue, coordinate }] : [];
  }), [venues]);
  const selected = selectedVenue ? location(selectedVenue) : null;
  const route = routeVenues.flatMap((venue) => {
    const coordinate = location(venue);
    return coordinate ? [coordinate] : [];
  });
  const mappedSegments = useMemo(
    () => routeSegments.map((segment) => ({ ...segment, points: decodeRoutePolyline(segment.encoded) }))
      .filter((segment) => segment.points.length > 1),
    [routeSegments],
  );
  const mappedPoints = mappedSegments.flatMap((segment) => segment.points);
  const stationPoints = stations ? [stations.origin.coordinate, stations.destination.coordinate] : [];
  const routeKey = [
    ...route.map(({ latitude, longitude }) => `${latitude},${longitude}`),
    ...stationPoints.map(({ latitude, longitude }) => `${latitude},${longitude}`),
    ...routeSegments.map(({ encoded }) => `${encoded.length}:${encoded.slice(-12)}`),
  ].join('|');
  const focusKey = selected ? `${selected.latitude},${selected.longitude}` : '';

  useEffect(() => {
    if (!ready || !map.current) return;
    if (followUser && userCoordinates) {
      map.current.animateToRegion({
        ...userCoordinates,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      }, 450);
      return;
    }
    if ((route.length || mappedPoints.length) && userCoordinates) {
      map.current.fitToCoordinates([userCoordinates, ...route, ...stationPoints, ...mappedPoints], {
        edgePadding: { top: 115, right: 65, bottom: 360, left: 65 },
        animated: true,
      });
    } else if (route.length + stationPoints.length + mappedPoints.length > 1) {
      map.current.fitToCoordinates([...route, ...stationPoints, ...mappedPoints], {
        edgePadding: { top: 115, right: 65, bottom: 360, left: 65 },
        animated: true,
      });
    } else {
      const target = route[0] ?? selected ?? userCoordinates ?? LONDON;
      map.current.animateToRegion({
        ...target,
        latitudeDelta: route.length ? 0.018 : 0.028,
        longitudeDelta: route.length ? 0.018 : 0.028,
      }, 350);
    }
  }, [ready, routeKey, focusKey, followUser, userCoordinates?.latitude, userCoordinates?.longitude]);

  return (
    <MapView
      ref={map}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      style={[StyleSheet.absoluteFill, { backgroundColor }]}
      initialRegion={{
        ...(userCoordinates ?? selected ?? LONDON),
        latitudeDelta: 0.028,
        longitudeDelta: 0.028,
      }}
      onMapReady={() => setReady(true)}
      showsUserLocation={Boolean(userCoordinates)}
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
      {stations ? (
        <>
          <Marker
            coordinate={stations.origin.coordinate}
            title={stations.origin.name}
            description="Your nearest station"
            pinColor={colors.green700}
          />
          <Marker
            coordinate={stations.destination.coordinate}
            title={stations.destination.name}
            description="Station near the venue"
            pinColor={colors.gold}
          />
        </>
      ) : null}
      {visible.map(({ venue, coordinate }) => {
        const isSelected = selectedVenue?.id === venue.id;
        return (
          <Marker
            key={`${venue.id}-${isSelected}`}
            coordinate={coordinate}
            title={venue.name}
            description={venue.fullAddress}
            onPress={() => onSelectVenue(venue)}
            tracksViewChanges={false}
          >
            <View style={[
              styles.pin,
              { backgroundColor: isSelected ? colors.green600 : colors.green800 },
            ]}>
              <Text style={[styles.pinText, { color: colors.primaryForeground }]}>
                {venue.price || '●'}
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