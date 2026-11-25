# Panda Native

## What this project is

Panda Native is the customer-facing Expo mobile app. It helps people find places, see venue details, ask Panda AI, plan a morning, lunch or night out, and follow venue routes inside Panda. It is separate from the Partner Portal and Panda Industry website.

## Source and release baseline

This guide was checked on 25 November 2026. The latest completed Android preview build found was APK 109, EAS build aea9fef8-bb7f-42e3-abcc-242d7cf7d423, built from commit 89f8d987e6079beaedfa73e989fe371b431e9ec2. The branch fix/apk-108-banging-storage-fallback is at 4e38155a80958d297aa4f0905dd7b79b62bc915f and contains two later commits; this guide describes that source, not the APK 109 binary. GitHub main was 110 commits behind the APK 109 source commit when checked. Confirm the branch, commit and app.json Android versionCode before every build.

## Where the pieces live

The app source is at the repository root: app, components, constants, context, data and utils. The Native App always uses the external Panda AI Proxy URL in constants/services.ts for runtime and discovery calls, including Expo preview. Replit is development and Expo preview tooling, not a production API.

The separate Panda Partners API supplies sponsored venue placements and partner activity. Google Places, Routes, Weather and Gemini requests are made server-side by the Panda AI Proxy; provider credentials do not belong in the app bundle or Git.

## Banging at a glance

The Banging drawer displays the ordered list supplied by the home screen; it does not choose or rank results itself. The app combines current partner placements, eligible live Google-backed results, nearby cached results and the London-only curated name fallback. The full source and fallback rules are in docs/panda-native/BANGING_AND_LIVE_DATA.md.

Key rules to preserve:

- Rank established 4.8–5.0 flagship restaurants with at least 200 reviews and a nearby upscale cluster first, then other qualifying 4.8+, clustered 4.5–4.8, and wider 4.5+ upscale restaurants.
- Exclude chains and fast-casual/takeaway venues from organic Banging results. Organic live results need a recent journey within two hours.
- Use a 50-card deck when the eligible pool supports it. Premium placements are interleaved in every fifth slot when enough organic cards exist; do not invent unrelated fillers to reach 50.
- Banging Google results must not be read from or written to a shared cross-user Google-results cache. The emergency Google-result cache is on the individual device only.
- On a live failure or exhausted budget, use a clearly labelled device estimate or the London curated name-only placeholder. Never invent a rating, address, hours, photo or route.

## Live versus local information

The proxy supplies current search, profile, photo, route and AI data. The app still owns editorial venue seeds, display order, category metadata and local Banging fallback entries. Google-backed Banging records may be cached only on the same device for a short period; another user’s Google result is not a Banging fallback.

A new city does not automatically have an offline Banging catalogue. If that city has no device cache and no approved first-party or partner-owned seed data, a Google outage or exhausted budget can leave Banging empty. Do not solve this by reusing another user’s Google results.

## Future checks and builds

- Read docs/panda-native/BANGING_AND_LIVE_DATA.md before changing Banging filters, cache behavior, budgets or venue rotation.
- Run pnpm run typecheck from the repository root and the relevant discovery/Banging tests in the project environment.
- Android preview APKs are built through Expo EAS with the preview profile; the profile produces an internal APK. The production profile produces an app bundle.
- There is no GitHub Actions Android build workflow. Do not add one or look for it as the APK path. Check app.json versionCode and the Git commit attached to the EAS build.
- The Build 73 architecture review and the old engineering handover are historical snapshots; use the current-data note and PANDA_NATIVE_STATUS.md for current behavior.
