export type TflDisruption = {
  lineId: string;
  lineName: string;
  status: string;
  reason: string;
  severity: number;
};

function normalized(value: string): string {
  return value.toLowerCase().replace(/\bline\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findTflRouteDisruption(routeLines: string[], payload: unknown): TflDisruption | null {
  if (!Array.isArray(payload) || !routeLines.length) return null;
  const requested = routeLines.map(normalized).filter(Boolean);
  const disruptions: TflDisruption[] = [];

  for (const item of payload) {
    if (!item || typeof item !== 'object') continue;
    const line = item as Record<string, unknown>;
    const lineId = typeof line.id === 'string' ? line.id : '';
    const lineName = typeof line.name === 'string' ? line.name : '';
    if (!lineName || !requested.some((name) => name === normalized(lineName) || name.includes(normalized(lineName)) || normalized(lineName).includes(name))) continue;
    const statuses = Array.isArray(line.lineStatuses) ? line.lineStatuses : [];
    for (const rawStatus of statuses) {
      if (!rawStatus || typeof rawStatus !== 'object') continue;
      const status = rawStatus as Record<string, unknown>;
      const severity = typeof status.statusSeverity === 'number' ? status.statusSeverity : 10;
      if (severity >= 10) continue;
      const statusText = typeof status.statusSeverityDescription === 'string'
        ? status.statusSeverityDescription
        : 'Service disruption';
      const reason = typeof status.reason === 'string' ? status.reason : '';
      disruptions.push({ lineId, lineName, status: statusText, reason, severity });
    }
  }

  return disruptions.sort((left, right) => left.severity - right.severity)[0] ?? null;
}
