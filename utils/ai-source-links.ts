export type AiSource = {
  title: string;
  url: string;
  domain: string;
};

export function safeAiSources(value: unknown): AiSource[] {
  if (!Array.isArray(value)) return [];
  const result: AiSource[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, 6)) {
    if (!item || typeof item !== 'object') continue;
    const source = item as { title?: unknown; url?: unknown };
    if (typeof source.url !== 'string') continue;
    try {
      const parsed = new URL(source.url);
      if (
        parsed.protocol !== 'https:'
        || !parsed.hostname
        || parsed.username
        || parsed.password
        || seen.has(parsed.toString())
      ) continue;
      seen.add(parsed.toString());
      const domain = parsed.hostname.replace(/^www\./i, '').slice(0, 120);
      const title = typeof source.title === 'string' && source.title.trim()
        ? source.title.trim().slice(0, 140)
        : domain;
      result.push({ title, url: parsed.toString(), domain });
    } catch {
      // Never expose malformed or non-web links from a response.
    }
  }
  return result;
}
