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
  if (hour < 5) return `Still out${address}? Something to eat, a last drink, or a sensible journey home?`;
  if (hour < 12) return `Good morning${address}. Coffee first, or shall we make a proper breakfast of it?`;
  if (hour < 17) return `Good afternoon${address}. A long lunch, a quiet glass, or plans for later?`;
  return `Good evening${address}. Dinner, drinks, or a little of both? Tell me what you fancy.`;
}
