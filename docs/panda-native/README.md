# Panda Native

## What this project is for

Panda Native is the customer-facing mobile app for Panda.

It helps people find somewhere good to eat, drink or spend time in London.
People can:

- browse places;
- see useful venue information;
- ask Panda for suggestions;
- make a simple Morning, Lunch or Night plan;
- see which station is closest to them;
- see which station is closest to a venue;
- see the final walk to the venue;
- get directions without leaving Panda.

This project is **not** the business dashboard for venues and it is **not**
the Panda Industry website. Those are separate products.

## Where the app lives

The working Native App is here:

```text
artifacts/panda-mobile
```

It is an Expo app, which means the same project can be previewed on the web
and built for mobile devices.

The live supporting API is here:

```text
artifacts/api-server
```

The detailed technical handover is here:

```text
docs/panda-native-app-handover.md
```

## How the main pieces connect

```text
Customer
  |
  v
Panda Native mobile app
  |
  |-- asks Panda AI for a helpful answer
  |       |
  |       `--> external Panda AI service
  |
  |-- asks for live venue or station information
  |       |
  |       `--> Panda API Server
  |               |
  |               `--> Google Places and Google Routes
  |
  `-- displays the result in Panda’s own screens
          |
          `--> embedded map and Panda route panel
```

In simple terms:

- Panda AI helps understand what the customer is asking.
- The API Server checks facts that must be current.
- Google supplies venue, station and walking information.
- Panda displays the answer without sending the customer to another app.

## What is working now

### Finding and viewing places

The app has a curated list of London venues with Panda’s visual style and
editorial information. Venue pages can add current information from Google,
including:

- venue name and address;
- category;
- rating and number of ratings;
- whether the venue is open now;
- today’s opening information;
- supported venue highlights;
- photos with the required photo credit.

### Asking Panda AI

Customers can ask for recommendations, opening information and transport help.
Panda can understand questions such as:

- “What’s open now?”
- “What’s my nearest station?”
- “Which station is closest to this restaurant?”
- “How do I get to Fatt Pundit?”

For a transport question, the app asks for the customer’s location. It does
not make up a station name or route when live information is unavailable.

If a customer names a venue, Panda resolves that venue before building the
answer. This means the app can show a real destination rather than asking the
customer to repeat it.

### Directions

For a venue route, Panda can show:

- the customer’s nearest station;
- the venue’s nearest station;
- the final walking distance;
- the final walking time;
- a button to open the route inside Panda.

The current route does not yet show every train, Tube or bus step between the
two stations.

### Planning

The app has Morning, Lunch and Night planning modes. The shortcut changes with
the current time so the app feels relevant when it opens.

Planner screens keep the approved Panda cards and styling. Live venue
information can be added to the planner when available.

## What is live and what is still local

This is important for anyone continuing the project.

### Information checked live

- AI answers.
- Venue search used by AI.
- Venue address, rating and current opening state.
- Venue photos and photo credit.
- Customer’s nearest station.
- Venue’s nearest station.
- Final walking distance and time.

### Information currently kept in the app

- The starting list of venues.
- Home screen card order.
- Map markers.
- Planner venue order.
- Some descriptions, labels and visual choices.
- Panda-specific labels such as Premium, Banging and promoted.

This makes the app a **combination of live information and a curated Panda
list**. Do not remove the local venue file until the replacement plan is agreed.

## What happens when a feature is finished

Every completed Native App feature should be connected to the next build in this
order:

1. **Build it** in the Native App or its supporting API.
2. **Check the customer journey**, not only the code.
3. **Check the no-permission and no-data cases**.
4. **Run the Native App and API checks**.
5. **Record what changed** in the project documentation.
6. **Mark the next Native App build item** so the next developer knows where to
   continue.

The documentation should be updated while the project grows, not recreated
from memory at the end.

## Current next build items

### 1. Make the venue list easier to keep current

The app currently has a local curated venue list while some facts come from
Google. The next decision is whether the venue list should be:

- stored and managed by the API;
- regularly refreshed from a source;
- or deliberately kept as Panda’s editorial list.

The choice must preserve Panda’s Premium, Banging and editorial labels.

### 2. Check the complete directions journey

Test these questions from the app:

- “What’s my nearest station?”
- “What’s the nearest station to Fatt Pundit?”
- “How do I get to Fatt Pundit?”

Check that the answer is consistent, the right venue is selected and the
directions button opens the correct in-app map route.

### 3. Decide whether full public transport steps are needed

The current feature gives the nearest stations and final walking leg. A later
version can add full Tube, train or bus steps if that experience is required.

## Words future developers may see

These are technical names for ordinary things:

- **Native App** — the mobile app customers use.
- **Expo** — the toolchain used to run Panda on mobile and web preview.
- **API Server** — the service that supplies current information to the app.
- **Google Places** — the source for venue and station facts.
- **Google Routes** — the source for walking distance and time.
- **Panda AI proxy** — the external service that generates Panda’s answers.
- **Local catalogue** — the curated venue list stored with the app.
- **Transit context** — the station and walking information shown for a route.
- **Fallback state** — the honest message shown when permission or live data is
  unavailable.

Use the plain-language meaning first when writing future documentation. Add the
technical name in brackets only when it helps someone find the right code.

## Useful checks

From the repository root:

```bash
pnpm --filter @workspace/panda-mobile run typecheck
pnpm --filter @workspace/api-server run typecheck
```

For the full technical API contract and file-by-file guidance, read:

```text
docs/panda-native-app-handover.md
```