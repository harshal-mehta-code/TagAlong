# 06 — Checkpoint 1: Decisions Needed From You

Answer inline, in a PR comment, or just tell the next Claude session "doc 06: 1a, 2b, …". Every question has my recommendation marked **(rec)** — "all recommendations" is a valid one-line answer.

## Product

**1. The "takes" model** — multiple people can record the same open slot; the creator picks the featured take (doc 01).
   a. **(rec)** Yes, takes + creator curation
   b. First-come-first-served slots (simpler, but one bad take ruins a tag)
   c. Creator approves each take *before* it appears at all (more control, more friction)

**2. Anonymous/random joining scope for MVP** — "find a random tag and tag along" is core to your vision.
   a. **(rec)** All public tags are open to anyone from day one; creator can set invite-only per tag
   b. MVP is invite-only; open/random joining comes in Phase 2 once moderation is proven

**3. Voicing labels at MVP:** TTBB + SSAA + mixed presets (all are 4 parts; just labels/part names)?
   a. **(rec)** All three presets — near-zero extra cost, doubles the addressable community
   b. TTBB only, add others later

**4. Max tag length:** a. **(rec)** 60 s free (real tags fit), longer for Pro later · b. 90 s for everyone

## Business

**5. Cost ceiling.** The stack is ~$0 until roughly 1–2k users, then single-digit $/mo (doc 03). What monthly spend are you comfortable with before we're *forced* to ship monetization? (My planning assumption: **~$25/mo** trigger.)

**6. Apple Developer account ($99/yr)** — the one unavoidable cost. Do you already have one? (Needed by Phase 0 for TestFlight; also determines the app's bundle ID / team.)

**7. Monetization philosophy** (Phase 3, only if needed):
   a. **(rec)** Freemium sub: core loops free forever; Pro = 1080p/no watermark/unlimited active tags/competition hosting
   b. Fully free as long as humanly possible, decide later under pressure
   c. Something else (tips? one-time unlock?)

## Technical

**8. Firebase (Auth/Firestore/FCM) + Cloudflare R2 + one Worker** as the backend (doc 03)?
   a. **(rec)** Yes
   b. Prefer a different stack (say which)

**9. Bluetooth sync fallback.** AirPods latency means MVP guarantees alignment via a **manual nudge slider** with auto-compensation getting close; fully-automatic alignment (onset correlation) lands in Phase 2 (doc 04). Acceptable for MVP?
   a. **(rec)** Yes — nudge slider is fine for beta
   b. No — automatic alignment is a launch requirement (adds meaningful time to E1)

**10. Min iOS version:** a. **(rec)** iOS 17 · b. iOS 16 (older device reach, some API cost)

## Design

**11. Direction check** (see prototypes): warm ivory/plum/brass identity, part-color system, songbook-serif tag titles, always-dark record flow. Right direction, or push another way (more playful? more minimal/clinical? more vintage?)

**12. The name "TagAlong"** — locked? (Affects bundle ID, universal-link domain — e.g. `tagalong.app`-style domain, ~$15–30/yr — and watermark design. Worth a quick App Store search for conflicts before CP2.)

## Process

**13. Checkpoint approvals** happen via: a. **(rec)** you comment on the PR / repo and start the next session with your answers · b. GitHub issues per decision

---

*After your answers: CP2 locks these into the docs, finalizes the data model and designs, then CP3 generates the full GitHub epic/issue breakdown for the build sessions.*
