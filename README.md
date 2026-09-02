# PANDA NATIVE APP

This repository contains the customer-facing Panda Native App. It is separate from the Panda Partner Portal and Panda Industry website.

## What this app does

Panda helps people discover London restaurants, bars, pubs and coffee spots, ask Panda AI for suggestions, plan an outing and get directions inside Panda.

## Important status

- The Native App source is stored here as a separate GitHub project.
- Panda AI uses the external Panda AI service.
- The app currently has a mix of curated local venue data and live Google-backed information.
- The required live venue, profile and transit routes still need to be moved to the external Panda service.
- Until that work is complete, those live features can work in Replit preview but are not fully independent in this repository.
- Do not add a Replit preview URL as a production dependency.

## Start here

- Plain-language project guide: docs/panda-native/README.md
- Build plan: docs/panda-native/BUILD_PLAN.md
- Technical handover: docs/panda-native-app-handover.md
- API migration status: PANDA_NATIVE_STATUS.md

## Run locally

    pnpm install
    pnpm run dev

Check the Native App with:

    pnpm run typecheck

The app uses Expo Router. The source tree is kept at the repository root so future developers do not need to understand the original multi-product workspace before working on the Native App.
