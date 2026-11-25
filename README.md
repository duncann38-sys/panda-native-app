# PANDA NATIVE APP

The customer-facing Panda Native mobile app is maintained in this repository. It is separate from the Panda Partner Portal and Panda Industry website.

## Current source and release baseline

Checked 25 November 2026. The latest completed Android preview build found was APK 109, built by EAS from commit 89f8d987e6079beaedfa73e989fe371b431e9ec2. The branch fix/apk-108-banging-storage-fallback is at 4e38155a80958d297aa4f0905dd7b79b62bc915f, two commits beyond that APK source. The default main branch was 110 commits behind the APK 109 commit when checked. Do not assume main is the release source; verify the EAS commit and branch before another build.

## Runtime services

The Native App uses https://panda-ai-proxy.vercel.app for runtime and discovery calls, including Expo preview. The separate https://panda-partners-api.vercel.app service supplies partner placements and activity events. Google and Gemini credentials remain server-side. Replit is development/Expo preview tooling, not a production API dependency.

## Start here

- Plain-language guide: docs/panda-native/README.md
- Current live data and Banging handover: docs/panda-native/BANGING_AND_LIVE_DATA.md
- Current status: PANDA_NATIVE_STATUS.md
- Build plan: docs/panda-native/BUILD_PLAN.md
- Historical Build 73 architecture review: docs/panda-native/ARCHITECTURE.md
- Historical Build 73 engineering handover: docs/panda-native-app-handover.md

## Run and check

Install with pnpm install, start the Expo app with pnpm run dev, and typecheck with pnpm run typecheck. Android preview APKs are built through Expo EAS using the preview profile; the production profile produces an app bundle. There is no GitHub Actions Android build workflow. Check the source branch, commit and app.json Android versionCode before building.
