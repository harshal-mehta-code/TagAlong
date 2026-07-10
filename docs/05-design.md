# 05 — Design Direction

## Design principles

1. **Three taps to singing.** Every screen exists to get someone recording or watching. No screen may require reading a paragraph.
2. **Faces are the interface.** The 4-slot grid *is* the brand. Empty slots are invitations, not blanks — they say "Sing this part," never "No content."
3. **Stage warmth, not costume kitsch.** Barbershop soul (brass, deep curtain tones, songbook typography) without poles, handlebar mustaches, or striped vests.
4. **Platform-native polish.** SF type, SwiftUI materials, standard gestures. Custom design spends itself on the grid, the pitch pipe, and the record flow — nowhere else.

## Visual identity

| Token | Value | Use |
|---|---|---|
| Ivory | `#FAF7F0` | Light ground (warm paper, like a songbook page) |
| Ink | `#251C31` | Text; plum-biased near-black |
| Curtain | `#33224A` | Dark ground / dark-mode surfaces / record flow (always dark) |
| Brass | `#C79A3D` | Primary accent: CTAs, active states, the pitch pipe |
| Record Red | `#D64545` | Semantic only: recording states. Never decorative |

**Part colors** (information design — a part is always the same hue everywhere: slot rings, chips, waveforms):

| Part | Color | |
|---|---|---|
| Tenor | `#8FB7E8` | high & airy |
| Lead | `#E06A5A` | the melody, warm & forward |
| Bari | `#C79A3D` | brass, the "spice" part |
| Bass | `#5E8C6E` | grounded green |

**Type:** SF Pro (system) throughout the app; **New York (ui-serif) for tag titles only** — tag names set in a songbook serif is the one typographic signature. Tabular numerals for keys, timers, counts.

**Motif:** the four-quadrant grid, used as app icon (four color-tinted quadrants forming a "T"), empty-slot pattern, and loading states. One motif, everywhere.

## Information architecture

```
Tab bar: Home · [ ⊕ Start ] · Activity · Profile

Home ──── Open Tags (default; filterable by part-needed & voicing)
      └── Completed (the showcase feed)
Tag Detail ── grid + playback, per-slot takes, join CTA, share
Start a Tag ─ 3-step sheet: Setup (voicing/part/key + pitch pipe) → Record → Publish
Join flow ─── from any open slot: Pre-flight (headphones) → Listen/Practice → Record → Sync check → Submit
Activity ──── notifications (part added, tag complete, take featured, likes)
Profile ───── avatar, voice parts, tags started/sung; settings, blocked users
```

## The five signature screens (prototyped)

1. **Home / Open Tags** — cards with the 4-slot grid as hero, filled slots show faces, open slots pulse gently with part color + "Needs a Bass" chips.
2. **Tag Detail** — big grid player, take picker per slot, "Sing the Bass" primary CTA in part color.
3. **Record (Setup)** — voicing / part / key selection with the circular brass **pitch pipe** as the centerpiece; tapping it plays the pitch.
4. **Record (Live)** — always-dark: your camera fills your quadrant, other parts play in theirs, count-in overlay, record red used honestly.
5. **Sync Check** — post-record: looped playback with the nudge slider ("Too early ⟷ Too late"), waveforms in part colors, re-record / submit.

Prototype file: [`prototypes/tagalong-prototype.html`](prototypes/tagalong-prototype.html) — open in a browser; renders all five screens in phone frames with annotations. These are directional mockups for feedback on layout, tone, and flow — not pixel-final.

## Dark mode

Full support from day one (the audience skews evening/backstage usage). Ivory↔Curtain swap with tokens; part colors tuned per theme. The record flow is dark in both themes.
