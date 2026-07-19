# 09 — Firebase multiplayer foundation

The milestone that makes tags/takes flow through Firebase so different users can
complete each other's quartets. Everything remains local-first: the on-device
`Store` (JSON + `.mov` files in Documents) is still the source of truth for
playback and recording; Firebase is a sync/exchange layer on top of it.

## What shipped

- Anonymous Firebase Auth (`signInAnonymously`) — `CloudStore.uid`.
- A community feed backed by a single Firestore listener.
- Publish (whole tag) / publishTake (single take) / join (download) flows.
- Auto-publish: every tag is an open invitation, so the FIRST saved take
  publishes its tag; every later take on a published tag uploads itself.
- Backward-compatible model fields (all optional) so old local JSON still loads.

## Firestore schema

Document ids are the model `UUID.uuidString`.

```
tags/{tagUUID}
  title:       String
  key:         String        // PitchKey.rawValue
  creatorUid:  String
  createdAt:   Timestamp
  isComplete:  Bool
  completedAt: Timestamp?    // present only while isComplete
  parts:       [String]      // Part.rawValue set, recomputed at publish time

tags/{tagUUID}/takes/{takeUUID}
  part:        String        // Part.rawValue
  ownerUid:    String
  t0OffsetSec: Double
  nudgeSec:    Double
  durationSec: Double
  storagePath: String        // "takes/{takeUUID}.mov"
  createdAt:   Timestamp
```

Storage: `takes/{takeUUID}.mov`.

### Why `parts` is an array on the tag doc

The feed uses ONE snapshot listener (`tags`, ordered by `createdAt` desc,
limit 100, client-side filtering — no composite indexes). To render each open
card's filled/empty part dots without N subcollection listeners, the set of
present parts is denormalized onto the tag doc and recomputed at every publish
(`CloudStore.recomputeCompletion` reads the post-write takes subcollection so
the value reflects every owner's contributions).

## Flows

- **publish(tag:takes:store:)** — writes the base tag doc, uploads each take the
  caller owns (`ownerUid == nil || == myUid`) to Storage + writes its take doc,
  recomputes completeness, marks the local tag/takes published/uploaded.
- **publishTake(_:for:store:)** — uploads one take to an already-published tag,
  then recomputes completeness on the tag doc.
- **join(cloudTag:store:)** — inserts the SongTag locally (with `creatorUid` and
  `publishedAt` set), fetches the takes subcollection, downloads each `.mov`
  into Documents (skipping takes already local by id), and upserts Takes with
  `ownerUid` from the cloud. Afterwards the tag is an ordinary local tag.

Auto-publish trigger: in `RecordView.stopAndSave`, AFTER `confirmSaved()` +
`teardown()` (never disturbing the record/save path), a fire-and-forget task
publishes the whole tag if `publishedAt == nil`, else publishes just the new
take. Failures surface through `CloudStore.errorMessage` → app-level alert.

## Deferred

- **Rules deploy.** `firebase/firestore.rules` + `firebase/storage.rules` exist
  in the repo but are NOT deployed. The console project (`bbshoptagalong`) is
  almost certainly still on test-mode rules; deploy these before any real use.
- **Server-authoritative completion.** `isComplete`/`parts` are recomputed
  client-side, so the rules let any authed user update any tag doc (see the
  TODO in `firestore.rules`). A Cloud Function should own completion.
- **Sign in with Apple.** Only anonymous auth today — no cross-device identity,
  no account recovery.
- **Push notifications** ("your quartet was completed").
- **Retry queues / offline upload.** Publish/join are best-effort; a failure
  just alerts. Firestore's own offline cache still applies to doc writes.
- **Storage cleanup.** Deleting a tag/take locally does not remove cloud copies.
