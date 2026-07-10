# M4 — E4: Core UI

The five signature screens (doc 05 + prototypes) become the real app, consuming M1–M3 interfaces. Design tokens/components only — no ad-hoc styling.

### [M4-29] Design system components
> meta: labels=epic:ui,type:feature · milestone=M4 · depends=[M0-01]

**Scope:** Reusable components per doc 05 + prototype: buttons (brass primary, part-color CTAs, ghost), part chips + slot rings, key chip, cards, segmented control, tab bar with brass ⊕, avatar, empty-slot "Sing the X" treatment, songbook-serif title style (bundled OFL serif for non-Apple), toasts, sheet/modal; Storybook-style demo route `/design` for visual review in both themes.

**Acceptance:** `/design` shows every component in light+dark at iPhone width; no raw hex outside token files (lint rule).

### [M4-30] App shell: navigation, deep links, PWA polish
> meta: labels=epic:ui,type:feature · milestone=M4 · depends=[M4-29],[M3-24]

**Scope:** Tab navigation (Home / ⊕ Start / Activity / Profile); route map incl. canonical share URLs `/t/{tagId}`, `/p/{perfId}` (public playback without auth for public content); auth gating with return-to intent; PWA icons/splash, "Add to Home Screen" coach-mark (feeds M3-27); 404/offline states.

**Acceptance:** Cold-load `/p/{id}` of a public performance plays without sign-in; private link prompts auth then returns; installs cleanly to iPhone home screen.

### [M4-31] Home feed: Performances + In Progress
> meta: labels=epic:ui,type:feature · milestone=M4 · depends=[M4-29],[M3-28],[M2-15]

**Scope:** Default tab **Performances**: cards with autoplay-on-visible muted preview (SyncPlayer thumbnail mode), like count, tap → performance view. **In Progress** tab: prototype card design (mini-grid, open slots pulsing in part color, "Needs a Bass" chips, key/voicing meta), filters (part needed, voicing), "Start a tag" entry; pull-to-refresh, infinite scroll, skeleton states; leaderboard slot reserved (P2, behind flag, hidden).

**Acceptance:** Matches prototype visual direction (owner review on preview URL); feeds paginate smoothly on mid-range phone; filters drive M3-28 queries.

### [M4-32] Performance view: grid player + swap-in + like/share
> meta: labels=epic:ui,type:feature · milestone=M4 · depends=[M4-29],[M2-15],[M2-21],[M3-28]

**Scope:** Full-screen SyncPlayer grid; per-quadrant overlay on pause/long-press: singer credit + **"Sing this part yourself"** → join flow seeded with the other three takes as guide combo (the Jason case); like button (optimistic); share → M2-21 flow; family link ("4 performances of this tag"); report entry point per quadrant.

**Acceptance:** Swap-in from a completed performance lands in join flow with correct guide takes preselected; resulting new performance appears in feed (E2E against emulator + fake media).

### [M4-33] Tag detail: takes browser, combination picker, learn panel
> meta: labels=epic:ui,type:feature · milestone=M4 · depends=[M4-29],[M2-16],[M2-17],[M2-18],[M3-28]

**Scope:** Open-tag view per prototype: grid preview of current default combo, per-part take browser (swipe alternates, like counts), combination picker (defaults to top take per part, user can swap before joining), **Learn panel**: per-part solo/mute mixer, A/B loop, slow-down (M2 controls), waveform timeline; "Sing the X" part-colored CTA → join flow.

**Acceptance:** Picking an alternate lead changes the guide combo passed to join flow; learn controls work on device; open slots render the invitation treatment, never emptiness.

### [M4-34] Start-a-tag flow
> meta: labels=epic:ui,type:feature · milestone=M4 · depends=[M4-29],[M1-09],[M1-13],[M1-14],[M3-25]

**Scope:** 3-step sheet per prototype: **Setup** (title, voicing preset TTBB/SSAA/mixed, part pick with "you" stamp, key row, tappable brass pitch pipe, duration ≤ 60 s) → **Record** (always-dark, count-in serif numerals, waveform strip, record ring) → **Publish** (visibility public/link, preview playback, publish/discard); creates tag + first take via M3 pipeline; draft-safe at every step.

**Acceptance:** Full flow on real iPhone: pitch → count-in → sing → publish → appears in In Progress feed; abandoning mid-flow leaves a recoverable draft, no orphan docs.

### [M4-35] Join flow: pre-flight → practice → record → sync check → submit
> meta: labels=epic:ui,type:feature · milestone=M4 · depends=[M4-29],[M1-14],[M1-13],[M2-18],[M3-25],[M3-26]

**Scope:** The product's core flow, per prototype screens 4–5: pre-flight (M1-14 styled), optional practice loop (guide mix + learn controls), record (guide in ears, other parts' videos playing in grid, count-in, waveform playhead), **sync check** (loop preview, nudge slider ±250 ms with live value, re-record guilt-free), submit → upload → completion celebration if performance born ("🎉 Chord locked").

**Acceptance:** E2E fake-media: join → submit → take doc + media exist; completing combo creates performance + notifications; on real iPhone with AirPods: recorded part audibly locks after nudge (the MVP success criterion).

### [M4-36] Profile & settings
> meta: labels=epic:ui,type:feature · milestone=M4 · depends=[M4-29],[M3-24],[M3-28]

**Scope:** Profile: avatar (upload → R2), display name, voice parts, credit stats ("in 12 performances"), grids of my takes / my performances (with delete-own-take entry); settings: notification prefs, blocked users list, sign out, delete account, legal links (privacy/terms pages).

**Acceptance:** Editing profile persists; my-takes delete flows to M5-38 logic; stats match emulator-seeded data.
