export const PANDA_PRODUCTION_API = 'https://panda-ai-proxy.vercel.app';
export const PANDA_DISCOVERY_API = PANDA_PRODUCTION_API;
// Venue activity belongs to the Partner event store, not the AI proxy.
export const PANDA_PARTNER_ACTIVITY_API = 'https://panda-partners-api.vercel.app';

// Replit serves the Expo preview only; every native API request goes to Panda's
// GitHub-backed Vercel services in both preview and installed builds.
export const PANDA_RUNTIME_API = PANDA_PRODUCTION_API;