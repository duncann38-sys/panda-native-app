# Panda Native App — Engineering Handover

**Status:** Current baseline  
**Last updated:** 2 September 2026  
**Product:** Panda consumer mobile app  
**Package:** `@workspace/panda-mobile`

## 1. What Panda is

Panda is the consumer-facing London going-out app. It helps a customer discover
restaurants, bars, pubs and coffee spots, plan a morning/lunch/night itinerary,
ask Panda AI for recommendations, view venue details, and open a route inside
Panda.

Panda Mobile is separate from:

- The Panda Partner Portal, which is for venue/business operations.
- The Panda Industry site, which is the public business-facing website.
- The Panda AI backend, which is hosted externally and is not part of the
  mobile bundle.

Do not move consumer production hosting or runtime APIs to Replit. Replit
workflows are used for development and preview in this workspace.

## 2. Current architecture

```text
Expo Router / React Native app
        |
        |-- Panda AI requests ------------------> panda-ai-proxy (Vercel)
        |
        |-- venue profile/search/transit/photos -> Panda API server
        |                                          -> Google Places API
        |                                          -> Google Routes API
        |
        |-- map screen -------------------------> embedded Google map surface
        |                                          + Panda route overlay
        |
        `-- local catalogue --------------------> data/venues.ts
```

### Runtime API selection

`artifacts/panda-mobile/constants/services.ts` defines two API bases:

- `PANDA_PRODUCTION_API`: the external Vercel Panda AI proxy.
- `PANDA_RUNTIME_API`: the Replit preview API when
  `EXPO_PUBLIC_DOMAIN` is present; otherwise the external production API.

This is intentional:

- Preview development can call the running API Server workflow.
- A production build must use the established external service rather than a
  Replit preview domain.
- Panda AI itself always posts to the external `/api/panda-ai` endpoint.

## 3. What was completed

### Venue detail screen

The venue screen in `app/venue/[id].tsx` now combines local presentation data
with live Google-backed data:

- Live venue name/address/type.
- Live Google rating and rating count when available.
- Live current opening state and today’s hours.
- Google editorial summary and supported venue highlights.
- Up to five Google Place photos with attribution through `VenuePhoto`.
- Live customer-to-venue transit context.
- Honest loading, permission-denied, unavailable and retry states.
- Panda Rating remains a separate gold badge and is not replaced by the Google
  rating presentation.

The screen still uses the local catalogue to resolve the initial venue ID and
to preserve Panda’s approved cards, artwork, category styling and navigation.

### Panda AI

`app/ai.tsx` uses a two-stage flow:

1. Post the conversation to the external Panda AI service.
2. Enrich the result on-device through the runtime API:
   - venue profile for live hours and links;
   - transit context for venue directions;
   - nearest-station lookup when there is no named destination.

The AI system instruction explicitly prevents invented opening hours,
addresses, station names or routes.

Transit questions are detected for terms such as:

- station
- Tube / Underground
- train
- transport
- directions
- “how do I get”

For those questions the app requests foreground location permission, obtains
the customer’s current coordinates, and then uses live API data. If permission
is denied or the device location is unavailable, Panda says so rather than
fabricating a station.

Named destinations are resolved in this order:

1. A Google Place returned by the AI response.
2. An exact venue name found in Panda’s local catalogue.
3. A live `/api/partner/venues` search using the customer’s question.

This prevents a question such as “How do I get to Fatt Pundit?” from being
treated as a generic nearest-station question.

The AI message can carry an `AiTransitContext`, which renders a live-station
answer card and an in-app directions action.

### Live transit

The API server’s Google integration provides:

- The nearest rail or Underground station to the customer.
- The nearest rail or Underground station to the venue.
- The final walking distance and duration from the venue station to the venue.

The station-to-venue walking route uses Google Routes when available. The
current implementation does not yet provide full step-by-step train, Tube or
bus instructions between the two stations.

### In-app route screen

`app/(tabs)/map.tsx` accepts route context through Expo Router parameters,
including:

- `directionsVenueId`
- `transitOriginName`
- `transitDestinationName`
- `transitWalkMinutes`
- `transitWalkDistance`

The route screen keeps the customer inside Panda. It layers Panda’s route panel
and controls above the embedded Google map and does not open the external
Google Maps app or website for the transit action.

### Planner

The planner supports shared Morning, Lunch and Night time boundaries from
`constants/panda-time.ts`. The home screen chooses the current time-aware
shortcut, and planner venue detail routes preserve planner state while opening
venue details and map routes.

Planner profile enrichment uses the same runtime API venue profile endpoint.
The planner’s base ordering and venue set still come from `data/venues.ts`.

## 4. Backend API contract

The relevant routes are implemented in:

`artifacts/api-server/src/routes/partner-venues.ts`

### Search venues

```http
GET /api/partner/venues?query=<venue-or-UK-area>
```

Returns a validated list of:

```json
{
  "query": "Fatt Pundit",
  "results": [
    {
      "id": "google-place-id",
      "name": "Fatt Pundit",
      "address": "77 Berwick St, London W1F 8TH",
      "category": "Asian Fusion Restaurant"
    }
  ]
}
```

Search input is validated to 2–120 characters. Search results are cached for
15 minutes, repeated searches from one IP are cooled down for 800ms, and
transient discovery errors are returned explicitly.

### Venue profile

```http
GET /api/partner/venues/:placeId/profile
```

Returns Google-backed venue facts including:

- name and formatted address;
- primary type;
- rating and rating count;
- price level;
- current opening state and today’s hours;
- phone, website and Google Maps URL;
- editorial summary;
- supported factual highlights;
- latitude and longitude;
- `source: "google_places"`.

Profiles are cached for 15 minutes and served with a public cache header.

### Venue transit context

```http
GET /api/partner/venues/:placeId/transit?latitude=<lat>&longitude=<lng>
```

Response shape:

```json
{
  "originStation": {
    "id": "google-place-id",
    "name": "Westminster",
    "address": "…",
    "latitude": 51.5,
    "longitude": -0.12,
    "googleMapsUrl": "…",
    "source": "google_places"
  },
  "destinationStation": {
    "id": "google-place-id",
    "name": "Covent Garden",
    "address": "…",
    "latitude": 51.51,
    "longitude": -0.12,
    "googleMapsUrl": "…",
    "source": "google_places"
  },
  "venueWalk": {
    "distanceMeters": 398,
    "durationMinutes": 5,
    "source": "google_routes"
  },
  "source": "google_places"
}
```

The route validates the place ID and coordinate ranges, fetches both nearest
stations concurrently, and returns a 404 when coordinates or nearby stations
are unavailable. Transit responses are privately cached for two minutes.

### Nearest station without a venue

```http
GET /api/partner/transit/nearest?latitude=<lat>&longitude=<lng>
```

Returns:

```json
{
  "station": {
    "id": "google-place-id",
    "name": "Westminster",
    "address": "…",
    "latitude": 51.5,
    "longitude": -0.12,
    "googleMapsUrl": "…",
    "source": "google_places"
  },
  "source": "google_places"
}
```

### Photos

```http
GET /api/partner/venues/:placeId/photos
GET /api/partner/venues/:placeId/photos/:index/image
```

Photo metadata and image proxying preserve Google author attribution. The
consumer gallery is capped at five photos.

## 5. Live backend versus local app data

This distinction is important for future development.

### Live/backend-backed today

- AI response generation.
- Google venue search used by AI destination resolution.
- Venue profile facts.
- Current opening state and today’s hours.
- Google ratings and rating counts on venue details.
- Google Place photos and attribution.
- Customer nearest station.
- Venue nearest station.
- Final station-to-venue walking distance and duration.
- Backend validation, caching and explicit error responses.

### Still local or hybrid today

- The initial home venue catalogue.
- Home cards and their base ordering.
- Map venue markers and local map search.
- Planner venue set and base ordering.
- Local descriptions, categories, price labels and visual metadata.
- Some local distance/walking labels outside the live transit card.
- Panda-specific flags such as Premium, Banging and promoted state.
- The static venue-to-ID lookup used by detail navigation.

Do not describe the whole app as fully backend-driven until the local catalogue
is replaced or deliberately made a cache of a server-owned catalogue.

## 6. Product and visual decisions to preserve

- Keep Panda separate from the Partner Portal and industry site.
- Preserve the pale sage, ivory, forest green and honey/gold palette.
- Preserve rounded cards, venue imagery, attribution and artwork.
- Keep Panda Rating visually distinct from Google rating.
- Keep weekly hours backend-only; show today’s useful status in cards and
  answer specific closing questions in Panda AI.
- Never invent a venue offer or highlight without an explicit provider fact.
- Never fabricate a station, route, distance, opening time or address.
- Transit directions stay inside Panda.
- If customer and venue are both closest to the same station, showing the same
  station on both sides is valid.
- Preserve up to five Google photos and their attribution.

## 7. Known limitations and next build areas

### Highest-value next step: complete the live venue data migration

Decide whether `data/venues.ts` should become:

1. a server-owned catalogue fetched by the app;
2. a generated/cache layer refreshed from the API; or
3. an intentional curated editorial seed list with live data layered on top.

Until that decision is made, do not remove the local data casually because
current navigation, planner state, Premium/Banging presentation and map
markers depend on it.

### Transit improvements

- Add full step-by-step public transport instructions if Google Routes transit
  mode is approved and supported by the service configuration.
- Consider a generic route from the customer’s live location to the nearest
  station when the user asks only for “my nearest station.”
- Keep the current final walking route and honest fallback states.

### Verification still worth doing

- Full device/browser journey for:
  - “What’s my nearest station?”
  - “What’s the nearest station to Fatt Pundit?”
  - “How do I get to Fatt Pundit?”
- Verify the AI destination card opens the correct map route on native Android,
  iOS and web preview.
- Verify denied permission, unavailable GPS, Google 404 and Google 502 states.
- Verify production builds do not contain a preview API domain.

## 8. Development and validation

From the repository root:

```bash
pnpm --filter @workspace/panda-mobile run typecheck
pnpm --filter @workspace/api-server run typecheck
```

Run the development workflows:

```bash
pnpm --filter @workspace/panda-mobile run dev
pnpm --filter @workspace/api-server run dev
```

The current validated checks include:

- Panda Mobile TypeScript check passes.
- API Server TypeScript check passes.
- Nearest-station endpoint returns live Google data.
- Venue transit endpoint returns live origin station, destination station and
  Google Routes walking data.

When changing API response shapes, update both the server response and the
mobile response types in the same change. When changing route parameters,
update every caller and the map screen together.

## 9. Change checklist for future developers

Before changing a live-data feature:

1. Confirm whether the source of truth is local, the API server, Google, or the
   external Panda AI proxy.
2. Preserve explicit unavailable and permission-denied states.
3. Validate external IDs and coordinates on the server.
4. Keep provider attribution with provider photos.
5. Keep production API ownership and hosting external to Replit.
6. Run both Mobile and API typechecks.
7. Test the complete user journey, not only the endpoint.
8. Update this handover document when an architectural decision or known
   limitation changes.