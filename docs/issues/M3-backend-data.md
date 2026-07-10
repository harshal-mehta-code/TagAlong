# M3 — E3: Backend & Data

The tags → takes → performances model (docs 01/04) in Firestore + R2, with rules doing the enforcement. Can run parallel to M2 once M0 lands.

### [M3-22] Firestore data model + security rules
> meta: labels=epic:backend,type:feature · milestone=M3 · depends=[M0-04]

**Scope:** Implement doc 04 schema exactly (`users`, `tags` with `parts[]` + `takeCounts`, `tags/{id}/takes` with `guideTakeIds[]`, `performances` keyed by hash of sorted takeIds, `likes`, `reports`, `notifications`); rules: owner-only take writes, immutable take `part`/`offsetMs` after create, performance-write validation (writer's take ∈ combo, combo complete, id = deterministic hash), visibility enforcement for `link`-only tags, 13+ age-gate flag on user create; typed client wrappers in `app/src/services/db.ts`; rules unit tests via emulator (`@firebase/rules-unit-testing`).

**Acceptance:** Rules tests cover: stranger can't write my take, dup performance id rejected, incomplete combo rejected, link-only tag invisible to public queries. All green in CI.

### [M3-23] Worker: production signed-URL service with quotas
> meta: labels=epic:backend,type:feature · milestone=M3 · depends=[M0-05],[M3-22]

**Scope:** Harden M0-05 skeleton to product paths (`media/{tagId}/takes/{takeId}.(mp4|m4a)`, `exports/{perfId}.mp4`, `avatars/{uid}.jpg`); validate the caller owns the Firestore take doc before signing take uploads; per-uid daily quota (KV) + take-count limits from feature flags; delete endpoint for own-take removal (called by M5-38); structured logs.

**Acceptance:** Integration test against emulator + real R2: full take upload round-trip; cross-user upload attempt → 403; quota exhaustion → 429.

### [M3-24] Auth flows: Google + email, age gate, profile bootstrap
> meta: labels=epic:backend,type:feature · milestone=M3 · depends=[M0-04],[M3-22]

**Scope:** Sign-in UI (Google popup/redirect per platform quirks, email+password with reset); first-run: display name, voice part(s), 13+ confirmation → `users/{uid}` bootstrap; session persistence; sign-out; auth-gated route guard wired into the M0-01 shell; account deletion request path (docs it drops content per policy — full cascade in M5-38).

**Acceptance:** E2E: email signup → profile doc exists → survives reload → sign-out; Google flow verified manually on preview (popup blockers on iOS Safari handled via redirect).

### [M3-25] Upload pipeline: resumable, retrying, draft-backed
> meta: labels=epic:backend,type:feature · milestone=M3 · depends=[M1-12],[M3-22],[M3-23]

**Scope:** `UploadManager`: takes `TakeArtifact` from IndexedDB drafts → signed PUTs (video + stem, parallel) → on success writes take doc + increments `takeCounts` (transaction) → clears draft; retry with backoff, resumable across app restarts, offline queue ("church basement" case, doc 04); progress events for UI; failure surfaces re-try affordance, never data loss.

**Acceptance:** E2E with network-killed mid-upload: relaunch resumes and completes; take doc never exists without media (orphan-proof ordering documented + tested).

### [M3-26] Performance creation + dedupe + completion fan-out
> meta: labels=epic:backend,type:feature · milestone=M3 · depends=[M3-25]

**Scope:** Client logic post-take-write: if `guideTakeIds` + new take cover all `parts[]` → compute perf hash id, create performance doc (rules from M3-22 validate); handle race (id collision = someone else completed same combo — treat as success, don't dup); notification fan-out docs for all `contributorUids` ("Tag complete 🎉"); `stats` denormalization on users.

**Acceptance:** Emulator tests: completing take creates exactly one performance under concurrent duplicate attempts; all four contributors get notification docs; swap-in on a complete performance creates a second performance (the Jason case, doc 01).

### [M3-27] Notifications: web push + email fallback
> meta: labels=epic:backend,type:feature · milestone=M3 · depends=[M3-26]

**Scope:** Web Push (VAPID) permission flow (in-context ask, only after first meaningful event); service-worker push handler + deep link; Worker endpoint sends pushes on notification-doc creation (Firestore → poll or client-triggered at MVP; document the compromise); email fallback via free-tier provider for push-less users, batched daily; per-user notification prefs; iOS Safari: push requires installed PWA (16.4+) — detect and offer "Add to Home Screen" coaching instead of a broken toggle.

**Acceptance:** On Android Chrome: take-added push arrives and deep-links to the tag; on iOS non-installed: email fallback + coach-mark path verified; prefs respected.

### [M3-28] Feed queries, indexes, and ranking v1
> meta: labels=epic:backend,type:feature · milestone=M3 · depends=[M3-22]

**Scope:** Query layer + composite indexes for: Performances feed (recency + like-rate decay score, computed client-side over a bounded window at MVP scale — document the P2 upgrade path), In Progress feed filtered by `takeCounts` (part-needed) + voicing, per-user profiles (my takes / my performances), performance-family (`tagId`) listing; pagination; blocked-user filtering applied at the query layer.

**Acceptance:** Emulator seed of 200 tags/1k takes: all feeds return correctly filtered, paginated, index-backed (no full scans warnings); "needs a bass" filter provably excludes bass-complete tags.
