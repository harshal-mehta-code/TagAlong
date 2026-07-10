# 01 — Product Vision & Feature Set

*v2 — revised after Checkpoint 1 feedback (combinatorial performances, learning mode, web-first).*

## The one-liner

**TagAlong is asynchronous quartet singing.** Anyone can start a barbershop tag by recording one part; others add theirs on their own time, and every unique combination of parts becomes its own shareable split-screen performance. Like a tag party at a convention: groups form organically — nobody needs permission to sing.

## Why this can win

*Acapella (Mixcord)* proved people love collage-style multipart videos, but it's a **solo tool**. TikTok duets proved **asynchronous collaboration with strangers** works, but it's unstructured. TagAlong sits at the intersection, aimed at a community that is:

- **Passionate and underserved.** Barbershop (BHS, Sweet Adelines, mixed harmony) has hundreds of thousands of active singers with deep tag-singing culture and almost no purpose-built software.
- **Naturally viral within itself.** A tag with an open bass slot is a built-in invitation.
- **Structured.** Tags are short (15–60 s), have named parts, known keys, and existing sheet music — perfect constraints for a simple product.

## Who it's for

| Persona | Need | What hooks them |
|---|---|---|
| **The tag nerd** (convention regular, knows 200 tags) | Sing tags between conventions, show off | Open-tag feed, hard tags, appearing in many performances |
| **The chapter singer** (weekly chorus, knows their part) | Low-pressure singing with friends | Private invites, remote quartetting |
| **The curious a cappella fan** | Wants in but finds barbershop opaque | **Learning mode**, easy tags, "just sing the melody" onboarding |

## The core model: tags → takes → performances

This is the heart of the product, revised from v1's creator-curated "featured takes" model:

- A **tag** is the seed: song, voicing, key, duration — created when someone records the first part.
- A **take** is one person singing one part of that tag. Any number of people can record a take for any part, any time. No approvals, no gatekeeping.
- A **performance** is a specific combination of takes covering all parts. It is created *organically*: when you join a tag, you choose which existing takes to hear in your earbuds while you sing (sensible default: the most-liked per part). If your take fills the last open part of that combination, **that performance is born** and posts to the feed automatically.

Why this works:

- **No bored/rejected submitters.** Every take is instantly part of the tag; nobody waits for a creator to bless it. This mirrors how groups form at real tag parties.
- **No combinatorial spam.** A tag with 5 takes per part has 625 possible combos, but performances only exist where someone *actually sang* against that combination. Every performance contains at least one person who chose it.
- **Quality control by the feed, not by gatekeepers.** Likes/votes rank performances; the best combinations surface, weak ones sink without anyone being told "no."
- **Multiplying credit.** One great bass take can appear in dozens of performances ("Your bass is in 12 performances 🎉") — a retention loop that rewards quality.
- Safety still applies: contributors can delete their own takes, and report/block covers abuse.

## Core loops

1. **Start a tag** — pick song/voicing/key, blow the built-in pitch pipe, count-in, record your part, publish (public or invite link).
2. **Tag along** — browse open tags (filter by part needed, voicing, difficulty), pick a combination to sing with, hear it while you record, nudge sync, post your take.
3. **Complete & share** — last part in a combination completes a performance; everyone in it gets notified; the collage exports with watermark to socials.
4. **Learn** — don't know the tag? Learning mode: listen to any part in isolation, loop it, slow it down, then flip to record when ready.
5. **Re-tag / remix** — every performance invites "sing this part yourself"; popular tags become families of performances.

## Learning mode (elevated to a core loop per feedback)

Because every take stores an isolated audio stem, learning features are nearly free:

- **Solo/mute mixer** on any tag or performance: hear just the bari, or everything *but* the bari (sing-along mode). MVP.
- **Loop + slow down**: browsers/players preserve pitch at reduced playback rate, so 0.75× practice costs nothing. MVP-cheap.
- **Part-predominant mix**: your part loud, others quiet — the classic learning-track format. P2.
- **barbershoptags.com integration (P2)**: the community's canonical database exposes a public XML API (https://www.barbershoptags.com/dbpage.php?pg=api) with search, sheet music, and per-part learning tracks. Plan: a "Learn this tag" panel that searches/links sheet music and streams their learning tracks with attribution, per their API terms *(terms/permission to be verified before implementation — tracked in doc 06)*. This also lets starting a tag begin from a real catalog entry with correct key/voicing metadata.

## Entry cues (per feedback #5 — phased)

Real-world tag singing runs on visual cues (a conductor's breath, watching the lead). Asynchronous equivalents:

- **MVP:** count-in clicks + big serif countdown; a **guide waveform timeline** across the bottom of the record screen with a moving playhead — you *see* the phrase coming. And the collage itself is a cue: you watch the other singers breathe before entries.
- **P2:** entry markers — singers can drop "part comes in here" flags on the timeline (auto-suggested from onset detection of existing takes); recording UI flashes "in 2… 1…" at your marker.
- **P3 (explore):** lyric/word cues synced to the timeline.

## Feature set by phase

### MVP (Phase 1) — **web app** (see docs 02/03 for the web-first strategy)
- Auth (Google + email; Sign in with Apple added at store packaging)
- Start a tag: voicing preset (TTBB/SSAA/mixed), part pick, key pick, pitch pipe, count-in, ≤60 s recording
- Join: headphone pre-flight, combination picker (default = top takes), guide playback while recording, latency compensation + manual nudge
- Takes & performances exactly as modeled above; synchronized grid playback in-app; watermarked video export for sharing
- Learning basics: per-part solo/mute listening, loop, slow-down
- Feed: Open tags + Performances, ranked by engagement; invite links (they're just URLs — no app install needed)
- Profiles, likes, report/block/delete-own-take, notifications (web push + email fallback)

### Phase 2 — depth
- barbershoptags.com catalog integration, part-predominant mixes, entry markers
- Comments, follows, richer ranking; performance family trees ("12 performances of this tag")
- Android/iOS store packaging when validation warrants (doc 03)

### Phase 3 — community & events
- Groups/quartets, Weekly Tag Challenge, virtual competitions with voting/judging
- **5–8 part support** (per feedback #4): the data model is part-count-agnostic from day one (`parts[]` array, layouts for 2×3, 2×4); this phase is UI + layout work, not a migration

### Explicitly not doing
- Real-time (live) group singing — latency physics; async *is* the product
- Server-side rendering/transcoding of video — everything composes on-device (the free-backend keystone)
- Autotune/pitch correction — against the culture
