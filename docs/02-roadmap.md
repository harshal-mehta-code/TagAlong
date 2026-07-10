# 02 — MVP Scope & Roadmap

## Guiding principle

The MVP must nail **one magic moment**: *you sang a part alone in your kitchen, and a week later four faces are locking a chord together in a video you can't stop rewatching.* Everything that doesn't serve that moment gets cut from Phase 1.

## MVP definition (Phase 1)

### In

| Area | Scope |
|---|---|
| Auth | Sign in with Apple (primary), email/password (fallback). 13+ age gate. |
| Start a tag | Title + optional info, voicing preset (TTBB/SSAA/mixed labels, exactly 4 parts), pick your part, pick key, pitch pipe, 4-beat count-in, record up to 60s video |
| Join a tag | Headphone pre-flight check, hear featured takes of existing parts while recording, automatic latency compensation + manual nudge slider (±250 ms), re-record until happy |
| Takes | Multiple takes per open slot; creator features one; contributor can delete own take |
| Compositing | On-device 2×2 collage (720p HEVC), waveform-accurate mix, TagAlong watermark, save/share sheet |
| Feed | "Open tags" (needs your part!) and "Completed" lists; tag detail page with playback |
| Invites | Universal links; unauthenticated visitors land on App Store page |
| Social minimum | Profiles, likes, report/block, push notifications (part added, tag complete, take featured) |
| Ops | Crash reporting, basic analytics, feature flags |

### Out (deferred, with the phase they land in)

- Tag catalog / sheet music / learning tracks → **P2**
- Comments, follows → **P2**
- Re-tag version trees → **P2** (data model supports it from day 1; UI comes later)
- Web playback of share links → **P2**
- Groups/quartets, challenges, competitions → **P3**
- Variable part counts (2–8) → **P3**
- Android, iPad-optimized layout → post-PMF
- Subscriptions/paywalls → deliberately absent from MVP (see doc 03)

### MVP success criteria (how we'll know it works)

- A brand-new user can go from install → published part in **under 3 minutes**
- ≥ 40% of started tags reach completion within 7 days (the join loop works)
- Sync quality: parts align within ±20 ms after calibration on AirPods (the audio pipeline works)
- Organic installs traceable to shared videos/links (the growth loop works)

## Phases

### Phase 0 — Foundations *(1 checkpoint)*
Xcode project scaffolding, CI (GitHub Actions: build + test + lint), design system tokens as Swift code, Firebase/R2 project setup, TestFlight pipeline. **Deliverable: empty app that builds, tests, and ships to TestFlight automatically.**

### Phase 1 — MVP *(the bulk of the work; ~5 epics, see below)*
**Deliverable: TestFlight beta to a real barbershop chapter.**

Epic breakdown (each becomes a GitHub milestone at Checkpoint 3):

1. **E1 — Recording engine**: capture session, audio engine, pitch pipe, count-in, monitoring, latency calibration. *The riskiest code — built and validated first, as a standalone test harness before any UI polish.*
2. **E2 — Compositing & export**: multi-video composition, audio mix, watermark, export
3. **E3 — Backend & sync**: auth, Firestore data model, R2 upload/download, security rules, push
4. **E4 — Core UI**: feed, tag detail, start/join flows, profiles (SwiftUI, from the locked designs)
5. **E5 — Social minimum & release**: likes, report/block, invite links, App Store submission prep

### Phase 2 — Social depth *(post-beta feedback)*
Catalog, learning tracks, comments/follows, re-tag UI, web playback pages.

### Phase 3 — Community & events
Groups, weekly challenges, competitions, flexible voicings. Monetization ships here **if and only if** costs demand it (doc 03).

## Checkpoint cadence (you + me)

| Checkpoint | Gate | You review |
|---|---|---|
| **CP1 (now)** | Plan approval | These docs + prototypes → answer doc 06 |
| **CP2** | Plan locked | Revised docs, final designs, final data model |
| **CP3** | Issues created | GitHub epics/issues/milestones for Phase 0–1 |
| **CP4** | E1 spike demo | Video proof the sync pipeline works on a real device |
| **CP5+** | Per-epic PRs | Working builds via TestFlight |

> **Note on CP4:** E1 (recording/sync) is the only genuinely hard engineering in this app. We prove it early with a throwaway-quality test harness on real hardware before investing in everything else. If sync quality can't be achieved, the product pivots (e.g., audio-only alignment tooling) — better to know in week one.
