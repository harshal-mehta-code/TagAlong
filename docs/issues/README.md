# Checkpoint 3 — Issue Breakdown & Creation Playbook

This directory is the **source of truth for the Phase 0–1 implementation plan**: 6 milestones, 42 issues, each sized for a single Claude build session. Files `M0-…` through `M5-…` contain the issues; each issue block starts with a `### ` heading and a metadata line.

## For the session creating the GitHub issues

Do this mechanically, in order:

1. `get_me` to verify GitHub access to `harshal-mehta-code/TagAlong`.
2. Create labels (idempotent — skip existing):
   `epic:foundations`, `epic:engine`, `epic:player`, `epic:backend`, `epic:ui`, `epic:beta`,
   `type:spike`, `type:feature`, `type:infra`, `type:qa`, `risk:high`, `blocked`
3. Create milestones M0–M5 (titles = the `# ` heading of each file, description = the intro paragraph).
4. For each `### ` issue block in file order (M0 → M5): create an issue with
   - **Title:** the heading text (keep the `[M#-##]` prefix — dependency references use it)
   - **Labels / Milestone:** from the `> meta:` line
   - **Body:** everything below the meta line, plus a final `**Depends on:** #…` section resolving the `[M#-##]` refs to real issue numbers (create in order and keep a prefix→number map as you go)
5. After all issues exist: add a comment on this repo's planning PR (or the first issue) with the full prefix→number map.
6. Do **not** start implementing anything in that session.

## Build order & gates

- **M0 first** (any order within it). Then **M1 before everything else** — issue M1-07 is the CP4 go/no-go spike; if it fails on iOS Safari, the native-plugin escape hatch (doc 04 appendix) activates before M2–M5 proceed.
- M2/M3 can run in parallel after M1. M4 needs M2+M3 interfaces. M5 last.
- One issue = one session = one PR. Every PR must keep CI green and deploy a preview.

## Conventions for build sessions

- Read `docs/` (01–06) before starting any issue; the issue is the *what*, the docs are the *why*.
- UI-free logic goes in `app/src/engine` or `app/src/player` with unit tests; UI consumes it.
- Every AV feature is verified on real iOS Safari + Android Chrome before the issue closes (see each issue's acceptance criteria).
- Design tokens/components come from doc 05 — no ad-hoc colors or type.
