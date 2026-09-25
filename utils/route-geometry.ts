export type MapCoordinate = { latitude: number; longitude: number };

export function distanceBetweenCoordinates(a: MapCoordinate, b: MapCoordinate): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const x = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(x)));
}

// Google Routes returns encoded polylines in five-decimal-degree precision.
// Reject malformed and oversized responses instead of drawing a misleading path.
export function decodeRoutePolyline(encoded: string): MapCoordinate[] {
  if (!encoded || encoded.length > 25000) return [];
  const coordinates: MapCoordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  function readDelta(): number | null {
    let value = 0;
    let shift = 0;
    while (index < encoded.length && shift <= 30) {
      const character = encoded.charCodeAt(index++) - 63;
      if (character < 0 || character > 63) return null;
      value |= (character & 0x1f) << shift;
      if (character < 0x20) return value & 1 ? ~(value >> 1) : value >> 1;
      shift += 5;
    }
    return null;
  }

  while (index < encoded.length && coordinates.length < 5000) {
    const latitudeDelta = readDelta();
    const longitudeDelta = readDelta();
    if (latitudeDelta === null || longitudeDelta === null) return [];
    latitude += latitudeDelta;
    longitude += longitudeDelta;
    const point = { latitude: latitude / 1e5, longitude: longitude / 1e5 };
    if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return [];
    coordinates.push(point);
  }
  return index === encoded.length && coordinates.length > 1 ? coordinates : [];
}