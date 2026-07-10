# 06 — Decisions & Status

*v3 — **PLAN LOCKED** at Checkpoint 2. Next: Checkpoint 3 — epic/issue breakdown.*

## ✅ Resolved at Checkpoint 2

| # | Decision | Outcome |
|---|---|---|
| 1 | Web-first | **Confirmed** by owner, trade-offs understood |
| 2 | Beta plan | Self-testing first at the preview URL, then hand-picked friends via link-visibility tags, then community beta (rollout ladder in doc 02) |
| 3 | Name | **TagAlong locked** (alternatives considered and declined) |
| 4 | Completion | Automatic — the take that fills a combination's last part creates the performance; no manual "move to completed" |
| 5 | Swap-in | First-class: every performance quadrant offers "Sing this part yourself" → new performance posts as its own feed item |
| 6 | Feed | Opens on Performances (completed); In Progress tab for joining/starting |
| 7 | Leaderboard | Weekly, lightweight, P2 (card atop feed, resets Monday, no all-time grind) |
| 8 | Cost ceiling | Owner default: ~$25/mo assumption stands (flag before any spend regardless) |

## ✅ Resolved at Checkpoint 1 (your feedback → plan changes)

| # | Decision | Outcome |
|---|---|---|
| 1 | Slot model | **Combinatorial performances** (your proposal): takes are open to all, every completed combination becomes its own feed post, engagement ranks them. No approvals. Docs 01/04 rebuilt around this. |
| 2 | Platform & cost | **Web-first PWA** ($0 to fully working product), Capacitor packaging for App/Play Store only after validation and your explicit go-ahead to spend. Doc 03 rebuilt. |
| 3 | Learning | Elevated to a core loop: solo/mute mixer, loop, slow-down in **MVP**; part-predominant mixes + **barbershoptags.com API** integration in P2. |
| 4 | Part counts | 4 parts at MVP; data model is part-count-agnostic (`parts[]`) so 5–8 parts is P3 UI work, not a migration. |
| 5 | Entry cues | MVP: count-in + guide waveform timeline with playhead; P2: onset-detected entry markers with "in 2…1…" flash; P3: lyric cues. |
| — | Design direction | Approved ("looks pretty nice") — identity carries over to the web app unchanged. |

## ❓ Remaining (non-blocking — defaults apply unless overridden)

1. **Auth providers for web MVP:** proceeding with **Google + email**; Facebook login revisited in P2 (the community lives in Facebook groups).
2. **barbershoptags.com outreach** (P2): a session will draft the note; owner sends it.
3. **Domain:** staying on free `*.pages.dev` until beta; custom domain (~$15/yr) at owner's discretion later.

---

## Previously resolved (CP1, unchanged)

- Public tags open to anyone from day one; per-tag invite-only option ✔
- TTBB + SSAA + mixed presets at MVP ✔
- 60 s cap free tier ✔
- Freemium-sub philosophy if monetization ever needed ✔
- Firebase + R2 + Worker backend ✔ (now serving a web client)
- Nudge-slider sync acceptable for MVP ✔ (now with click self-calibration bonus)

*Next: your answers → CP3 generates the full epic/issue breakdown for the build sessions.*
