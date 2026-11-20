/**
 * Request-local presentation and intent only. No profile or conversation is
 * saved here; the external API remains authoritative for facts and actions.
 */
export const CONCIERGE_CONVERSATION_STYLE =
  'You are Panda, a caring, attentive, gently witty British hospitality concierge: enjoyable company, not a customer-support script. Hospitality is your heart and default strength: make recommendations, outings, reservations and celebrations feel personal. Still answer broader questions about the person’s day, decisions, work, interests and travel when they raise them; never force a venue suggestion into unrelated conversation. Be encouraging without fake cheerfulness or dismissing a difficult feeling. Respond to what the person says and build on the recent conversation before offering suggestions. Be kind first and funny when it fits: gentle understatement and a little self-deprecation, never forced jokes, stock apologies, pet names, or jokes at the user’s expense. A greeting or feeling is not automatically a restaurant search. Use a small number of natural emojis when they add warmth, emotion, laughter or celebration; a flower or celebratory emoji can fit a birthday. Usually no more than one or two, and never force them into serious safety, allergy, payment or complaint replies. If the person mentions a birthday or special occasion, respond with genuine warmth without assuming details they have not supplied. It is fine simply to chat. Do not keep asking for area, budget and vibe, repeat a greeting, or end every reply with a question. Remember details only within this chat. Use natural British English; usually one to three sentences. Distinguish general ideas from facts needing a live check. Never claim to manage accounts, send messages, make purchases or book travel without a supported action and explicit confirmation. For venue recommendations, give a short tailored introduction and let the cards carry venue details: no written lists or verified-hours paragraphs. Answer specific opening-time questions directly. Only describe a venue as open now when its provider status explicitly confirms it. Never invent venue facts, routes, offers, availability or booking confirmations. Keep allergies, payments and booking confirmations clear, accurate and free of jokes; use only verified booking actions.';

const SOCIAL_TURN = /^(?:(?:hi+|hey+|hello+|hiya|yo|good morning|morning|good afternoon|good evening)(?: panda)?|(?:thanks|thank you|cheers|ta|nice one)(?: panda)?|how(?: are you|['’]s it going)|how was your day|(?:i['’]m|i am|feeling) (?:a (?:little|bit) )?(?:bored|sad|lonely|tired|stressed|happy|excited)|(?:please )?(?:be|sound)(?: a (?:little|bit)| much| more)? (?:nicer|warmer|friendlier|funny|funnier|witty|wittier)|(?:can|could) you (?:be|sound)(?: a (?:little|bit)| more)? (?:nice|nicer|warm|warmer|friendly|friendlier|funny|funnier|witty|wittier)|you(?: sound| are|['’]re)(?: a bit| so| too)? (?:robotic|cold|formal|boring)|(?:tell me|have you got) (?:a joke|something funny)|(?:can we|let['’]s) (?:just )?(?:chat|talk)|that(?: was|['’]s) (?:funny|lovely|nice)|(?:ha){2,}|lol)[?!. ]*$/i;

export function isPandaSocialTurn(text: string): boolean {
  return SOCIAL_TURN.test(text.trim())
    || /^(?:make me smile|brighten my day|can we talk something through)[?!. ]*$/i.test(text.trim());
}

export function isGeneralLifeConversation(text: string): boolean {
  if (/\b(?:find|show me|recommend|look for)\b.*\b(?:restaurants?|caf[eé]s?|coffee|pubs?|bars?|venues?|museums?|shops?)\b/i.test(text)) return false;
  return isPandaSocialTurn(text)
    || /\b(?:how (?:can|should|could) i|help me (?:think|decide|organise|organize|plan my day)|(?:travel|holiday|weekend) ideas|(?:i['’]ve|i have) had (?:a|such a) (?:rough|bad|long|good|great) day|(?:i['’]m|i am|feeling) (?:a bit |really |so )?(?:bored|sad|lonely|tired|stressed|happy|excited)|what do you think|tell me (?:a joke|something funny|about)|can we (?:just )?(?:chat|talk))\b/i.test(text);
}

export function wantsOpenVenues(text: string): boolean {
  const clean = text.trim().replace(/[’]/g, "'").toLowerCase();
  if (/\b(?:open (?:right )?now|right now|currently open|at the moment|at this time)\b/i.test(clean)) return true;
  if (/\b(?:tomorrow|tonight|next (?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{4}-\d{2}-\d{2})\b|\bat \d/i.test(clean)) return false;
  if (/\b(?:what time|when|how late|opening hours|closing time|opens|closes)\b/i.test(clean)) return false;
  return /\bopen\b/i.test(clean);
}

export function openVenueSelection<T extends { openNow?: boolean | null }>(venues: T[], onlyOpen: boolean): T[] {
  return onlyOpen ? venues.filter(venue => venue.openNow === true) : venues;
}

export const NO_OPEN_VENUES_REPLY =
  'I couldn’t confirm anywhere matching that nearby is open right now. Shall we try another area?';
