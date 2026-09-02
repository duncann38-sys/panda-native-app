# PANDA NATIVE APP — Current Status

## GitHub project

This repository is the clear home for PANDA NATIVE APP source and documentation.

## Backend independence

PANDA NATIVE APP no longer needs the Replit API in production. Its service configuration points only to the external Panda service at https://panda-ai-proxy.vercel.app.

The following production routes have been tested successfully:

- [x] Panda AI.
- [x] External venue search.
- [x] External venue profile.
- [x] External venue photos with attribution.
- [x] External nearest-station lookup.
- [x] External venue transit lookup.
- [x] Google walking distance and duration.
- [x] No Replit URL in the standalone production service configuration.

## Verified example

For a test journey to Fatt Pundit, the external service returned Westminster as the customer station, Covent Garden as the venue station, and a 398 metre, five-minute final walk.

## Remaining product verification

Backend independence is complete. A final device-level journey check should still be run on Android, iOS and web preview whenever those build targets are prepared. That is a user-interface verification task, not a Replit API dependency.

## Do not change

- Do not add a Replit preview URL to production configuration.
- Do not move production API ownership to Replit.
- Keep venue photo attribution.
- Never invent station, route, opening or venue facts when live data is unavailable.
