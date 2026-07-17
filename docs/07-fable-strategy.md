# 07 — The Path to Addictive, Social & Shippable

*Consultant brief (Fable), 2026-07-17. Written after the native-Swift pivot and the first working on-device build. Builds on the locked product model in doc 01; supersedes the platform assumptions in docs 03–04 where noted. This is a menu to review, not a plan of record — nothing here is built yet.*

---

## 0. Where we actually are (honest snapshot)

**What works today (native iOS, on your phone):**
- Record one part against guide takes with sample-accurate host-clock sync (the thing the web version could never nail). This is the hard technical moat and it's *done and better than the competition*.
- Local 2×2 grid playback, tap-to-solo, editable key, watch/sing tabs, auto-save.
- Everything is **local to one device.** No account, no server, no other humans.

**The uncomfortable truth:** we have built the *instrument* beautifully. We have not built the *social network*, and TagAlong's entire thesis (doc 01) is that it's a social network — "a tag with an open bass slot is a built-in invitation." Right now there is no one to invite, because takes never leave the phone. **Every high-value item below depends on a backend that does not yet exist.** That is the single biggest gap between "cool demo" and "app people are addicted to," and Section 3 is how we close it.

So this brief has a spine: **make it multiplayer, then make it addictive, then make it shippable.** In that order, because addiction features on a single-player app are wasted, and store submission of a UGC app without moderation gets rejected.

---

## 1. The core loop we are optimizing for

Every decision below serves one loop. Name it, put it on the wall:

> **Watch → feel the itch → sing a part → get pulled back when someone tags along with you → watch the finished quartet with your face in it → share it → someone new watches.**

The magic moment (from doc 02, still true): *you sang alone in your kitchen, and days later four faces are locking a chord in a video you can't stop rewatching — and one of those faces is a stranger who found your open tag.* Everything that doesn't tighten that loop is a distraction.

Two under-appreciated properties of this loop we should exploit relentlessly:
- **It's asynchronous, so it survives an empty app.** Unlike a live-social app, TagAlong works with 50 users as well as 50,000 — your take just waits for its quartet. This is a huge cold-start advantage most social apps would kill for.
- **It multiplies credit.** One great bass take can appear in a dozen performances. "Your bass is in 12 performances 🎉" is a retention hook no feed-scrolling app has. Lean into it hard (Section 4).

---

## 2. The "TagAlong" social mechanic, made concrete

This is the unique wedge and deserves the most product care. Doc 01 locked the model; here's how it should *feel*, which is where most apps win or lose.

**Starting a tag** = planting a seed with open slots. When you record the first part, you pick the song, key, and which part you sang; the other three become **glowing invitations**, each labeled with the part and its color. A tag with open slots should feel like an unfinished chord that *wants* to resolve — that tension is the product.

**Joining a tag (the "tag along" act)** = the emotional peak of the app. You pick an open part, hear the existing takes in your earbuds, and sing. The instant you finish the *last* open part, the quartet **completes live in front of you** — this moment must be a celebration (Section 5): the four faces snap into the grid, a barbershop chord "rings," haptics fire, confetti of the four part-colors. Never a silent "saved."

**Swap-in (first-class, per doc 01)** = every quadrant of every completed performance says "Sing this part yourself." You tap the bass quadrant, sing against the other three, and a *new* performance is born that competes on likes. This is what makes the content combinatorial and endlessly remixable — the TikTok-duet energy, but structured.

**Design implications the current app is missing:**
- **Attribution & identity on every quadrant.** Each face needs a name/handle overlay (toggleable) so a performance is a *collaboration between people*, not four anonymous videos. Right now takes have no owner.
- **The open-tag feed.** The "Sing" tab today only shows *your* in-progress tags. The whole point is discovering *strangers'* open tags to complete. That's a server feed (Section 3).
- **Invitations as a growth vector.** "Share this open tag" should produce a link/card that says *"I sang the lead — someone sing the bass"* and deep-links a new user straight into the join flow. This is the app's built-in referral engine; treat it as P0-adjacent.
- **Collaboration chains / family tree (P2).** "This performance spawned 6 others." A visible remix lineage makes contributors feel like their take seeded a movement.

---

## 3. The backend — the unlock for literally everything social

Nothing in Sections 4–6 is possible without this. Recommend building it *before* polishing engagement features.

### 3.1 Build vs. buy — my recommendation: **Firebase (or Supabase), not custom**

At validation stage, do **not** hand-roll auth, storage, and a feed service. Use a BaaS and spend your scarce effort on the sync engine and the singing UX (your actual moat).

| Option | Verdict |
|---|---|
| **Firebase** (Auth + Firestore + Cloud Storage + Cloud Functions + FCM) | **Recommended.** Doc 04 already designed the data model against Firestore. First-class Sign in with Apple, generous free tier, push notifications built in, scales without ops. Native iOS SDK is excellent. |
| **Supabase** (Postgres + Auth + Storage + Realtime) | Strong alternative; SQL feed queries are nicer than Firestore for ranking, and pricing is more predictable at scale. Pick this if you'd rather own relational data. |
| **Custom (Node/Go + S3 + Postgres)** | **No, not now.** Months of undifferentiated plumbing. Revisit only if unit economics or ML-ranking demand it post-traction. |

**Storage/CDN for video** is the cost driver, not compute. Principle from doc 04 stays: *the backend stores metadata + blobs, it never touches video in the hot path.* Each take uploads a 720p H.264 `.mov` (video) **and** a small AAC audio stem (the cheap guide source for future joiners — streaming a stem to a joiner is ~10× cheaper than the video). Serve via CDN (Firebase Storage / Cloudflare R2). Consider R2 specifically — **zero egress fees** matter enormously for a video app that gets watched more than it records.

**Transcoding:** takes are already uniform (the recorder controls format), so we may skip a transcode pipeline at MVP and just serve the original 720p. Add HLS/adaptive bitrate only when watch-time and bandwidth bills justify it (P2). This is a real cost saver vs. assuming we need Mux/transcoding day one.

### 3.2 The global feed — how everyone sees everyone

**Two feeds, matching the two tabs we already built:**
- **Watch feed** = completed performances. Cold-start ranking: `recency × like-rate`, lightly personalized by the parts/keys you sing and who you follow. Do **not** build ML ranking now — a good heuristic feed carries you to five figures of users. A **"Featured"/curated row** (a weekly staff-picked tag, Section 4) papers over any cold-start thin-ness.
- **Sing feed** = open tags needing a part, ideally filtered to *your* voice part ("12 tags need a bass — that's you"). This is the engine of contribution and it's the most important feed to get right, because contribution is rarer and more valuable than watching.

**Cold-start / empty-feed strategy (critical — most social apps die here):**
1. **Seed content yourself.** Record 20–30 high-quality tags with open slots before launch (you + a few barbershop friends). An empty feed kills a social app on day one.
2. **Async saves us.** Because tags wait patiently for parts, a thin user base still produces completions over days. Message this: "Your tag is live — parts fill as singers find it."
3. **Ship-a-notification when your tag completes** — this is the retention spine (Section 4). It works even at tiny scale.

### 3.3 The web share-viewer comes *back* onto the critical path

Doc 03's biggest argument for web-first was "the app *is* the share link." Going native, we **lost** that — and share-ability is oxygen for a social app. So we need a **lightweight web player**: a shared performance URL opens in any browser, plays the collage, and CTAs "Get the app to sing a part." We already have a React web player in `app/` — repurpose it as a read-only viewer fed by the backend. This is high-leverage and easy to forget; flag it as P1.

---

## 4. The addiction / retention layer

Ranked by leverage. The top three are worth more than all the rest combined.

**S-tier (build first, they *are* the retention):**
1. **Push notifications, event-driven.** "🎉 Your tag is complete — hear the quartet," "Someone sang bass on your tag," "Your lead is now in 5 performances," "A tag in your key needs a tenor." These pull people back into the loop asynchronously and are the difference between a tool and a habit. FCM makes this cheap.
2. **The "your part is in N performances" credit system.** Surface it on your profile and via notifications. This is TagAlong's *unique* dopamine loop — no other app rewards you for a single great contribution being reused. Make the number climb visibly.
3. **Likes on performances** (+ a per-take "🔥 fire take" so individual contributors get love, not just whole quartets). Likes also feed the feed ranking. Keep it one-tap and haptic.

**A-tier (fun, social texture):**
4. **Follows + a light activity feed** ("Linda completed a tag you're in").
5. **Comments** on performances (moderated — see Section 6). Barbershop is a warm, encouraging community; comments will skew positive and add stickiness. Ship after reporting/blocking exist.
6. **Weekly Featured Tag / challenge.** A staff-picked song each week ("This week: sing the tag to *Hello Mary Lou*") concentrates the community onto shared content → more completions, more comparisons, more competition. Lightweight leaderboard resets Monday (doc 06 already scoped this as P2 — I'd pull *the featured tag itself* earlier; the leaderboard can wait).
7. **Streaks / "sing something this week"** — gentle, not Duolingo-guilt. A "kept the harmony alive 🎵 3 weeks" badge.

**B-tier (delight, later):**
8. **Badges/achievements**: "First quartet," "Bass in 10 performances," "Started a tag 25 people joined."
9. **Duet/react chains** surfaced as a remix tree (Section 2).
10. **Profiles as a portfolio**: your best performances, your voice part, your stats. Makes people care about their identity in the app.

**A caution on "addictive":** the healthiest, most durable hook here is *creative pride and community warmth*, not infinite-scroll compulsion. Barbershop's culture is encouraging and craft-focused. Lean into mastery and belonging (you got better, people sang with you) over slot-machine mechanics — it retains this audience better *and* keeps us on the right side of Apple's and the public's growing scrutiny of manipulative design.

---

## 5. Polish, motion & sound — making it feel expensive

The design identity is already specified (doc 05: ivory/curtain/brass, part colors, songbook serif for titles). It's good — keep it. What turns "nice" into "premium" is **motion, haptics, and sound**, which a static spec doesn't capture:

- **The completion moment** (Section 2) is the single most important animation in the app. Faces snapping into the grid, the four part-colors blooming, a real barbershop chord ringing, a crisp haptic. Budget real craft here — it's the screenshot people share and the feeling they chase.
- **Haptics as an instrument.** Count-in clicks, downbeat, record start/stop, like, solo-lock, tag-complete. `CoreHaptics` can even pulse subtly on the beat. Cheap, and it makes the app feel physical and musical.
- **Sound design.** The pitch pipe already sounds warm — extend that care to every UI sound (a soft brass "ding" on completion, a tuned tap on like). A *music* app whose UI sounds bad is a contradiction.
- **The empty slot is the brand.** Doc 05 nailed this — empty parts say "Sing this," never "no content." Animate them with a gentle breathing glow so an open tag literally beckons.
- **Transitions.** Shared-element transition from a feed tile into full-screen playback; the grid tiles should feel like physical cards. SwiftUI `matchedGeometryEffect`.
- **First-frame posters.** Every video tile needs a sharp poster frame so the grid never shows black while loading (relevant to the clipping/loading polish we're already chasing).

**One strategic styling note:** resist the barbershop *costume* (mustaches, striped vests, barber poles). Doc 05 already says this — I'm underlining it. The aesthetic should read as *warm concert stage / vintage songbook*, which ages well and doesn't alienate the broader a cappella and choral audiences we'll expand to. The four-color grid motif is a stronger, more modern brand than any mustache.

---

## 6. Trust, safety & the legal reality of shipping UGC

**This is not optional and it is not P2 — Apple will reject a UGC app without it (App Store Guideline 1.2).** To ship *at all* we must have, at submission:
- **A EULA with a zero-tolerance policy for objectionable content** (Apple literally requires this clause for UGC).
- **A report mechanism** on every performance/take/comment.
- **Blocking** — a user can block another so they never see their content or interactions.
- **A moderation path** — the ability to remove content and eject abusive users, with action within 24h of a report. At our scale this can start as *you + a dashboard*; add automated screening (e.g. a vision/audio moderation API on upload) as volume grows.
- **Age gate (13+ / 16+ per region)** and a privacy policy covering camera/mic/video data (App Privacy "nutrition label" required).

**The other legal landmine specific to a music app: song copyright.** Users singing copyrighted songs is a real exposure (mechanical + sync rights). Mitigations, roughly in order: (a) launch focused on **barbershop tags**, many of which are traditional/public-domain or community-shared — a genuinely lower-risk corpus than pop; (b) a **DMCA takedown process** and repeat-infringer policy; (c) terms placing responsibility on the uploader; (d) longer term, explore a catalog/licensing partner (the doc-06 barbershoptags.com outreach fits here). **Get a lawyer's eyes on (a)–(c) before public launch** — this is the one area where "move fast" can be genuinely expensive. Flagging it early so it's not a launch-day surprise.

---

## 7. Onboarding & identity

**Recommendation: Sign in with Apple as the primary path.** Lowest friction (Face ID, one tap, no password), privacy-friendly (hide-my-email), and if we offer *any* third-party login on iOS, Apple **requires** Sign in with Apple be offered too — so make it the hero. Add Google (and later Facebook — the barbershop community lives in Facebook groups, per doc 06) as secondary.

**The onboarding flow should get someone to their first sung note in under 90 seconds:**
1. **Watch first, no account.** Let a new user scroll the Watch feed immediately — hook them on the content before asking for anything. (Account only required to *sing* or *like*.)
2. **Pick your voice part** during signup (tenor/lead/bari/bass, with a "not sure? sing the melody = lead" helper). This personalizes the Sing feed instantly and makes them feel seen.
3. **Guided first take** against a friendly, easy seeded tag — headphone check, count-in, sing, celebrate. The first recording must succeed and feel great.
4. **Handle + optional photo.** Minimal profile.
5. **Notification permission**, asked *after* the first delightful moment (never on launch), framed as "get told when your quartet is complete."

**A key onboarding insight:** the join flow *is* the onboarding for invited users. When someone shares an open tag, the recipient should land — via the web viewer (Section 3.3) — watching that specific half-finished tag with a giant "Sing the open bass" button. Convert them inside the emotional context, not at a cold signup wall.

---

## 8. Audio/video quality — the invisible polish that separates us from Acappella

Our sync engine is already better than the web competition. To make the *output* sound produced, not homemade:
- **Loudness normalization across parts** (doc 04 mentions RMS; go to LUFS matching) so no one part drowns the others.
- **A subtle shared reverb / "room"** applied at playback so four dry bedroom recordings sound like one ensemble in one space. This single effect does more for perceived quality than anything else — bedroom a cappella sounds thin and disconnected without it.
- **Optional light pitch-correction / "ring" enhancement** as a premium toggle (barbershop's whole thing is the ringing overtone chord — leaning into that is *on brand* in a way generic autotune isn't).
- **Noise gate / hum removal** on upload for the obvious cases.
- **Consistent framing/lighting help**: a face-centering guide and a "you're a bit dark" nudge on the record screen.

Keep processing **server-side or on-device at export**, never blocking the join. The web app's fatal flaw was making users *wait* — never reintroduce a "sharpening the mix…" spinner.

---

## 9. Monetization (later, but design for it now)

Don't monetize at validation. But keep the door open:
- **Freemium subscription ("TagAlong Pro"):** HD/watermark-free export, the ring/reverb studio effects, private groups, more than 4 parts, unlimited retakes/history, advanced learning tools (loop/slow-down). Prices the *serious* singers who are your core.
- **Not ads** — they'd wreck the warm, craft-focused feel and the full-screen video aesthetic.
- **Possible later:** virtual gifts on performances, or a modest fee for choruses/groups using it as a rehearsal tool. The B2B "remote chorus rehearsal" angle is a real, separate business worth remembering.

Rule of thumb: monetize *depth* (power features for people who already love it), never *access* (singing and watching stay free forever, or the network never grows).

---

## 10. Cross-platform (Android) & the "one backend" principle

Android is a later port (locked in native-ios-pivot memory), and the right architecture makes it cheap: **all social logic lives in the backend (Section 3), so Android is a second thin client, not a second app.** The sync engine is the only truly hard re-implementation (Android has `AAudio`/Oboe for low-latency, and the host-clock approach ports conceptually). Sequence: prove the loop on iOS → build the backend cleanly (client-agnostic APIs) → port the Android client → the web viewer already covers passive watching everywhere in the meantime.

---

## 11. Recommended roadmap (prioritized)

Phased around the loop, not around feature areas. Each phase should be independently shippable/testable.

### P0 — Make it multiplayer (the unlock)
*Without this, nothing else matters.*
- Backend: Firebase (Auth + Firestore + Storage + Functions + FCM).
- Sign in with Apple; voice-part onboarding.
- Upload takes (video + audio stem) to the cloud; take ownership/attribution.
- Global Watch feed (completed performances) + Sing feed (open tags, filtered to your part).
- The join-a-stranger's-tag flow end-to-end, including the completion celebration.
- Push notification on tag completion + "someone joined your tag."
- **Minimum safety to submit:** report, block, EULA, age gate, privacy policy.
- The web share-viewer for performance links.
- **Exit criteria:** two *different people on two phones* complete a quartet, and both get the "it's done" notification and can share it.

### P1 — Make it sticky
- Likes (performance + per-take), the "your part is in N performances" credit system surfaced everywhere.
- Follows + light activity feed.
- Swap-in polished (remix any quadrant), attribution overlays.
- Motion/haptic/sound polish pass (completion moment, count-in, likes).
- Loudness normalization + shared reverb at playback.
- Profiles with stats.
- Comments (once moderation is proven).

### P2 — Make it a community
- Weekly Featured Tag + lightweight leaderboard.
- Badges/streaks, remix family-tree UI.
- Learning tools (per-part solo/mute already exist — add loop + pitch-preserved slow-down).
- barbershoptags.com catalog integration; entry-cue markers.
- Studio effects (ring enhancement) behind a Pro flag; begin monetization.

### P3 — Scale & expand
- Android client; adaptive-bitrate streaming; ML feed ranking if warranted.
- 5–8 part voicings; groups/private choruses (B2B angle); challenges/competitions.

---

## 12. Metrics to instrument from day one

- **Activation:** % of new users who publish a first take within 24h (target the sub-3-min flow).
- **The core-loop health metric:** % of started tags that reach a complete performance within 7 days (doc 02 target ≥40%). This is *the* number.
- **Contribution rate:** joins per active user (contribution is the scarce, valuable action).
- **Retention:** D1/D7/D30, and specifically *notification-driven return rate* (does "your tag is complete" bring people back?).
- **Virality:** shares per performance → installs per share (the open-tag invite loop).
- **Sync quality in the wild:** measured offset distribution across real devices (our moat — watch it degrade or hold).

---

## 13. The three decisions I need from you

1. **Backend choice:** Firebase (my rec — matches doc 04, fastest path) vs Supabase (nicer feed queries, predictable pricing) vs custom (not advised now). This gates all of P0.
2. **How wide at launch?** Barbershop-only, tightly seeded, community-beta (my rec — defensible copyright posture, warm culture, built-in Facebook-group distribution) vs. broader a-cappella/"sing anything" from day one (bigger TAM, more copyright and moderation exposure).
3. **Spend appetite for P0.** A real backend + Apple Developer ($99) + a modest storage/CDN bill (~tens of dollars/mo at beta scale) + a lawyer hour or two for the UGC/copyright terms. This is the first phase that genuinely costs money — worth confirming you're ready before we build against it.

---

### TL;DR

The instrument is built and it's world-class. The *app* — the reason anyone comes back — is the multiplayer network, and that's still entirely ahead of us. Build the backend, ship the async social loop (join a stranger's tag → get notified when your quartet completes → share), and wrap it in the completion-moment magic and the minimum safety Apple requires. Do that and TagAlong is a genuinely novel, defensible, shippable product with a passionate niche primed to spread it. The features in Section 4 make it *addictive*; the loop in Section 1 makes it *matter*.
