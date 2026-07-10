# 04 — Technical Architecture

## The hard problem: synchronized async recording

Everything else in this app is standard CRUD + video playback. The product lives or dies on one thing: **when four people record separately, the parts must lock together within ~20 ms** (past ~30–40 ms, ensemble singing audibly "flams").

### Recording timeline model

The **first recording defines the master timeline**. Its clock starts at the first beat of the count-in, not at record-tap:

```
|-- pitch pipe (freely, pre-roll) --|-- count-in: 4 clicks --|-- singing --|
                                    t=0                      t=T_start
```

Every subsequent part records against playback of the existing mix and is aligned to the same t=0.

### Sync pipeline (per join-recording)

1. **Route pre-flight.** `AVAudioSession` route check: require headphones/AirPods (else the guide mix bleeds into the mic). Friendly blocking UI, not an error state.
2. **Session config.** `AVAudioSession` category `.playAndRecord`, mode `.measurement` (disables system voice processing — we want the raw voice, no echo cancellation mangling), preferred sample rate 48 kHz, small IO buffer.
3. **Guide playback + capture on one clock.** `AVAudioEngine` plays the guide mix; mic is captured via the same engine's input node. Video runs on a parallel `AVCaptureSession`. All three are reconciled with **host-time (`mach_absolute_time`) timestamps**: the engine reports the host time at which the guide's sample 0 actually hit the output, capture buffers carry host-time presentation stamps.
4. **Latency compensation.** Effective offset = `outputLatency + inputLatency` (from `AVAudioSession`) applied to the host-time math. This gets us to ~±10–15 ms on wired/built-in, slightly worse on Bluetooth.
5. **Bluetooth caveat (AirPods).** BT output latency is large (~100–200 ms) and only approximately reported. Mitigations, in order: (a) reported-latency compensation as above, (b) **onset cross-correlation**: the count-in clicks are also present in the master audio; we correlate the singer's first sung onset envelope against expectation — Phase 2, (c) **manual nudge slider** (±250 ms, 5 ms steps) with instant loop preview — MVP's guaranteed-to-work fallback, and honestly what pros expect anyway.
6. **Trim & normalize.** Recording is trimmed to the master timeline, loudness-normalized (simple RMS target), saved as: `part.mov` (video+audio) + `part.m4a` (audio-only, used as the guide stem for future joiners — cheaper to download than video).

> **E1 exit criteria (Checkpoint 4):** two AirPods-recorded parts on real devices align within ±20 ms after manual nudge, and within ±50 ms automatically. Validated with a click-track test harness before any product UI exists.

### Compositing (on-device, E2)

- `AVMutableComposition`: N video tracks + N audio tracks, each shifted by its stored offset.
- 2×2 layout via `AVMutableVideoComposition` layer instructions (transform + crop per quadrant); empty slots get a branded placeholder card ("This tag needs a bass → tagalong.app/t/abc").
- Watermark via Core Animation overlay layer.
- Export: HEVC 720p ≈ 20 MB/60s (1080p reserved for Pro). Runs as a background task with progress UI.
- The **joiner's device** produces and uploads the updated composite — the backend never renders anything.

## Data model (Firestore)

```
users/{uid}
  displayName, avatarPath, voiceParts[], bio, createdAt, blockedUids[]

tags/{tagId}
  title, creatorUid, voicing (ttbb|ssaa|mixed), key ("Bb"),
  status (open|complete|archived), partsNeeded[], durationMs,
  featuredTakes: { tenor: takeId?, lead: takeId?, bari: takeId?, bass: takeId? },
  compositePath, thumbPath, likeCount, visibility (public|link), createdAt, completedAt?
  parentTagId?          # re-tag lineage (P2 UI, in the model from day 1)

tags/{tagId}/takes/{takeId}
  uid, part (tenor|lead|bari|bass), videoPath, audioStemPath,
  offsetMs, status (active|removed), createdAt

likes/{uid_tagId}                     # flat for easy rule-checking
reports/{reportId}                    # targetType, targetId, reporterUid, reason
notifications/{uid}/items/{id}        # type, tagId, actorUid, read
```

Key decisions:

- **Takes are subordinate to tags**, and `featuredTakes` on the tag is the single source of truth for "what plays." Featuring is creator-only (enforced in security rules). Non-featured takes remain visible on the tag detail page.
- **Denormalized counters** (`likeCount`) maintained by security-rule-validated client increments at MVP scale; move to Functions if abuse appears.
- **`parentTagId`** future-proofs re-tag trees with zero extra MVP work.

## Media storage layout (R2)

```
media/{tagId}/takes/{takeId}.mov        # video+audio part
media/{tagId}/takes/{takeId}.m4a        # audio stem (guide mix source)
media/{tagId}/composite/v{n}.mp4        # regenerated on each featured change
media/{tagId}/thumb.jpg
avatars/{uid}.jpg
```

Flow: client asks Worker for a signed PUT (Worker verifies Firebase ID token + per-user quota/size caps) → uploads direct to R2 → writes Firestore metadata. Downloads via signed GETs (24 h expiry) so private/link-only tags stay private. Public composites can later go behind Cloudflare's free CDN cache.

## Client architecture

- **MVVM + lightweight services**, SwiftUI-first. `@Observable` view models per feature; services (`TagStore`, `MediaClient`, `AuthService`, `RecordingSession`) injected via environment.
- **`RecordingEngine` and `CompositionKit` are UI-free local Swift packages** with deterministic unit tests (synthetic buffers for sync math; golden-file tests for composition timing).
- Offline-tolerant drafts: a recorded take persists locally and retries upload; users record in church basements.
- Feature flags via a Firestore `config/` doc (kill switches, staged rollout).

## Security & App Store compliance

- Firestore rules: users write only their own takes; only creators mutate `featuredTakes`/tag status; blocked-user filtering client-side at MVP.
- UGC requirements: report + block + a takedown path (report queue reviewed manually at first) — mandatory for approval.
- Privacy: mic + camera purpose strings; App Privacy nutrition label (account-linked content); videos of minors → 13+ age gate at signup.
- No third-party ads/trackers → clean privacy story, faster review.
