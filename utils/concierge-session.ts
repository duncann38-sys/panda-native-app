/** Chat context stays in component memory, never in device storage or analytics. */
export function shownConciergeVenueIds(
  messages: Array<{ role: string; venues?: Array<{ id?: string }> }>,
): string[] {
  return [...new Set(messages.filter(message => message.role === 'model')
    .flatMap(message => message.venues ?? []).map(venue => venue.id)
    .filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(id)))]
    .slice(-500);
}

export function conciergeGreeting(name = '', date = new Date()): string {
  const firstName = name.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{M}'’-]/gu, '').slice(0, 35);
  const address = firstName ? `, ${firstName}` : '';
  const hour = date.getHours();
  if (hour < 5) return `Still up${address}? A late plan, a thought to untangle, or just a chat?`;
  if (hour < 12) return `Good morning${address}. A fresh day, and no need to have it all worked out. What’s on your mind?`;
  if (hour < 17) return `Good afternoon${address}. How’s your day going—making plans, or taking a moment for yourself?`;
  return `Good evening${address}. What would make the rest of your day a good one?`;
}
