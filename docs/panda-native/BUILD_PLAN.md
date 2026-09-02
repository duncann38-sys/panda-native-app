# Panda Native Build Plan

This is the working plan for building Panda Native. It is written so a
non-technical teammate can understand what each stage is for, while still
giving developers enough direction to find the relevant code.

## Stage 1 — Keep the current experience safe

**Purpose:** Make sure the current app remains attractive, understandable and
honest while live information is added.

The app should:

- keep Panda’s pale sage, ivory, forest green and honey/gold styling;
- keep rounded cards, artwork, venue images and photo credit;
- keep Panda Rating visually separate from Google rating;
- show clear loading, denied-permission and unavailable-data messages;
- never invent an address, opening time, station or route.

## Stage 2 — Make live venue information dependable

**Purpose:** Let customers trust the information on a venue page.

The app should:

- load current Google venue facts through the API Server;
- show today’s open/closed information;
- show live rating information when present;
- show up to five credited photos;
- keep Panda’s own editorial information where it adds value.

## Stage 3 — Make Panda AI useful for real journeys

**Purpose:** Let a customer ask naturally and receive an answer that leads to
an action.

The app should:

- understand venue, opening and transport questions;
- ask for location only when location is needed;
- recognise a named venue such as Fatt Pundit;
- check station information through the API Server;
- show a route action inside Panda;
- avoid contradictory AI text when live data succeeds.

## Stage 4 — Make discovery and planning share one reliable source

**Purpose:** Prevent home, planner, map and venue pages from disagreeing.

Before changing the local catalogue, decide whether it will become:

- a catalogue served by the API;
- a refreshed cache;
- or a deliberate editorial seed list.

Do not remove the current catalogue until Premium, Banging, promoted and
planner behaviour have a safe replacement.

## Stage 5 — Improve the route experience

**Purpose:** Help customers complete the journey, not just understand it.

Possible improvements:

- show full public transport steps;
- offer walking directions from the customer to their nearest station;
- add clearer route progress;
- make route states work consistently on web preview and native devices.

## Definition of finished

A Native App feature is finished when:

- the customer can use it from the visible screen;
- the API returns real data where live data is promised;
- an unavailable or denied case is understandable;
- the experience works with the existing Panda styling;
- the feature has been checked on the relevant preview or device;
- the handover documentation explains what it does;
- the next Native App build item is clearly recorded.

## Documentation rule

Update `docs/panda-native/README.md` and
`docs/panda-native-app-handover.md` whenever a feature changes:

- where data comes from;
- how screens connect;
- what the customer sees;
- what is still local;
- what future developers must not remove;
- or what the next build should do.