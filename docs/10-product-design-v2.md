# 10 — Product Design v2: making TagAlong feel like one thought-through app

*2026-07-19. Fable. Response to the founder's critique after the first end-to-end
cloud test, plus the gaps I found on my own review. This supersedes the UX
portions of docs/08; the engine, backend schema, and Track B gating in 08/09
still stand.*

The critique was correct and the underlying diagnosis is this: **we built a
single-player instrument and then bolted a cloud feed onto it.** The two tabs
feel unrelated because they *are* unrelated — they don't share a data model
(library vs. cloud), a visual language (rows vs. full-bleed video), or a verb
(nothing in the app is called "tagging along"). v2 fixes the model first, then
the surfaces, then adds the social layer.

---

## A. Ownership & the library/cache split (fixes "deleted tags come back")

**The bug is a model bug, not a sync bug.** Today `CloudStore.join()` inserts
cloud tags into `Store` (the personal library), and the Watch feed auto-joins
anything you scroll to. Watching something puts it in your library; deleting it
locally can't stick because watching re-imports it.

**New model — two buckets, one explicit crossing:**

| Bucket | What's in it | Backing | Deletable? |
|---|---|---|---|
| **Library** (`Store`) | Tags I created + tags I *tagged along* on | Documents, JSON | Yes, by me |
| **Feed cache** | Media for anything I merely watched | `Caches/cloud/` keyed by take id | Purged by iOS/LRU, never user-visible |

- The Watch feed streams from the cache and **never touches `Store`**.
- The only way a community tag enters your library is the explicit act of
  **tagging along** (recording a part on it) — see §D.
- Cached files can seed the library copy on tag-along (move, don't re-download).

**Ownership rules (enforced in `firebase/*.rules`, mirrored in UI):**

- A **take** belongs to its `ownerUid`. Only the owner can delete or replace it.
- A **tag** belongs to its `creatorUid`. Only the creator can delete the tag
  everywhere or edit title/key/lyrics. Anyone signed-in may *add takes*.
- Tag docs' `parts`/`isComplete` are recomputed client-side today (any authed
  user can write them) — acceptable for beta, moves to a Cloud Function later.

**Delete menu becomes role-aware** (replaces today's ambiguous delete):

- Creator: **"Delete tag for everyone"** (cloud + local, destructive-red,
  confirm) and **"Remove from my phone"** (local only; it may still appear in
  the community feed, labeled as such).
- Contributor: **"Remove my voice"** (deletes my take cloud+local; tag reverts
  to 3/4 and reopens the slot) and **"Remove from my phone"**.
- Viewer: nothing to delete — it was never in their library. Feed cards get
  **"Not interested"**, which adds the id to a persisted local
  `hiddenCloudTagIds` set (also the mechanism behind report/block later).

---

## B. One design language; the Sing tab becomes a place

The Watch tab is full-bleed video; the Sing tab is a settings-style list. v2
makes **video thumbnails the unit of UI everywhere** — every tag, anywhere in
the app, is a card built from its real tiles.

**`TagCard` (one component, used in both tabs):** a mini 2×2 collage of actual
frame-grabs; empty slots render as dark velvet with the part's color as a
pulsing rim + part name ("Bass — open"); title in the serif face; key badge;
below, four part chips in part colors (filled = solid, open = outlined). Same
curtain palette, same corner radius, same haptics as Watch.

**Sing tab layout (top → bottom):**

1. **"Start a tag"** — one prominent button (see §D for what starts).
2. **"Your spot is waiting"** — horizontal rail of *community* tags that are
   missing **your part** (see part identity, §F1). This is the matchmaking
   surface and the answer to "a long list of line items no one joins": open
   tags are offered as *invitations addressed to you*, not rows in a directory.
3. **"In progress"** — my library tags with open slots, as TagCards.
4. **"Finished"** — my completed tags (compact grid). Tapping any card lands on
   the same TagDetail everywhere.

The Watch feed keeps its identity but interleaves **open tags** every few pages:
the partial mix plays (a trio sounds good and unfinished — that's the hook), the
empty tile pulses in part color, and the overlay CTA is **"Tag along — sing
bass"**. Discovery = hearing the hole you would fill.

---

## C. Social layer, in this app's voice (not TikTok's chrome)

Right-rail overlay on the Watch feed, barbershop-native names, our styling
(ivory glyphs, serif counts, part-color accents):

- **Ring it** (like) — when a barbershop chord locks, it "rings." Icon: tuning
  fork / ringing-chord mark; tap = ding haptic + brief golden shimmer on the
  grid. Data: `tags/{id}/rings/{uid}` + `ringCount` increment on the tag doc.
  One per user, tap again to un-ring.
- **Afterglow** (comments) — the after-show hangout, which is literally what a
  comment section under a performance is. Bottom sheet, newest last, 280 chars.
  Data: `tags/{id}/comments/{autoId}` (uid, displayName, text, createdAt).
- **Share** — two actions in one sheet: *Share video* (existing exporter) and
  *Share invite* (§E). On incomplete tags, share leads with the invite.
- **Credits** — tap the credits line ("Tenor: Harshal") to see who sang what;
  each contributor's display name + part. This is the credit loop from docs/07.

Counts render in the rail; everything works logged-in-anonymous for beta.
Requires display names (§F2). Report/block hangs off the same rail via a "…"
button (§F5) — App Store requires it for UGC before wide release.

---

## D. Making "tag along" a thing you do (the verb problem)

Two moves, one linguistic and one structural:

1. **The CTA is the name.** Every open slot in the app — feed overlay, TagCard
   chip, TagDetail empty tile — carries the same button: **"Tag Along"** (with
   the part: "Tag along — sing bass"). Recording on someone's tag IS tagging
   along; the word stops being abstract the first time you press it. The
   completion celebration says "**{name} tagged along** — quartet complete."
2. **Ground it in barbershop.** A "tag" is the ending of a song — the thing
   quartets teach strangers in hallways precisely so anyone can join in. Put
   that in onboarding in one line: *"A tag is the best 30 seconds of a song.
   Sing one part; strangers finish it."* Starting a tag = **"Lay down a tag"**;
   the Start flow asks for title, key, and optionally lyrics (§F3), and frames
   the recording as "your invitation."

House vocabulary from here on: **lay down a tag → others tag along → the chord
rings → afterglow.** Buttons, empty states, and notifications all draw from
this and nothing else.

---

## E. Invitations

Beta (now, no paid account): every published tag gets a 6-char **invite code**
(`inviteCode` on the tag doc, generated at publish). Share sheet composes:
*"Sing lead with me on 'My Wild Irish Rose' — TagAlong code WIROSE"*. A
**"Have a code?"** field on the Sing tab looks the code up and opens straight
to the tag-along screen for the open part.

Post-paid-account: universal links (`tagalong.app/t/{code}`) that deep-link to
the same screen, plus push ("Someone tagged along on your tag" — the retention
loop). The code remains as the fallback and the spoken-aloud version.

---

## F. Gaps the founder didn't list (found on my own review)

1. **Voice part identity.** Onboarding (old WP4, now folded into WP7) asks one
   question — "What do you sing?" (tenor/lead/bari/bass/"not sure yet") — and
   stores it locally + on a `users/{uid}` doc. It powers "Your spot is
   waiting," feed ranking, and future matchmaking. Changeable in Profile.
2. **Display names.** Anonymous uids can't be credited or commented as. First
   publish/ring/comment prompts once for a display name (+ auto part-color
   avatar). `users/{uid} = {displayName, part, createdAt}`. Real accounts
   (SIWA) later inherit this doc.
3. **The joiner's context problem.** Today a stranger tagging along has no idea
   what to sing. Tags gain optional `lyrics` (text) and `notes` ("Polecat #4")
   fields, shown on the tag-along screen; and the existing tap-tile-to-solo is
   explicitly the **learn flow** ("solo the lead to learn it") — surfaced with
   one hint. Later: a seeded catalog of public-domain classic tags
   (Polecats) with lyrics prefilled, which is also the cold-start content plan.
4. **Multiple takes per part / "sing this part instead."** The tile action
   model (§G below) lets anyone record a part that's already filled. Cloud
   keeps all takes; `quartet()`'s first-per-part default becomes a per-user
   **cast selection** (locally: prefer my own take for a part; later: creator
   picks the featured cast for the feed). No deletion of others' work, ever —
   swap-in, don't stomp. (Schema already supports this; it's a selection-model
   change.)
5. **Moderation minimums.** Report (feed rail "…" → report → writes
   `reports/{autoId}`, auto-hides locally) and block (hide all content by a
   uid, local list). Required by App Store for UGC; build cheap now.
6. **Upload discipline.** Takes upload raw ~full-res mov. Cap take length
   (90s), transcode uploads to HEVC 720p (~5× smaller) before `putFile`, and
   show upload progress in the tag card. Keeps Blaze bills and cell data sane.
7. **Account continuity.** Anonymous auth means a reinstall orphans everything
   you own. Fine for beta; **SIWA must land before any public user invests
   real effort** — it's not just polish, it's data-loss prevention. (Gated on
   the $99 account, unchanged.)
8. **Tag visibility.** Auto-publish stays (every tag is an open invitation),
   but Start flow gets a visibility toggle: **Public** (default) / **Unlisted**
   (invite code only — not in feed; `visibility` field, client-filtered).

---

## G. The tile action model (replaces guess-the-gesture)

One rule: **tap a tile → solo it + a contextual action bar slides up.** No
hidden long-presses as the only path (long-press keeps working as a shortcut
for your own tiles).

- My tile: **Re-sing · Nudge sync · Remove my voice**
- Someone else's tile: **Sing this part instead** (→ tag-along record; my cast
  then uses my take, §F4) · **Credit** (who sang it)
- Empty tile: **Tag Along** (record this part)

Same bar everywhere TagDetail appears, so feed → detail → action is one
learnable pattern.

---

## H. Revised work packages & order

Model first, then surfaces, then social. Each WP ships installable.

| WP | Scope | Depends on |
|---|---|---|
| **WP5** | Library/cache split; role-aware delete; hidden-ids; deploy firebase rules | — (keystone) |
| **WP6** | TagCard component; Sing tab v2 (rails, start flow with lyrics/visibility, invite-code field) | WP5 |
| **WP7** | Feed v2: open-tag pages with "Tag Along" CTA; part-identity onboarding + display name; feed ranking (needs-your-part → near-complete → recent) | WP5, WP6 |
| **WP8** | Tile action model; multiple takes + local cast selection | WP5 |
| **WP9** | Ring it + Afterglow + credits + report/block | WP7 (names) |
| **WP10** | Invite codes end-to-end; upload transcode + length cap | WP6 |
| **WP3** | Loudness matching across parts (unchanged, independent) | — |
| Gated ($99) | SIWA, push, universal links, TestFlight, creator-picked featured casts | account |

Vocabulary, delete semantics, and the tile model (§A, §D, §G) are decided;
implementation agents follow them without re-litigating. Open founder-level
calls: none blocking — the only real one is *when* to buy the Apple account,
which gates §F7 and is already tracked in docs/08.
