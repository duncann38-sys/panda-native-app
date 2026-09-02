export const PANDA_PRODUCTION_API = 'https://panda-ai-proxy.vercel.app';

const previewDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();

export const PANDA_RUNTIME_API = previewDomain
  ? `https://${previewDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
  : PANDA_PRODUCTION_API;