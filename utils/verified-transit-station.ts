export function isVerifiedTransitStation(value: unknown): value is {id:string;name:string;latitude:number;longitude:number} {
  if (!value || typeof value !== 'object') return false;
  const station = value as { id?: unknown; name?: unknown; latitude?: unknown; longitude?: unknown };
  return typeof station.id === 'string' && /^[A-Za-z0-9_-]{3,256}$/.test(station.id)
    && typeof station.name === 'string' && Boolean(station.name.trim())
    && !/^(?:(?:tube|train|rail|railway|subway|underground|transit)\s+)?station$/i.test(station.name.trim())
    && typeof station.latitude === 'number' && Number.isFinite(station.latitude) && Math.abs(station.latitude) <= 90
    && typeof station.longitude === 'number' && Number.isFinite(station.longitude) && Math.abs(station.longitude) <= 180;
}
