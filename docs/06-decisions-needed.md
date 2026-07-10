# 06 — Checkpoint 2: Decisions & Status

*v2 — CP1 feedback incorporated. Resolved items recorded for the project log; open items below need your word to lock the plan.*

## ✅ Resolved at Checkpoint 1 (your feedback → plan changes)

| # | Decision | Outcome |
|---|---|---|
| 1 | Slot model | **Combinatorial performances** (your proposal): takes are open to all, every completed combination becomes its own feed post, engagement ranks them. No approvals. Docs 01/04 rebuilt around this. |
| 2 | Platform & cost | **Web-first PWA** ($0 to fully working product), Capacitor packaging for App/Play Store only after validation and your explicit go-ahead to spend. Doc 03 rebuilt. |
| 3 | Learning | Elevated to a core loop: solo/mute mixer, loop, slow-down in **MVP**; part-predominant mixes + **barbershoptags.com API** integration in P2. |
| 4 | Part counts | 4 parts at MVP; data model is part-count-agnostic (`parts[]`) so 5–8 parts is P3 UI work, not a migration. |
| 5 | Entry cues | MVP: count-in + guide waveform timeline with playhead; P2: onset-detected entry markers with "in 2…1…" flash; P3: lyric cues. |
| — | Design direction | Approved ("looks pretty nice") — identity carries over to the web app unchanged. |

## ❓ Open — please answer to lock CP2

**1. Web-first confirmation.** Doc 03 lays out the honest trade-offs (biggest: iOS Safari recording quality risk, mitigated by nudge slider + native-plugin escape hatch; biggest win: $0 and share-links-just-work). **Confirm web-first, or push back.** *(My rec: confirm.)*

**2. Cost ceiling.** Still open from CP1: what monthly spend triggers "ship monetization"? *(My planning assumption: ~$25/mo.)*

**3. Beta audience.** Do you have a barbershop chapter / tag-singing circle you can recruit ~10–50 beta testers from when Phase 1 ships? (Shapes how much onboarding polish MVP needs.)

**4. Auth providers for web MVP:** a. **(rec)** Google + email · b. email-only · c. also Facebook (the community lives in Facebook groups — could add in P2 when share loops mature)

**5. barbershoptags.com outreach.** P2 integration should respect their API terms and ideally a friendly heads-up to the maintainer. Do you want to own that outreach when the time comes, or should a session draft the note for you? *(No action needed until P2.)*

**6. Name check.** "TagAlong" — locked? Worth a 10-minute trademark/App-Store/domain sweep before CP3 bakes it into URLs and watermarks. A free `tagalong.pages.dev`-style subdomain starts us; custom domain (~$15/yr) is optional until launch. Buy one now or stay free? *(My rec: stay free until beta.)*

**7. Anything you'd cut or add to the MVP table in doc 02** before it becomes ~40 GitHub issues at CP3?

---

## Previously resolved (CP1, unchanged)

- Public tags open to anyone from day one; per-tag invite-only option ✔
- TTBB + SSAA + mixed presets at MVP ✔
- 60 s cap free tier ✔
- Freemium-sub philosophy if monetization ever needed ✔
- Firebase + R2 + Worker backend ✔ (now serving a web client)
- Nudge-slider sync acceptable for MVP ✔ (now with click self-calibration bonus)

*Next: your answers → CP3 generates the full epic/issue breakdown for the build sessions.*
