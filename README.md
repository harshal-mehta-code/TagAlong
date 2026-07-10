# TagAlong

**Collaborative barbershop tag singing, anywhere.**

Record one part of a tag; others add theirs on their own time, and every unique combination of parts becomes its own split-screen quartet performance. Think *Acapella by Mixcord*, but asynchronous and social — like a tag party at a convention, groups form organically.

Ships first as a **web app (PWA)** — $0 to build, test, and share by URL — with Capacitor packaging for the App Store / Play Store once validated. See doc 03 for the strategy.

## Status

🚀 **Working local-first build in [`app/`](app/).** The full core loop runs today: start a tag (pitch pipe → count-in → video recording), tag along the other parts with the guide mix in your headphones, nudge the sync, and completed combinations become performances that play as a synchronized 4-up collage — with learn-mode (per-part solo, slow-down, loop) built in. All data lives on-device (IndexedDB) behind a `DataStore` interface the Firebase/R2 backend will implement later, so **you can test the entire experience solo** by singing every part yourself.

**Try it:** the CI workflow auto-deploys to GitHub Pages on every push — but Pages requires a **public repo** (free plan). Flip the repo public (Settings → General → Change visibility) and the next push publishes to `https://<owner>.github.io/TagAlong/`.

**Run locally:** `cd app && npm install && npm run dev`
**Verify:** `npm run typecheck && npm test && npm run e2e` (unit tests + Playwright end-to-end with fake camera/mic)

Planning docs remain the source of truth for what's next; the issue breakdown for the full backend-connected product lives in [`docs/issues/`](docs/issues/) with a creation playbook ([`docs/issues/README.md`](docs/issues/README.md)).

## Planning documents

Read in order:

| Doc | What it covers |
|---|---|
| [01 — Product](docs/01-product.md) | Vision, audience, feature set, social mechanics, what I added/changed and why |
| [02 — Roadmap](docs/02-roadmap.md) | MVP scope (what's in, what's cut), phased delivery plan, checkpoints |
| [03 — Tech stack & costs](docs/03-tech-stack.md) | Client + backend choices, the honest "can it be free?" analysis, monetization fallback |
| [04 — Architecture](docs/04-architecture.md) | Recording/sync pipeline (the hard part), compositing, data model, storage design |
| [05 — Design](docs/05-design.md) | Design language, information architecture, screen map |
| [06 — Decisions needed](docs/06-decisions-needed.md) | ⭐ **Start here for feedback** — every open question, with my recommendation |

## Prototypes

Interactive design mockups of the five core screens: [docs/prototypes/tagalong-prototype.html](docs/prototypes/tagalong-prototype.html) (open in any browser).

## How this project runs

This repo is built incrementally by Claude Code sessions, checkpoint by checkpoint:

1. **Checkpoint 1 (now):** Plan + prototypes → owner feedback
2. **Checkpoint 2:** Revised plan locked, data model + designs finalized
3. **Checkpoint 3:** Implementation broken into GitHub issues/epics
4. **Build phases:** Each issue implemented in its own session, PR-reviewed
