# 01 — Product Vision & Feature Set

## The one-liner

**TagAlong is asynchronous quartet singing.** Anyone can start a barbershop tag by recording one part; the remaining parts are open slots that friends or strangers fill in on their own time. Every completed tag becomes a shareable split-screen collage video.

## Why this can win

*Acapella (Mixcord)* proved people love collage-style multipart videos, but it's a **solo tool** — you sing all four parts yourself, or you coordinate a group manually. TikTok duets proved **asynchronous collaboration with strangers** works as a social mechanic, but it's unstructured.

TagAlong sits exactly at the intersection, aimed at a community that is:

- **Passionate and underserved.** Barbershop (BHS, Sweet Adelines, mixed harmony) has hundreds of thousands of active singers worldwide with deep tag-singing culture (afterglows, "teach me a tag") and almost no purpose-built software.
- **Naturally viral within itself.** A tag with an open bass slot is a *built-in invitation*. Every incomplete tag markets the app.
- **Structured.** Tags are short (15–60 sec), have named parts (Tenor, Lead, Bari, Bass), known keys, and existing sheet music — perfect constraints for a simple product.

## Who it's for

| Persona | Need | What hooks them |
|---|---|---|
| **The tag nerd** (convention regular, knows 200 tags) | Sing tags between conventions, show off | Open-tag feed, hard tags, being the person who "completes" tags |
| **The chapter singer** (weekly chorus, knows their part) | Low-pressure way to sing with friends | Private invites, singing with their quartet remotely |
| **The curious a cappella fan** (college groups, Pentatonix fans) | Wants in but finds barbershop opaque | Learning tracks, easy tags, "just sing the melody" onboarding |

## Core loops

### Loop 1 — Start a tag
1. Pick a tag (from the catalog or "custom") → choose voicing (TTBB / SSAA / mixed) and key.
2. Blow the pitch with the **built-in pitch pipe**, get a count-in, record your part on video.
3. Publish as **open** (anyone can join) or **invite-only** (share link to specific people).

### Loop 2 — Tag along
1. Browse open tags (filter by voicing, part needed, difficulty).
2. Pick an open slot → hear the existing parts in your earbuds while you record yours.
3. Submit. Your face joins the collage.

### Loop 3 — Complete & share
1. When the last part lands, everyone gets a "🎉 Tag complete" notification.
2. The finished 4-up collage video plays in the in-app feed and exports to camera roll / socials (with a subtle TagAlong watermark → organic growth).

### Loop 4 — Re-tag (the differentiator)
Completed tags aren't dead ends. Anyone can **re-tag**: take an existing tag and replace one part with their own take, spawning a new version. A popular tag becomes a *family tree* of performances — the same "Lost Chord" tag sung by 40 different basses. This is the fork/remix mechanic that gives the app long-tail content from a finite tag catalog.

## Feature set

### MVP (Phase 1) — detailed scope in doc 02
- Sign in with Apple + email auth
- Start a tag: voicing preset (4 parts fixed), part pick, key pick, pitch pipe, count-in, video recording
- Join a tag: monitor existing parts in headphones, record synced, manual sync-nudge slider
- On-device compositing into 2×2 collage, export/share
- Open-tags feed + tag detail with per-slot playback
- Invite links (works even if recipient doesn't have the app yet → App Store)
- Multiple **takes** per slot: several people may sing the same open part; the tag creator picks the featured take, others remain browsable
- Profiles (name, voice part(s), avatar, tags sung)
- Likes, report/block (App Store UGC requirement), push notifications

### Phase 2 — social depth
- Tag catalog with metadata: title, arranger, key, difficulty, sheet-music link/PDF
- Learning-track attachment per part ("hear your line alone before recording")
- Comments, follows, activity feed
- Re-tag version trees surfaced in UI
- Web playback pages so share links play in a browser

### Phase 3 — community & events
- Groups/quartets (persistent ensembles, private tag rooms)
- **Weekly Tag Challenge** (everyone sings the same tag; community-voted winners)
- Virtual competitions with brackets/judging — the "host tag singing competitions" vision
- Flexible part counts (2–8), duets, 6-part+, chorus mode

### Explicitly not doing
- Real-time (live) group singing — latency makes this a research project; async is the product
- Android at launch (revisit after iOS product-market fit)
- Audio-only mode at launch (video is the identity of the product; audio-only is a possible accessibility follow-up)
- Server-side pitch correction / autotune (against the culture, and expensive)

## Additions & modifications I made to your idea (flagging for review)

1. **Pitch pipe + key selection is a first-class feature.** For this audience it's the equivalent of a tuner in a guitar app. It also solves a real product problem: everyone joining must sing in the starter's key.
2. **"Takes" instead of first-come-first-served slots.** If a stranger sings a bad bass on your tag, the tag is ruined under first-come rules. Instead: open slots accept multiple takes; creator features one. Keeps quality control with the creator without gatekeeping participation.
3. **Re-tag version trees** as the core remix mechanic (described above).
4. **Voicing presets** (TTBB / SSAA / mixed) rather than assuming men's voicing — Sweet Adelines and mixed harmony are huge and growing segments.
5. **Headphones-required recording** with a route check. Without it, other parts bleed into the mic and the collage sounds like mush. The UI treats this as a friendly pre-flight check, not an error.
6. **Watermarked exports as the growth engine** — tags shared to Instagram/TikTok/Facebook groups are the main acquisition channel for a niche community.
7. **Moderation from day one** (report, block, creator-controlled takes) — Apple rejects UGC apps without this, and singing videos of faces are personal content.
8. **Tag catalog partnership opportunity:** barbershoptags.com hosts thousands of tags with sheet music and learning tracks and has a public API. Phase 2 should explore integrating/linking it (with permission) rather than building a catalog from scratch. *(Needs outreach + license check — flagged in doc 06.)*
