# 04 — Technical Architecture

*v2 — revised for the web-first stack and the tags → takes → performances model.*

## The hard problem: synchronized async recording

The product lives or dies on one thing: **separately recorded parts must lock together within ~20 ms** (past ~30–40 ms, ensemble singing audibly "flams"). On the web platform this is harder than native — which is why it's Epic 1 and gets a real-device spike before anything else (Checkpoint 4).

### Recording timeline model

The **first take defines the master timeline**. Its clock starts at the first count-in click:

```
|-- pitch pipe (freely, pre-roll) --|-- count-in: 4 clicks --|-- singing --|
                                    t=0                      t=T_start
```

Every later take records against playback of a chosen guide combination and is aligned to the same t=0.

### Sync pipeline (per join-recording, web)

1. **Route pre-flight.** Enumerate devices / check `MediaTrackSettings`; instruct headphones (else the guide mix bleeds into the mic). On iOS Safari, detection is limited — the UI includes an explicit "I'm wearing headphones" confirmation with a mic-bleed self-test (play a chirp, check the mic for it).
2. **One clock for everything.** A single `AudioContext` (48 kHz) schedules the count-in clicks and guide-mix playback at known `context.currentTime` values — Web Audio scheduling is sample-accurate.
3. **Capture.** `getUserMedia` (echoCancellation/noiseSuppression/autoGainControl **off** — we want the raw voice) → `MediaRecorder` for video+audio; in parallel, a `MediaStreamAudioSourceNode` → `AudioWorklet` captures raw audio frames stamped against the same `AudioContext` clock. The worklet capture is ground truth for alignment; the MediaRecorder file is content.
4. **Latency compensation.** Known offsets: `AudioContext.outputLatency`/`baseLatency` (Chrome reports well; Safari partially) + measured capture pipeline delay. Applied automatically to get within ~±30 ms on tier-1 browsers.
5. **Self-calibration (the robust trick).** During the count-in, before the singer enters, the clicks are known signals: if any bleed is detectable (speaker users, leaky headphones) we cross-correlate mic input against the known click times for a *measured* per-device round-trip offset. Cheap, automatic, and it converts our worst enemy (bleed) into a calibration signal. Where inaudible: fall back to reported latencies.
6. **Manual nudge (the equalizer).** ±250 ms slider, 5 ms steps, instant loop preview. MVP's guarantee that every user on every browser can get locked sync, and what pros expect anyway.
7. **Trim & normalize.** Trim to master timeline; RMS loudness normalization; upload `take.webm/.mp4` (video) + `take.m4a/.opus` (audio stem — the guide-mix source for future joiners, much cheaper to stream than video).

> **E1 exit criteria (Checkpoint 4):** on a real iPhone (Safari) and a real Android phone (Chrome), two takes recorded over the guide mix align within **±20 ms after nudge** and **±50 ms automatically**. Validated with a click-track harness before product UI exists. Failure on iOS ⇒ trigger the native-plugin escape hatch (appendix).

## Playback: the performed collage (no pre-rendered composite)

In-app, a performance plays as a **synchronized multi-`<video>` grid**: each part's video element starts at its stored offset from one master clock (rAF-driven controller; drift-corrected every ~500 ms by micro-adjusting `playbackRate`, resync on >40 ms error). Audio routes through the `AudioContext` mixer — which is exactly what makes **learning mode free**: per-part solo/mute/volume are just gain nodes; loop is a seek; slow-down uses `playbackRate` (browsers preserve pitch natively).

**Export** renders a real file only when someone shares: WebCodecs + canvas compositing (fast path: Chrome/Android, Safari 16.4+) with ffmpeg.wasm fallback; 720p, watermark + "sing the open part at <link>" end-card. Exports of popular performances can be cached to R2 to skip re-renders.

This kills the v1 "joiner's device re-renders composite on every join" step entirely — joining uploads only your take. Less compute, less storage, faster joins.

## Data model (Firestore) — combinatorial performances

```
users/{uid}
  displayName, avatarPath, voiceParts[], bio, createdAt, blockedUids[]
  stats: { takes, performances, likesReceived }    # denormalized credit

tags/{tagId}                     # the seed
  title, creatorUid, voicing (ttbb|ssaa|mixed|custom),
  parts[]                        # e.g. ["tenor","lead","bari","bass"] — count-agnostic (5–8 later)
  key, durationMs, visibility (public|link), status (open|archived),
  takeCounts { tenor: 3, lead: 1, ... },           # feed chips: "needs a bass"
  catalogRef?                    # P2: barbershoptags.com id
  createdAt

tags/{tagId}/takes/{takeId}
  uid, part, videoPath, audioStemPath, offsetMs,
  guideTakeIds[]                 # the combination this was sung against
  likeCount, status (active|removed), createdAt

performances/{perfId}            # perfId = hash(sorted takeIds) → combos are unique
  tagId, takeIds { tenor: takeId, ... },           # one per part, complete
  completedByUid, contributorUids[],               # for queries + notifications
  likeCount, exportPath?, createdAt

likes/{uid_perfId}
reports/{reportId}
notifications/{uid}/items/{id}
```

Key mechanics:

- **Performance creation is automatic and client-driven:** the joiner whose take fills the last open part of their chosen guide combination writes the performance doc (id = deterministic hash of take ids, so duplicates are impossible; security rules verify the writer's take is in the combo).
- **Take deletion** (contributor right): take → `removed`; performances containing it are hidden from feeds (client filter at MVP scale, scheduled Worker cleanup later). Deletion is honored everywhere — it's the singer's face.
- **Ranking:** MVP feed ranking = recency + like-rate decay, computed in queries (Firestore composite indexes); fancier scoring later.
- **`parts[]` as data, not schema** future-proofs 5–8 part tags (feedback #4): layouts key off `parts.length`.

## Media storage layout (R2)

```
media/{tagId}/takes/{takeId}.mp4       # video+audio part
media/{tagId}/takes/{takeId}.m4a       # audio stem (guide/learning source)
media/{tagId}/exports/{perfId}.mp4     # cached share renders (optional)
media/{tagId}/thumbs/{takeId}.jpg
avatars/{uid}.jpg
```

Client asks the Worker for a signed PUT (verifies Firebase ID token, size/quota caps, content-type) → direct upload to R2 → Firestore metadata write. Signed GETs (24 h) keep link-only tags private; public media later fronted by Cloudflare's free CDN cache.

## Client architecture

- React feature modules with **`src/engine`** (recording/sync) and **`src/player`** (sync playback, mixer, export) as UI-free TypeScript modules — deterministic unit tests (synthetic buffers for sync math; simulated clocks for drift correction), Playwright + `--use-fake-device-for-media-stream` for E2E.
- Local draft persistence (IndexedDB): a recorded take survives refresh/network loss and retries upload — people record in church basements.
- Feature flags via a Firestore `config/` doc.

## Security & compliance

- Firestore rules: users write only their own takes/likes; performance writes validated as above; tag archival creator-or-system only.
- UGC safety: report, block, delete-own-take, takedown queue (manual review at first).
- Web permissions: camera/mic requested in-context with explanatory UI (browser prompts are scary enough).
- 13+ age gate at signup; privacy policy page (required by Firebase/Google sign-in anyway).
- Store packaging later inherits: Apple UGC rules already satisfied by report/block/delete.

## Appendix: the native escape hatch (from v1)

If iOS Safari recording can't hit E1 exit criteria, wrap with Capacitor and implement `src/engine`'s TypeScript interface as a native plugin: `AVAudioSession` (`.playAndRecord`, `.measurement`), `AVAudioEngine` guide playback + capture on host-time clock, reported `inputLatency + outputLatency` compensation. The v1 doc's full native pipeline is preserved in git history (`docs/04-architecture.md` @ tag `checkpoint-1`) as the implementation spec for that plugin.
