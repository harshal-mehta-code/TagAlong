# M2 — E2: Player & Export

The performed collage (doc 04): performances play as synchronized individual videos — no pre-rendered composite except at export/share time. Lives in `app/src/player`. Can run parallel to M3 once M1 lands.

### [M2-15] player: synchronized multi-video grid controller
> meta: labels=epic:player,type:feature,risk:high · milestone=M2 · depends=[M1-08]

**Scope:** `SyncPlayer`: N `<video>` elements start at per-take `offsetMs` against one master clock; rAF monitor loop; drift correction via micro `playbackRate` adjust (±2%), hard re-seek if error > 40 ms; buffering/stall handling (pause-all, resume-together); play/pause/seek API; 2×2 grid layout keyed off `parts.length` (future 5–8 support = new layouts only).

**Acceptance:** Unit tests with simulated clocks verify correction logic; on-device: 4 videos of a click track stay audibly locked over 60 s; artificial 100 ms perturbation recovers < 1 s.

### [M2-16] player: per-part audio mixer (solo / mute / gain)
> meta: labels=epic:player,type:feature · milestone=M2 · depends=[M2-15]

**Scope:** Route each video's audio through `AudioContext` gain nodes (element source nodes); solo/mute/volume per part; master gain; mixer state API for the learning panel (M4-33); iOS Safari caveats handled (user-gesture unlock, element-source limitations — document findings).

**Acceptance:** Soloing bari silences others without desync; state changes are glitch-free; works on real iPhone Safari.

### [M2-17] player: learning controls — section loop + pitch-preserved slow-down
> meta: labels=epic:player,type:feature · milestone=M2 · depends=[M2-15],[M2-16]

**Scope:** A/B loop region (set/clear, snap to 0.1 s); playback rate 0.5×–1× using native `playbackRate` (pitch preserved by default; assert `preservesPitch` across tier-1 browsers); loop + rate + solo compose correctly.

**Acceptance:** Loop a 5 s phrase at 0.75× with lead soloed — stable for 10+ cycles on device.

### [M2-18] player: guide waveform timeline with playhead (entry cue v1)
> meta: labels=epic:player,type:feature · milestone=M2 · depends=[M1-13]

**Scope:** Compute peaks from guide stems (Web Worker, cached per take); canvas waveform strip in part colors, stacked or merged; moving playhead synced to clock during playback **and recording**; tap-to-seek in player contexts (disabled while recording); respects reduced-motion.

**Acceptance:** Waveform renders < 500 ms for a 60 s stem on mid device; playhead drift vs audio < 1 frame; visible during record flow.

### [M2-19] export: WebCodecs canvas compositor (fast path)
> meta: labels=epic:player,type:feature,risk:high · milestone=M2 · depends=[M2-15]

**Scope:** Offline-composite a performance to a single 720p mp4: decode part videos (WebCodecs `VideoDecoder`), draw 2×2 frames to canvas with part-color frames + watermark + 2 s end-card ("Sing the open part → link"); encode `VideoEncoder` (H.264) + AAC audio (via `AudioEncoder` where available); mux (mp4-muxer); progress callbacks; capability detection API `canFastExport()`.

**Acceptance:** 30 s test performance exports on Android Chrome and Safari 17+ desktop; output plays in QuickTime/Photos; A/V sync within one frame; graceful `unsupported` signal where APIs missing.

### [M2-20] export: ffmpeg.wasm fallback + capability routing
> meta: labels=epic:player,type:feature · milestone=M2 · depends=[M2-19]

**Scope:** ffmpeg.wasm path producing the same output spec for browsers failing `canFastExport()`; lazy-load the wasm bundle (~30 MB) only on demand; verify COOP/COEP from M0-03 enables SharedArrayBuffer; UX contract: progress + "keep this tab open" messaging; router picks fast path → wasm → "export on another device" message as last resort.

**Acceptance:** A browser with WebCodecs disabled still exports the test performance (slower is fine); bundle not loaded unless needed (network assertion in E2E).

### [M2-21] share flow: export → share sheet / download, with R2 render cache
> meta: labels=epic:player,type:feature · milestone=M2 · depends=[M2-19],[M2-20],[M0-05]

**Scope:** "Share" on a performance: check R2 `exports/{perfId}.mp4` cache → else render client-side, upload to cache (signed PUT), then Web Share API (files where supported) / download fallback + copy-link; share link = canonical performance URL (the app is the player).

**Acceptance:** Second share of the same performance skips rendering (cache hit); iPhone share sheet receives the video file; copy-link works everywhere.
