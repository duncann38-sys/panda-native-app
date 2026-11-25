# Panda Native — Current Live Data and Banging Handover

**Last checked:** 25 November 2026  
**App source checked:** fix/apk-108-banging-storage-fallback at 4e38155a80958d297aa4f0905dd7b79b62bc915f  
**Latest completed APK found:** APK 109, EAS build aea9fef8-bb7f-42e3-abcc-242d7cf7d423, built from 89f8d987e6079beaedfa73e989fe371b431e9ec2. The source branch contains two commits after the APK build; this note describes the branch source, not a claim that APK 109 contains those changes.

GitHub main was 110 commits behind the APK 109 source commit at the time of review. Confirm the repository branch and build commit before a release; do not build from main by default.

## Service boundaries

- constants/services.ts sets PANDA_PRODUCTION_API to https://panda-ai-proxy.vercel.app. PANDA_DISCOVERY_API and PANDA_RUNTIME_API use that same external service, including Expo preview and installed native builds.
- The separate Panda Partners API at https://panda-partners-api.vercel.app supplies public sponsored placements and partner activity. It is not the Google Maps Platform proxy.
- Google Places, Routes, Weather and Gemini calls run server-side in Panda AI Proxy. Never put server credentials in the mobile bundle or Git.
- Replit runs development/Expo preview tooling; it is not the Native App production API.

## Banging request and ranking flow

1. The home screen calls the Panda Partners API for public sponsored-venue records. It rotates a bounded cohort (up to ten per tier per London four-hour time slot) and hydrates profiles through Panda AI Proxy, with at most three profile requests in parallel. Partner Premium placement records are distinct from organic Banging results.
2. The home screen calls the Banging route through PANDA_RUNTIME_API at /api/partner/venues with banging=1, premium_ids and the user coordinates. The BangingDrawer only renders the ordered venues passed by the parent; selection and ordering live in the home screen and Banging rotation utilities.
3. Organic live venues must be restaurants rated 4.5–5.0, have an upscale signal, avoid known chains and fast-casual/takeaway terms, and have a recent journey no longer than two hours. Flagships rank first: 4.8–5.0, at least 200 reviews, £££/££££ and an upscale cluster with at least three high-price venues within 1.8 km. Then come other 4.8+ venues, clustered 4.5–4.8 venues, and the wider eligible 4.5+ pool.
4. Rotation uses London local time in six four-hour windows. The target deck is 50 when enough organic results exist. With enough organic results, Premium appears in every fifth slot. If only one to three organic cards are available, the current code returns those organic cards rather than moving Premium into earlier slots; if no organic cards exist, it may show the available Premium placements. It never fills gaps with unrelated venues.

## Live call deadline and cache rules

- The Native client gives Banging requests a 5-second deadline. The Panda AI Proxy Banging Google lookup uses a 4.3-second deadline so the app can fall back before a long request hangs.
- The Banging Google search path bypasses both process and Firestore Google-result caches. Do not reintroduce shared cross-user Google venue-result caching. The server-side banging_directory_cache_v1 is for public partner-placement data, not Google venue results.
- Successful eligible Google results can be stored in AsyncStorage on that device only, keyed by the origin rounded to two decimal places, with a three-hour TTL. Only quality-filtered, coordinate-backed high-end restaurant records qualify. This is not an account-wide or cross-user cache.
- The app also keeps short-lived in-memory request/result state and coalesces identical in-flight requests. Failure state is cooled down for about one minute; it does not substitute for a Google-result cache.
- When live Google/Routes data is unavailable, eligible local records can use a Haversine-based reach estimate. The result must be explicitly labelled estimated; never present the estimate as a live transit route.

## Fallback order and limits

1. Use live Banging results and partner placements when available.
2. Reuse eligible device-local Banging cache and nearby discovery records already present in the app. Device-cache estimates are limited to the under-two-hour reach.
3. If those are absent, use the curated name-only Banging seed only within 45 km of central London. It has no trusted live rating, price, address, coordinates, hours or photo; keep those fields blank and show that travel details are unavailable.
4. If no qualifying data exists, show the handled empty state. Do not invent venues or use another user’s Google results.

The live nearby fallback has its own quality checks, including a 50 km straight-line radius, rating 4.5+, coordinates, upscale signal, restaurant category, chain/takeaway exclusion, and an estimated reach under two hours. Estimates are not Google Routes itineraries.

A first-time user in a new city has no device cache there. If daily Google budgets are exhausted and no approved first-party or partner-owned city seed exists, Banging can be empty for that user. The current curated name-only seed is London-specific; adding city names alone or copying shared Google results will not create a safe new-city fallback.

## Production budgets and deployment

Panda AI Proxy enforces shared daily UTC budgets and fails closed when required configuration or Firestore budget accounting is unavailable. Existing device-local/curated fallback can still be shown, but blocked live calls do not mean Google supplied fresh results.

The following starting caps were configured on the Vercel Production environment on 25 November 2026. Check Vercel before relying on them; values can change independently of Git:

- PANDA_DAILY_GEMINI_LIMIT: 5,000 per UTC day.
- PANDA_DAILY_PLACES_LIMIT: 5,000 per UTC day for the direct Places budget; discovery-index allowance is separate.
- PANDA_DAILY_PHOTO_LIMIT: 10,000 per UTC day.
- PANDA_DAILY_ROUTES_LIMIT: 2,000 per UTC day.
- PANDA_DAILY_CLIENT_AI_LIMIT: 1,000 per client per UTC day.
- PANDA_BANGING_DAILY_ROUTE_ELEMENTS: 10,000 per UTC day.
- PANDA_CLIENT_HASH_SALT: required sensitive secret; never include its value in Git, screenshots, logs or documentation.

These settings were Production-only; Vercel Preview variables were not changed. The Native app’s current PANDA_RUNTIME_API still points to Production even in Expo preview, so do not confuse an Expo preview with a Vercel Preview deployment.

The Panda AI Proxy production commit is 2b09ff1d4f5379adfbaac9d52ab2ae02d3d6d4fc and its deployment reached READY. The proxy hardening suite passed 117/117 backend tests. A safe public status request was blocked by Vercel Authentication before reaching the application; this confirms deployment state, not live endpoint behavior.

## Build and change guardrails

- The checked Android app.json versionCode is 109. EAS preview profile builds an internal APK; the production profile builds an Android app bundle.
- Build APKs through Expo EAS, not GitHub Actions. There is no GitHub Actions Android build workflow; do not add one or treat it as the Android release path.
- Before a build, confirm the intended branch, commit, Android versionCode and EAS build metadata all match. APK 109 was built from 89f8; the current source branch has two later commits.
- Run pnpm run typecheck from the app repository root. Review the Banging-specific tests and complete a device journey before claiming native verification.
- Preserve the compact Banging card UI and the existing venue-detail behavior when changing selection/fallback logic.
- Keep any new city fallback first-party or partner-owned and explicitly sourced. Do not re-enable shared Google-result caching for Banging without a new policy review.
