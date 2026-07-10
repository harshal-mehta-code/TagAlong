# 02 — MVP Scope & Roadmap

*v2 — revised for web-first delivery and the performances model.*

## Guiding principle

The MVP must nail **one magic moment**: *you sang a part alone in your kitchen, and a week later four faces are locking a chord together in a video you can't stop rewatching.* Everything that doesn't serve that moment gets cut from Phase 1.

## MVP definition (Phase 1 — web app, $0 spend)

### In

| Area | Scope |
|---|---|
| Platform | PWA at a free `*.pages.dev` URL; tier-1 targets: **iOS Safari, Android Chrome**; installable to home screen |
| Auth | Google + email sign-in, 13+ age gate |
| Start a tag | Voicing preset (TTBB/SSAA/mixed), part pick, key pick, pitch pipe, 4-beat count-in, record ≤60 s |
| Join a tag | Headphone pre-flight (+ bleed self-test), combination picker (default: top take per part), guide mix in earbuds while recording, auto latency compensation + click self-calibration + **manual nudge slider**, re-record freely |
| Model | Tags → takes → performances (organic completion, no approvals — doc 01); take deletion by owner |
| Playback | Synchronized multi-video grid player; guide waveform timeline with playhead on record screen (entry cue v1) |
| Learning basics | Per-part solo/mute mixer, section loop, slow-down (pitch-preserved) |
| Export/share | Client-rendered 720p watermarked collage + open-slot end-card; share links just work (the app is the web player) |
| Feed | Opens on **Performances** (completed collages); **In Progress** tab for joining open tags or starting one; swap-in on every performance quadrant; ranked by recency + like-rate |
| Social minimum | Profiles with credit stats, likes, report/block, notifications (web push where supported + email fallback) |
| Ops | Sentry, analytics, feature flags, CI + preview deploys per PR |

### Out (deferred)

- barbershoptags.com catalog, part-predominant learning mixes, entry markers → **P2**
- Comments, follows, performance family-tree UI → **P2**
- **Store packaging (Capacitor, iOS/Android)** → its own phase, gated on validation *and your go-ahead to spend* ($99 Apple / $25 Google)
- Groups, challenges, competitions → **P3**
- 5–8 part tags → **P3** (data model ready from day 1)
- Monetization → absent until costs demand (doc 03)

### MVP success criteria

- Install-free: stranger clicks a shared link → watches instantly; signs up → published take in **under 3 minutes**
- ≥ 40% of started tags reach a first complete performance within 7 days
- Sync: ±20 ms after nudge on iPhone Safari + AirPods (the whole ballgame)
- Shared links traceably drive new signups

## Phases

### Phase 0 — Foundations
Vite/React/TS scaffold, design tokens, CI (lint/test/build + Cloudflare Pages preview deploys), Firebase + R2 + Worker setup. **Deliverable: skeleton PWA live at a URL on every commit.**

### Phase 1 — MVP (epics → GitHub milestones at CP3)

1. **E1 — Recording & sync engine** (`src/engine`): capture, guide playback, pitch pipe, count-in, latency comp, click self-calibration, nudge. *Riskiest code; built first as a bare test harness, validated on real phones (CP4).*
2. **E2 — Player & export** (`src/player`): synchronized grid, drift correction, solo/mute mixer, loop/slow-down, WebCodecs/ffmpeg.wasm export with watermark
3. **E3 — Backend & data**: auth, Firestore model + rules, Worker (signed URLs/quotas), notifications
4. **E4 — Core UI**: feed, tag detail, start/join flows, learning panel, profiles (from locked designs)
5. **E5 — Social minimum & beta**: likes, report/block, invite links, PWA polish, beta rollout to a real chapter

### Phase 2 — Depth
Catalog integration, entry markers, comments/follows, family trees, ranking v2, **weekly leaderboard** (lightweight card atop the feed). **Store packaging (Capacitor)** slots here when: retention holds, sync quality proven, and you approve the developer-account spend.

**Rollout ladder within Phase 1:** (a) owner self-testing at the preview URL from the first working build, (b) hand-picked friends via link-visibility tags — no public content required, (c) chapter/community beta. The product supports this natively: per-tag `public | link` visibility means the app is fully testable before anything is public.

### Phase 3 — Community & events
Groups, weekly challenges, competitions, 5–8 parts, monetization if needed.

## Checkpoint cadence (you + me)

| Checkpoint | Gate | You review |
|---|---|---|
| **CP1** ✅ | Plan direction | Docs v1 + prototypes |
| **CP2 (now)** | Plan locked | These v2 docs — remaining questions in doc 06 |
| **CP3** | Issues created | GitHub epics/issues/milestones for Phase 0–1 |
| **CP4** | E1 spike proof | Video of two phones' takes locking in sync (web engine) — go/no-go on native escape hatch |
| **CP5+** | Per-epic PRs | Working preview URLs per PR |

> **CP4 is the project's only real technical risk.** Everything else is standard product engineering. We spend the first build sessions there on purpose.
