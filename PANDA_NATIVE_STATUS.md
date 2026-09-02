# PANDA NATIVE APP — Current Status

## What is in this repository

This repository contains the Native App source and its project documentation. It is the clear home for future Native App development.

## What is working

- Expo Native App screens and navigation.
- Panda visual style, cards, venue imagery and attribution.
- Panda AI request flow through the external Panda AI service.
- Named destination resolution for questions such as “How do I get to Fatt Pundit?”.
- In-app route panel that can display live origin station, destination station and final walking leg.
- Venue profile, photo and transit integrations in the current development environment.

## What is not finished

The current external service at https://panda-ai-proxy.vercel.app supports the Panda AI endpoint, but the live venue, profile and transit routes currently return 404. Those routes still exist in the Replit API Server used for preview.

The next backend task is to move or deploy these routes to the external Panda service, then point this repository only at the external API. This must be completed before claiming that Panda Native has no Replit runtime dependency.

## Do not confuse these states

- GitHub source: ready and separated as duncann38-sys/panda-native-app.
- Replit preview: useful for development and currently supplies the unfinished live venue routes.
- Production independence: not finished until the external venue, profile and transit routes respond successfully.

## Completion check for the API migration

- [ ] External venue search works.
- [ ] External venue profile works.
- [ ] External venue photos work.
- [ ] External nearest-station lookup works.
- [ ] External venue transit lookup works.
- [ ] Native App production configuration contains no Replit API URL.
- [ ] AI, venue details, station lookup and in-app directions are tested from the GitHub project build.
