# PANDA NATIVE APP — Current Status

**Checked:** 25 November 2026  
**Current data-flow notes:** docs/panda-native/BANGING_AND_LIVE_DATA.md

## Source and Android release

- Latest completed Android preview build found: APK 109, EAS build aea9fef8-bb7f-42e3-abcc-242d7cf7d423, source commit 89f8d987e6079beaedfa73e989fe371b431e9ec2.
- The branch fix/apk-108-banging-storage-fallback is at 4e38155a80958d297aa4f0905dd7b79b62bc915f and contains two commits after APK 109. Its app.json versionCode is 109. The latest source branch and the installed APK are not identical.
- GitHub main was 110 commits behind the APK 109 source commit when checked. Verify the intended branch and commit before building; do not assume main is current.
- Android APKs are built through EAS preview profile. There is no GitHub Actions Android build workflow.

## Service boundary

The Native App points runtime and discovery calls to the external Panda AI Proxy at https://panda-ai-proxy.vercel.app in both Expo preview and installed builds. Partner placements and venue activity use the separate Panda Partners API. Replit is not a production API dependency. No provider credentials belong in the app or Git.

## Banging behavior

The app combines partner placements, filtered live results, nearby/device cache and a London-only curated name fallback. Banging uses a 5-second app deadline and a 4.3-second server live-call deadline. Device cache is local to one installation; Banging must not reuse shared Google Place results across users. Organic ranking favors established 4.8–5.0 upscale-cluster restaurants with 200+ reviews, then eligible wider 4.5+ upscale restaurants within the two-hour journey threshold. The target is up to 50 cards; the app does not invent fillers when the qualifying pool is short.

## Proxy hardening and verification boundary

Panda AI Proxy production is at commit 2b09ff1d4f5379adfbaac9d52ab2ae02d3d6d4fc and its Vercel deployment was READY. The proxy hardening test suite passed 117/117; this was backend verification, not a Native device test. A safe public status GET was intercepted by Vercel Authentication with 401 before reaching the app, so endpoint runtime behavior was not verified in that check.

The seven daily-budget settings are configured for Vercel Production only. Preview settings were left unchanged. The exact names and starting caps are recorded in the live-data handover and the Panda AI Proxy API README; the hash salt value is secret and must never be committed.

## Outstanding

- A new city without device-cached or approved first-party/partner-owned Banging data may show an empty state after Google calls are unavailable or budget-blocked. A London seed is not a global catalogue.
- Before the next APK, confirm the exact source commit, incremented Android versionCode, and that the EAS build reports that same commit.
- Complete device-level Android/iOS journey checks after the next native build.
