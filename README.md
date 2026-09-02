# PANDA NATIVE APP

This repository contains the customer-facing Panda Native App. It is separate from the Panda Partner Portal and Panda Industry website.

## What this app does

Panda helps people discover London restaurants, bars, pubs and coffee spots, ask Panda AI for suggestions, plan an outing and get directions inside Panda.

## Backend independence

- The Native App source is stored here as a separate GitHub project.
- Panda AI uses the external Panda service.
- Live venue search, profiles, photos, nearest-station lookup and venue transit now run on the external Panda service.
- The Native App always uses https://panda-ai-proxy.vercel.app for these services.
- The production app has no Replit API dependency.
- Replit can still be used as development and preview tooling.

## Start here

- Plain-language project guide: docs/panda-native/README.md
- Build plan: docs/panda-native/BUILD_PLAN.md
- Technical handover: docs/panda-native-app-handover.md
- Current status: PANDA_NATIVE_STATUS.md

## Run locally

    pnpm install
    pnpm run dev

Check the Native App with:

    pnpm run typecheck

The app uses Expo Router. The source tree is kept at the repository root so future developers can work on the Native App without understanding the original multi-product workspace.
