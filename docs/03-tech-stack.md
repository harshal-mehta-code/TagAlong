# 03 — Tech Stack & Cost Analysis

## Client

| Layer | Choice | Why |
|---|---|---|
| Language | **Swift 6** | Native performance is non-negotiable for AV work; strict concurrency catches the race conditions AV code breeds |
| UI | **SwiftUI**, min **iOS 17** | Fast to build/polish; iOS 17 floor gives modern APIs (Observation, SwiftData if needed) while covering ~90%+ of active devices in 2026 |
| Capture/playback | **AVFoundation + AVAudioEngine** (UIKit interop where needed) | The whole product; detailed in doc 04 |
| Compositing | **AVMutableComposition / AVVideoComposition, on-device** | Keeps the backend dumb and free — no server transcoding, ever. Phones are plenty fast for 4×720p |
| Project generation | **XcodeGen** (`project.yml` → `.xcodeproj`) | `.xcodeproj` files are merge-conflict hell for multi-session AI development; a declarative YAML project is reviewable and deterministic |
| Dependencies | Swift Package Manager only | No CocoaPods; keeps CI simple |
| Purchases (P3) | StoreKit 2 | If/when monetization ships |

**Cross-platform (Flutter/React Native) was rejected:** frame-accurate multi-track AV recording, hardware audio timestamps, and custom video compositors are exactly where cross-platform frameworks fall apart. Android later means a second native client — that's the honest cost of this product category.

## Backend

Principle: **the backend stores metadata and blobs; it never touches video.** All heavy lifting (mixing, compositing, transcoding) happens on-device. This single decision is what makes a near-free backend possible.

| Concern | Choice | Free tier reality |
|---|---|---|
| Auth | **Firebase Auth** | Free at any realistic scale (50k MAU) |
| Database | **Cloud Firestore** | Free: 1 GiB storage, 50k reads / 20k writes per day — ample for metadata at beta scale |
| Media storage | **Cloudflare R2** | Free: 10 GB storage, 1M writes + 10M reads /mo, and — critically — **$0 egress forever** |
| Signed upload/download URLs | **Cloudflare Worker** (~50 lines) | Free: 100k requests/day |
| Push | **FCM → APNs** | Free |
| Crash/analytics | **Firebase Crashlytics + Analytics** | Free |
| CI | **GitHub Actions** | Free for public repo; 2,000 min/mo private (macOS runners burn 10×, so we keep CI lean) |

### Why R2 and not Firebase Storage / Supabase / S3

Video social apps die on **egress** (people watching videos), not storage. A completed tag ≈ 20 MB; one modestly viral tag watched 5,000 times = 100 GB of egress. That's ~$12 on S3/Firebase (after free tier) *per viral video* — versus **$0 on R2**. R2's zero-egress pricing is the single biggest lever for the "keep it free" goal. Supabase's free tier (1 GB storage, 5 GB egress/mo) is exhausted by roughly the 3rd popular tag.

### Cost projection (honest numbers)

Assumptions: 60s max clips, 720p HEVC ≈ 15 MB/part, 20 MB/composite ⇒ ~80 MB per completed tag (4 parts + composite + thumbs).

| Stage | Users | Tags stored | Monthly cost |
|---|---|---|---|
| Beta | 50 | ~150 | **$0** (inside all free tiers) |
| Early | 1,000 MAU | ~2,000 (160 GB) | **~$2–3** (R2 storage @ $0.015/GB over free 10 GB; Firestore likely still free) |
| Growth | 10,000 MAU | ~25,000 (2 TB) | **~$30–50** (R2 storage + Firestore Blaze overage) |
| Scale | 100k MAU | 20 TB+ | **~$300–500** — this is where monetization must exist |

**Unavoidable fixed cost:** Apple Developer Program, **$99/year**. There is no free path to the App Store.

### The honest answer to "can the backend be free?"

**Yes through beta and early growth (roughly the first 1–2k users), effectively yes (<$5/mo) beyond that for a long while** — *because* of the on-device-compositing + R2 architecture. It stops being free only if the app succeeds, at which point:

### Monetization plan (Phase 3, only if needed)

Free tier stays genuinely useful forever (record, join, share — the loops never paywall). **TagAlong Pro, ~$3.99/mo or $24.99/yr**:

- 1080p exports, no watermark
- Unlimited *active started* tags (free: 3 open at a time — a natural, fair limiter that also caps storage growth)
- Longer tags (up to 2 min), custom collage layouts
- Host competitions/challenges (P3 feature)

Storage hygiene also controls cost: unfinished tags with no activity for 90 days get a warning → archived (parts deleted, metadata kept); contributors can always re-export before archive. Old raw parts of *completed* tags can be cold-archived after the composite exists.

## Server code footprint

Total custom backend code at MVP: **one Cloudflare Worker** (signed URLs + upload validation) and **Firestore security rules**. Optionally a couple of Firebase Functions for fan-out push notifications (Blaze plan has a permanent free allowance covering millions of invocations; a card on file is required but beta usage bills $0). Everything else is client code — which is exactly what we want for incremental Claude-built development: one language, one repo, minimal deployed surface.

## Repo layout (target)

```
TagAlong/
├── project.yml              # XcodeGen definition
├── App/                     # SwiftUI app target
│   ├── Features/            # Feed, TagDetail, Record, Profile…
│   ├── DesignSystem/        # Colors, type, components (from doc 05)
│   └── Services/            # Auth, TagStore, MediaClient, PushService
├── Packages/
│   ├── RecordingEngine/     # E1 — capture, monitoring, sync (pure AV, no UI)
│   └── CompositionKit/      # E2 — collage compositing & export
├── Worker/                  # Cloudflare Worker (TypeScript, ~1 file)
├── firebase/                # Firestore rules, indexes
└── docs/                    # These documents
```

`RecordingEngine` and `CompositionKit` are local Swift packages with their own unit tests — isolatable, testable without the app, and perfect units for independent Claude build sessions.
