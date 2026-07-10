# M1 — E1: Recording & Sync Engine

The riskiest work in the project (doc 04). All engine code lives in `app/src/engine` as UI-free TypeScript with unit tests. **M1-07 is the CP4 go/no-go gate — do it first.**

### [M1-07] SPIKE: real-device capture + guide-playback latency measurement (CP4 gate)
> meta: labels=epic:engine,type:spike,risk:high · milestone=M1 · depends=[M0-01],[M0-03],[M0-06]

**Goal:** Prove (or disprove) that web-platform recording can hit sync targets on tier-1 devices, before any product code depends on it.

**Scope**
- Throwaway harness page (`/spike`): plays a click track via `AudioContext`, records mic via `getUserMedia` + MediaRecorder + AudioWorklet timestamps, user claps to clicks, harness reports measured offset & jitter per attempt
- Test matrix: iPhone Safari (wired + AirPods + speaker), Android Chrome (same three routes); echoCancellation/NS/AGC off; document `outputLatency`/`baseLatency` availability per browser
- Written report `docs/spike-results.md`: per-device offsets, variance across runs, whether reported latencies + click self-calibration land within ±50 ms automatic / ±20 ms after manual nudge

**Acceptance**
- Report exists with real numbers from at least one physical iPhone and one Android
- **Go/no-go recommendation** for pure-web engine vs. Capacitor native plugin (doc 04 appendix), reviewed by owner before M2+ proceeds

### [M1-08] engine: master clock service + count-in click scheduler
> meta: labels=epic:engine,type:feature · milestone=M1 · depends=[M1-07]

**Scope:** `ClockService` wrapping one 48 kHz `AudioContext`: `now()`, `schedule(fn, atTime)`, sample-accurate click scheduling (4 count-in clicks at tag tempo, distinct downbeat timbre via synthesized osc — no audio assets); master-timeline definition `t=0` = first click (doc 04 timeline model); unit tests with `OfflineAudioContext`.

**Acceptance:** Offline-rendered count-in shows clicks within ±1 sample of scheduled times; API documented in module README.

### [M1-09] engine: pitch pipe synthesizer
> meta: labels=epic:engine,type:feature · milestone=M1 · depends=[M1-08]

**Scope:** All 12 chromatic pitches (F3–E4 default octave, octave shift for SSAA presets); blown-pipe timbre via layered oscillators + noise + envelope (synthesized, no samples); sustain-while-pressed; `playPitch(key, octave)` API.

**Acceptance:** Frequency verified in tests (±1 cent via offline render FFT); sounds pipe-like on device (owner ear-check on preview URL).

### [M1-10] engine: capture pipeline (getUserMedia + MediaRecorder + worklet timestamps)
> meta: labels=epic:engine,type:feature · milestone=M1 · depends=[M1-07],[M1-08]

**Scope:** `CaptureSession`: acquires camera+mic (echoCancellation/noiseSuppression/autoGainControl **off**, 720p portrait); MediaRecorder for the content file (mp4 on Safari / webm on Chrome — capability detect); parallel `AudioWorklet` tap stamping first-frame time against `ClockService`; clean teardown; permission-state introspection for UI; drafts persisted to IndexedDB (`DraftStore`) so a refresh never loses a take.

**Acceptance:** E2E (fake devices): record 5 s, get blob + worklet timeline metadata; draft survives page reload; works on real iPhone Safari (manual check on preview).

### [M1-11] engine: latency compensation + click self-calibration
> meta: labels=epic:engine,type:feature,risk:high · milestone=M1 · depends=[M1-10]

**Scope:** Automatic offset = reported (`outputLatency`+input estimate) where available; **click self-calibration** per doc 04 §5: cross-correlate mic input during count-in against known click times (guide bleed becomes a measured round-trip offset); confidence score chooses source (measured > reported > default-per-UA table); pure functions, heavily unit-tested with synthetic signals (clean, noisy, no-bleed cases).

**Acceptance:** Synthetic tests recover injected offsets within ±5 ms at SNR ≥ 0 dB; falls back gracefully when clicks undetectable; spike-harness re-run shows automatic alignment ≤ ±50 ms on tier-1 devices.

### [M1-12] engine: trim, loudness-normalize, and extract audio stem
> meta: labels=epic:engine,type:feature · milestone=M1 · depends=[M1-10],[M1-11]

**Scope:** Trim recording to master timeline (apply computed offset); RMS normalize to target (−18 LUFS approx via simple RMS, not full loudness spec); produce upload artifacts: video file (as recorded, offset stored as metadata — no video re-encode) + audio-only stem (AAC/Opus via `AudioEncoder` where available, WAV fallback flagged for Worker-side note); emit `TakeArtifact { video, stem, offsetMs }`.

**Acceptance:** Unit tests on synthetic buffers verify trim math and normalization; stem plays back aligned with video within ±5 ms in the M2 player.

### [M1-13] engine: guide-mix player + manual nudge preview loop
> meta: labels=epic:engine,type:feature · milestone=M1 · depends=[M1-12]

**Scope:** `GuideMix`: loads chosen takes' stems, schedules against `ClockService` for recording playback; **nudge preview**: gapless loop of (guide + user take) with live-adjustable offset ±250 ms in 5 ms steps, applied without restarting the loop; final offset written into `TakeArtifact`.

**Acceptance:** Unit: offset changes apply within one loop cycle without glitches (offline render assertions). Device: dragging nudge audibly shifts alignment in real time.

### [M1-14] Record pre-flight: headphone check + bleed self-test + permissions UX
> meta: labels=epic:engine,type:feature · milestone=M1 · depends=[M1-10]

**Scope:** Pre-flight step per doc 04 §1: device enumeration where supported; explicit "I'm wearing headphones" confirmation; **bleed self-test** — play a chirp, listen on mic, warn if speaker bleed detected (reuses M1-11 correlator); in-context permission explainer screens before browser prompts; barebones styling (real UI polish is M4-35).

**Acceptance:** Speaker playback triggers the warning; headphones pass; denied permissions produce a recoverable, explained state. Verified on real iPhone.
