# 08 — Execution Plan (locked 2026-07-18)

Doc 07's three open decisions, resolved (user delegated the call):

1. **Backend: Firebase** — Auth + Firestore + Storage + Functions + FCM. Fastest path, matches doc 04's original analysis.
2. **Launch breadth: barbershop-first**, tightly seeded community beta. Defensible copyright posture, warm culture, built-in distribution (Facebook groups, barbershoptags.com community).
3. **Spend: lean.** Firebase free tier (Spark) through development, Blaze at beta; $99 Apple Developer (required for Sign in with Apple + push); tens of dollars/mo storage at beta scale.

## Two-track execution

### Track A — local excellence (no accounts needed; starts now)
Work the app can gain today, all valuable regardless of backend:

- **WP1 — Export & share.** Render a completed performance to a single vertical MP4 (2×2 grid, mixed audio, subtle attribution watermark) + system share sheet. Closes the M1 "no export" gap AND is the growth engine (doc 07 §2: shares → installs). *The single highest-leverage feature that needs zero backend.*
- **WP2 — The completion moment + polish pass.** Hero celebration when the 4th part lands (doc 07 §5), haptics on count-in/record/solo, motion polish, empty-state warmth.
- **WP3 — Audio polish.** Playback loudness matching across parts; (later) shared reverb.
- **WP4 — Onboarding shell.** Part-picking + watch-first flow, built local-only so backend auth slots in behind it later.

### Track B — multiplayer (gated on user, then heavy build)
**User prerequisites (the only blockers):**
1. Create a Firebase project (console.firebase.google.com) → download `GoogleService-Info.plist`.
2. Buy Apple Developer membership ($99/yr) — unlocks Sign in with Apple, push, TestFlight, and kills the 7-day re-sign.

Then: data model + security rules → Auth → take upload → global feeds → join flow → completion push → minimum safety (report/block/EULA/age gate/privacy policy) → web share-viewer. Exit criteria per doc 07 §11 P0.

## Sequencing
WP1 → WP2 (sequential; both touch Views.swift) while Track B prerequisites are pending. The moment Firebase credentials exist, Track B becomes the priority and Track A continues in the gaps.
