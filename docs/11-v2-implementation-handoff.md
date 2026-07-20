# 11 — Product Design v2 implementation: handoff notes

*2026-07-20. Fable, written from a cloud session WITHOUT an Xcode toolchain.
All of docs/10 (WP5–WP10) is implemented on branch
`claude/product-design-v2-impl-dq7mgs`; nothing has been compiled or run.
This doc is what the laptop session needs to pick it up.*

## What landed (commit per work package)

| Commit | Scope |
|---|---|
| WP5/WP10 core | Library/cache split (`CloudCache`, `Caches/cloud/`), cast selection + role helpers in `Store`, identity (display name + part, `users/{uid}`), hidden/blocked sets, invite codes, role-aware cloud deletes, 720p upload transcode + progress, firebase rules v2 |
| WP6–8 UI | `TagCard` (2×2 frame-grab collage) everywhere, Sing tab v2 (Lay down a tag / Have a code? / Your spot is waiting / In progress / Finished), Feed v2 (cache-streamed community pages, open-tag invitations interleaved 3:1, ranking), tile action model, part-identity onboarding, tag-along vocabulary |
| WP9 social | Ring it + Afterglow + Credits + Share (video/invite) rail, report/block, cache-agnostic exporter |
| This commit | Docs |

New files: `CloudCache.swift`, `Transcode.swift`, `TagCard.swift`,
`SingViews.swift`, `FeedViews.swift`, `TileActions.swift`, `Social.swift`.
`project.yml` globs the whole `TagAlong/` dir, so `xcodegen` picks them up
with no project edits.

## Laptop checklist (in order)

1. `git fetch origin claude/product-design-v2-impl-dq7mgs` and check out.
2. `xcodegen` in `ios/`, open, build. **Expect to fix small compile errors** —
   this code was written blind; the risky spots are listed below so the fixes
   should be mechanical.
3. Deploy rules (they gate role-aware delete, rings/comments, users docs):
   `firebase deploy --only firestore:rules,storage`
4. Run the manual test loop below on two devices/simulators.

## API calls I could not verify (check these first if the build breaks)

- `StorageReference.putFileAsync(from:metadata:onProgress:)` — the
  progress-closure async variant (`CloudStore.uploadTake`). If the SDK
  version predates it, drop the closure and the `uploadProgress` bookkeeping.
- `AVAssetImageGenerator.image(at:)` async (`TakeThumbs`) — iOS 16+.
- `AVAssetExportSession.determineCompatibility(ofExportPreset:with:outputFileType:)`
  (`Transcode.swift`) — long-standing API, but confirm the completion-handler
  bridge compiles.
- `.defaultScrollAnchor(.bottom)` (`AfterglowSheet`) — iOS 17.
- Nested `Menu` inside `Menu` for Report reasons (`CloudPerformancePage`).
- Firestore rules `get(/databases/$(database)/documents/tags/$(tagId))` in the
  takes delete rule — verify with the rules emulator or console simulator.
- `SongTag`/`Take` gained `Equatable` (used by `onChange(of: store.takes)`).

## Deliberate deviations from docs/10 (small, flagged for review)

- **§F6 says HEVC 720p**: AVFoundation has no HEVC-720p preset, so uploads use
  `AVAssetExportPreset1280x720` (H.264) — still a ~4–5× cut. Raw `.mov` upload
  is the fallback if transcode fails, so old rules' `.mov`-only match is now
  `mov|mp4`.
- **§F6 says cap 90s**: `RecordController.maxSingSec` raised 60 → 90.
- **"Your spot is waiting" tap** opens `TagAlongSheet` (lyrics/notes + part
  choice, §F3 context) rather than jumping straight into record — one extra
  tap, much more context for a stranger. Invite-code redemption uses the same
  sheet.
- **Celebration** keeps "Quartet complete" as the headline with "You tagged
  along — the chord rings" as a serif subtitle (the doc's exact string needs
  the *other* singer's name, which the completing device doesn't have).
- **Comment counts**: added a `commentCount` mirror on the tag doc (not in the
  doc) so the rail shows counts from the one feed listener.

## Model/data notes

- Old on-disk JSON decodes unchanged (all new `SongTag` fields optional;
  `Snapshot.cast` optional). Old cloud tag docs parse with defaults
  (`visibility` → public, `ringCount`/`commentCount` → 0, no invite code —
  codes mint on next publish of that tag only).
- The Watch feed **never** writes to `Store` anymore. `CloudCache.adopt` is
  the single crossing (tag-along, invite redemption), moving cached media into
  Documents.
- `Store.quartet(for:)` preference: explicit cast → my newest take → first
  take ever (old behavior). `RecordView` pins my cast to every take I save.
- `Store.myUid` is set from `RootView` via `onReceive(cloud.$uid)`; before
  auth lands, takes with `ownerUid == nil` still count as mine.

## Manual test loop (two devices, A and B)

1. **Fresh install A**: onboarding (pick a part) → Lay down a tag with lyrics
   + Unlisted → record a part → Sing tab shows upload progress on the card;
   tag does NOT appear in B's feed (unlisted) but the invite code (⋯ menu)
   redeems on B and lands in B's TagAlongSheet.
2. **Ownership (the original bug)**: B watches a public tag of A's in the
   feed, then deletes nothing — B's Sing tab/library must stay empty. A
   "Remove from my phone" on a published tag → it stays in the community
   feed. A (creator) "Delete tag for everyone" → gone from B's feed too.
   B tags along, then "Remove my voice" → tag reverts to 3/4 everywhere.
3. **Tile model**: in TagDetail tap each tile kind → bar shows
   Re-sing/Nudge/Remove · Sing instead/Credit · Tag Along; long-press still
   works on your own tile. "Sing this part instead" on B for a filled part →
   both takes remain in the cloud, B hears their own (cast), A still hears
   the original.
4. **Social**: Ring from B (count on A within seconds, shimmer + haptic on
   B), Afterglow comment (name prompt once), Credits names both singers,
   Report hides the tag locally, Block hides all of that uid's tags.
5. **Feed v2**: with ≥4 complete community tags and ≥2 open ones, an open
   invitation page appears every 4th page, plays its partial mix, CTA names
   B's part when it's the open one.

## Known deferred (unchanged from docs/10)

- Completion/counters are still client-written (Cloud Function later; rules
  keep tag `update` open to any signed-in user for this reason).
- Rings/comments orphan under a creator-deleted tag (unreachable; Function
  sweep later).
- SIWA, push, universal links, creator-picked featured casts: gated on the
  $99 Apple account (docs/08).
- Loudness matching (WP3) untouched.
