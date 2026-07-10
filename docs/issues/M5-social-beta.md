# M5 — E5: Social Minimum & Beta

Safety, sharing loops, and hardening — the gap between "works" and "give it to strangers."

### [M5-37] Likes + credit stats
> meta: labels=epic:beta,type:feature · milestone=M5 · depends=[M3-22],[M4-32]

**Scope:** Like/unlike on performances (`likes/{uid_perfId}` + rules-validated counter increment); optimistic UI; take-level credit rollup ("your bass is in 12 performances", "took 87 likes this week") on profile + notification on like milestones (10/50/100); abuse guard: rate limit via rules timestamps.

**Acceptance:** Rules tests: double-like impossible, counter can't be tampered arbitrarily; stats update visibly after like.

### [M5-38] Safety: report, block, delete-own-take, takedown
> meta: labels=epic:beta,type:feature · milestone=M5 · depends=[M3-22],[M3-23],[M4-32],[M4-36]

**Scope:** Report flow (performance, take, user; reason picker) → `reports` queue + email alert to owner; block user (hides their content everywhere via M3-28 filtering, mutual invisibility); delete-own-take: take → `removed`, media deleted via Worker, containing performances hidden from feeds with "a singer removed their part" state; account deletion cascade (takes removed, profile anonymized); owner moderation page (simple `/admin` route, owner-uid gated): review reports, remove content.

**Acceptance:** E2E: blocked user's performances vanish from my feeds; deleted take's media 404s within a minute; report lands in admin queue. This issue closes the App-Store-readiness UGC checklist (doc 04).

### [M5-39] Invite links, link visibility, and OG previews
> meta: labels=epic:beta,type:feature · milestone=M5 · depends=[M4-30],[M2-21]

**Scope:** "Invite a bass" per open slot → share URL with part context (`/t/{id}?part=bass` → landing emphasizes that slot); link-only tags reachable solely by URL (rules from M3-22); Open Graph/Twitter meta served by a tiny Worker route for link unfurls in Messages/WhatsApp/Facebook (title, "Needs a bass — tap to sing", thumbnail); copy-link everywhere sharing exists.

**Acceptance:** Pasting a tag link into a chat unfurls with title+image; link-only tag: reachable via URL, absent from feeds; `?part=` deep link preselects the slot.

### [M5-40] Onboarding & empty states
> meta: labels=epic:beta,type:feature · milestone=M5 · depends=[M4-31],[M4-34]

**Scope:** First-run 3-card explainer (what a tag is, how tagging along works, headphones matter) — skippable, < 15 s; empty states as invitations per design principle #2 (empty feed → "Start the first tag" / seeded demo tag); contextual first-time hints (pitch pipe, nudge slider) shown once; "just sing the melody" framing for the lead part in copy (doc 01 persona 3).

**Acceptance:** Fresh account reaches published take in < 3 min in a moderated test (MVP success criterion 1); no dead-end empty screens anywhere (crawl check).

### [M5-41] Analytics, crash reporting, feature flags
> meta: labels=epic:beta,type:infra · milestone=M5 · depends=[M0-04]

**Scope:** Sentry (source maps via CI); privacy-lean analytics events for funnel: install→signup→first-listen→first-record→first-publish→first-complete, share/export events, sync-nudge magnitude distribution (product signal for CP4 follow-up); feature-flag service reading `config/flags` (kill switches: uploads, exports, signups; leaderboard flag pre-created off).

**Acceptance:** Test crash appears in Sentry with readable stack; funnel events visible; flipping `uploads` flag disables recording with friendly messaging, no deploy.

### [M5-42] Beta hardening: device QA, performance budget, a11y sweep
> meta: labels=epic:beta,type:qa · milestone=M5 · depends=[M4-31],[M4-32],[M4-33],[M4-34],[M4-35],[M4-36],[M5-38]

**Scope:** Scripted QA matrix on real devices (iPhone Safari wired/AirPods/speaker-blocked, Android Chrome, iPad, desktop) covering all five core flows; performance budget: cold load < 3 s on 4G mid-device, feed scroll 60 fps, memory during 4-video playback; a11y: focus states, labels, contrast (both themes), reduced-motion honored, captions note for exports (P2 ticket filed); fix-or-file everything found; `docs/qa-checklist.md` becomes the regression script.

**Acceptance:** QA checklist executed and committed with results; zero P0/P1 open; owner sign-off → **beta invite links go out** (rollout ladder step b, doc 02).
