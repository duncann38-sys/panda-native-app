export const PANDA_PRODUCTION_API = 'https://panda-ai-proxy.vercel.app';
export const PANDA_DISCOVERY_API = PANDA_PRODUCTION_API;
// Venue activity uses Panda's independent Partner event store.
export const PANDA_PARTNER_ACTIVITY_API = 'https://panda-partners-api.vercel.app';

// Panda Native always uses the external Panda service. Replit is development tooling only.
export const PANDA_RUNTIME_API = PANDA_PRODUCTION_API;
