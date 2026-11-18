# Android Build 75 — Quick Reserve

Built from the exact successful Build 74 source. Authentication, root providers,
SDK, dependency lock, package identity, discovery pagination, maps and Planner
selection rules are retained.

## Booking flow

Tap the Panda-green **Reserve** button on Discover, Saved, Banging, Map, Planner
or an AI venue card. Panda checks the verified destination and opens it directly
inside the app. There is no intermediate Continue or account-connection screen.
The venue page's reservation action uses the same route.

The UK production OpenTable directory takes priority for verified venue matches.
Where no safe match is available, the verified official venue booking provider is
retained. Missing or ambiguous destinations never become invented booking links.

Panda's Back button returns to the app. Android Back can go back through the
booking page's own navigation. Retry and external-browser recovery are available
when a provider blocks embedded viewing or fails to load.

OpenTable owns its booking page, guest form and confirmation. This is not an
API-native availability picker, and Panda does not claim a reservation merely
because someone tapped Reserve. No tables were booked during build checks.

## Usage safeguards

Cards do not fetch booking links when they render. Lookup runs on an explicit
Reserve tap. Successful results are cached for up to one minute without extending
the provider-match proof expiry. No bulk Google audit or automatic Directory
refresh is scheduled by this release.
