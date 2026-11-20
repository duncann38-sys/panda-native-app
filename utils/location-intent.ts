type TextClassifier = (text: string) => boolean;

const EXPLICIT_AREA = /\b(?:in|near|around|within)\s+(?!me\b|here\b|there\b|my\b|your\b|this\s+area\b|that\s+area\b|the\s+area\b|a\s+city\b|the\s+city\b|somewhere\b|anywhere\b|nearby\b)[\p{L}\p{M}][\p{L}\p{M}\d'’.-]*(?:[\s-]+[\p{L}\p{M}\d][\p{L}\p{M}\d'’.-]*){0,3}/iu;
const EXPLICIT_WEATHER_AREA = /\b(?:in|on|near|around|within|for)\s+(?!me\b|here\b|there\b|my\b|your\b|this\b|next\b|today\b|tonight\b|tomorrow\b|the\s+(?:rest|week|weekend|month|year)\b|weekend\b|week\b|morning\b|afternoon\b|evening\b|monday\b|tuesday\b|wednesday\b|thursday\b|friday\b|saturday\b|sunday\b|january\b|february\b|march\b|april\b|may\b|june\b|july\b|august\b|september\b|october\b|november\b|december\b)[\p{L}\p{M}][\p{L}\p{M}\d'’.-]*(?:[\s-]+[\p{L}\p{M}\d][\p{L}\p{M}\d'’.-]*){0,3}/iu;
const DEVICE_AREA = /\b(?:near\s+me|around\s+me|nearby|around\s+here|near\s+here|my\s+(?:area|home|work)|this\s+area|local(?:ly)?)\b/i;
const WEATHER_INTENT = /\b(?:weather|forecast|rain(?:ing|y)?|snow(?:ing)?|sunny|sunshine|temperature|wind(?:y)?|humidity|warm enough|cold outside)\b/i;
const RIDE_REQUEST = /\b(?:get|call|book|order|hail|request|send|need|want|like|arrange|take)\s+(?:(?:me|us)\s+)?(?:an?\s+)?(?:uber|taxi|cab|ride(?:\s+share)?)\b/i;

export function hasExplicitSearchArea(text: string): boolean {
  return EXPLICIT_AREA.test(String(text ?? ''));
}

export function isWeatherIntent(text: string): boolean {
  return WEATHER_INTENT.test(String(text ?? ''));
}

export function requiresCurrentLocation(
  text: string,
  isGeneralLifeConversation: TextClassifier,
  isTransitQuestion: TextClassifier,
): boolean {
  if (isTransitQuestion(text)) return true;
  if (RIDE_REQUEST.test(String(text ?? ''))) return true;

  const hasExplicitArea = hasExplicitSearchArea(text) || (isWeatherIntent(text) && EXPLICIT_WEATHER_AREA.test(String(text ?? '')));
  if (isWeatherIntent(text) && (!hasExplicitArea || DEVICE_AREA.test(text))) return true;
  if (hasExplicitArea && !DEVICE_AREA.test(text) && !/\bhow far\b/i.test(text)) return false;
  if (isGeneralLifeConversation(text)) return false;

  if (
    /\b(near(?:by)?|near me|around (?:me|here)|local|closest|nearest|recommend(?:ation)?|suggest(?:ion)?|find me|looking for|where can i|where should i|where to go|where am i|what(?:'s|’s| is) happening here|what(?:'s|’s| is) around here|places?|spots?|somewhere|venues?|restaurants?|caf(?:e|é)s?|coffee|pubs?|bars?|food|eat|dinner|lunch|breakfast|brunch|drinks?|open now|open tonight|tonight|this evening|how far|this area|this place|here)\b/i.test(text)
  ) {
    return true;
  }

  const normalizedText = text.trim();
  const clearlyGeneral =
    /^(?:hi|hello|hey|thanks|thank you|cheers|goodbye|bye|ok|okay)[!.?]*$/i.test(normalizedText)
    || /^(?:what (?:is|are|does|did|was|were)|who (?:is|are|was|were)|when\b|why\b|how (?:do|does|did|is|are|to)\b|explain\b|define\b|translate\b|summari[sz]e\b|write\b|draft\b|calculate\b|solve\b|tell me (?:about|a joke)\b)/i.test(normalizedText);

  return !clearlyGeneral;
}
