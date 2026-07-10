# 03 — Tech Stack & Cost Analysis

*v2 — revised after Checkpoint 1 feedback: **web-first, $0 until validated**, with a packaged-app path for the stores.*

## The strategy in one paragraph

Build TagAlong as a **web app (PWA)**. It's a URL: testable on your own iPhone today, shareable with a barbershop chapter for beta, hosted free, **zero store fees, zero review process, $0 total spend**. The same codebase later wraps into iOS/Android store apps via **Capacitor** — you pay Apple's $99/yr and Google's one-time $25 only after the product has proven itself. Where web APIs turn out too weak (most likely the recording engine on iOS Safari), Capacitor lets us replace *just that module* with a native plugin — not rewrite the app.

## Honest trade-offs vs. the v1 native-Swift plan

| | Native SwiftUI (v1 plan) | Web-first + Capacitor (v2 plan) |
|---|---|---|
| Cost to first testable build | $99/yr + TestFlight friction | **$0, it's a URL** |
| Android | second codebase, someday | same codebase, near-free |
| Share links | need separate web player anyway | **the app *is* the web player** — a huge product win we previously deferred to P2 |
| Recording/sync quality | best possible | good on Chrome/Android; **iOS Safari is the risk** (quirkier audio stack, less precise latency reporting). The manual nudge slider is the equalizer; native plugin is the escape hatch |
| UI polish ceiling | highest | high (careful design required to not feel "webby"; our design system is custom anyway) |
| Background/offline robustness | best | acceptable for 60 s clips |

**My recommendation stands with your instinct: web-first.** For a validation-stage product whose main distribution channel is *links shared in Facebook groups and group chats*, a URL is not a compromise — it's the better product. The risk is concentrated in one place (iOS Safari recording), so we attack it first (doc 02, Checkpoint 4 spike).

## Client stack

| Layer | Choice | Why |
|---|---|---|
| Language/framework | **TypeScript + React 18 + Vite** | Mainstream, componentized, excellent for incremental Claude-session development; huge ecosystem |
| Styling | **Tailwind CSS + our design tokens** | The doc-05 identity (ivory/plum/brass, part colors) as a Tailwind theme |
| State/data | TanStack Query + Firebase SDK | Boring and reliable |
| Recording | **getUserMedia + MediaRecorder + Web Audio API** | Camera+mic capture; `AudioContext` for pitch pipe, count-in clicks, and guide-mix playback with sample-accurate scheduling |
| Playback | **Synchronized multi-`<video>` grid** | The collage is *performed live* in the player from individual part videos — no pre-rendered composite needed to watch in-app (details in doc 04) |
| Export | **WebCodecs + canvas (fast path) / ffmpeg.wasm (fallback)** | Rendering the watermarked share video happens client-side, only when someone exports |
| PWA | Vite PWA plugin | "Add to Home Screen," icon, offline shell — app-like without stores |
| Store packaging (later) | **Capacitor** | Wraps the same build for App Store / Play Store; native plugins (Swift/Kotlin) only where web APIs underperform |

**Browser support policy:** iOS Safari and Android Chrome are tier 1 (that's where singers are); desktop Chrome/Safari/Firefox tier 2. Every AV feature gets verified on a real iPhone before it counts as done.

## Backend (unchanged from v1 — it was already web-friendly)

Principle: **the backend stores metadata and blobs; it never touches video.**

| Concern | Choice | Free tier reality |
|---|---|---|
| Auth | Firebase Auth (Google + email; Apple sign-in added at packaging) | Free to 50k MAU |
| Database | Cloud Firestore | Free: 1 GiB, 50k reads / 20k writes per day |
| Media storage | **Cloudflare R2** | Free: 10 GB + **$0 egress forever** — the keystone (video apps die on egress, not storage) |
| Signed URLs / quotas | one Cloudflare Worker | Free: 100k req/day |
| Hosting | **Cloudflare Pages** (free `*.pages.dev` subdomain to start) | Free, global CDN; custom domain ~$15/yr, optional until launch |
| Push | Web Push (VAPID; supported on iOS 16.4+ for installed PWAs) + email fallback (Resend/SES free tier) | Free |
| Crash/analytics | Sentry free tier + Firebase Analytics | Free |
| CI | GitHub Actions (Linux runners now — no macOS tax) | Free |

### Cost projection

~80 MB per fully-recorded tag (4 part videos + stems + thumbs; performances add metadata only — composites render client-side on export, not stored server-side except optionally caching popular ones).

| Stage | Users | Monthly cost |
|---|---|---|
| Build & personal testing | you + friends | **$0** |
| Chapter beta | ~50 | **$0** |
| Early traction | 1,000 MAU | **~$2–3** (R2 storage past 10 GB) |
| Growth | 10,000 MAU | **~$30–50** |
| Store packaging (whenever validated) | — | +$99/yr Apple, +$25 once Google |

**Total spend to a fully working, publicly testable product: $0.** First dollar spent is your call, at a gate we define together (doc 02).

### Monetization plan (Phase 3, only if costs demand)

Unchanged: core loops free forever. **TagAlong Pro ~$3.99/mo**: 1080p/no-watermark exports, unlimited active started tags (free: 3), longer tags, competition hosting. On web, payments via Stripe (no 30% Apple cut for web users — another web-first bonus); StoreKit/Play Billing added at packaging where required.

Storage hygiene: inactive unfinished tags archived after 90 days (with warning + re-export window).

## Server code footprint

One Cloudflare Worker (signed URLs, upload validation, quotas), Firestore security rules, and later a tiny scheduled Worker for archival. Everything else is client TypeScript — one language across app, worker, and tooling, ideal for incremental Claude-built sessions.

## Repo layout (target)

```
TagAlong/
├── app/                      # Vite + React PWA
│   ├── src/features/         # feed, tag, record, learn, profile
│   ├── src/engine/           # recording & sync (UI-free, heavily tested)
│   ├── src/player/           # synchronized grid playback + export
│   └── src/design/           # tokens, components (from doc 05)
├── worker/                   # Cloudflare Worker (signed URLs, quotas)
├── firebase/                 # rules, indexes
├── e2e/                      # Playwright tests (incl. fake-media recording tests)
└── docs/
```

`src/engine` and `src/player` are pure-logic modules with their own test suites — the same isolation the v1 plan gave `RecordingEngine`/`CompositionKit`, so independent build sessions stay independent.

## The native escape hatch (pre-decided, so it's never a crisis)

If beta users on iPhones can't get acceptable sync even with the nudge slider, the plan is **not** a rewrite: keep the entire app as-is, wrap with Capacitor, and implement `src/engine`'s interface as a native Swift plugin (AVAudioEngine, exactly the v1 architecture — see doc 04 appendix). That decision point is Checkpoint 4, with real-device evidence either way.
