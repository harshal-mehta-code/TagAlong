# M0 — Foundations (Phase 0)

Skeleton PWA live at a URL on every commit, with CI, backend projects, and test harnesses ready. No product features. All six issues are parallelizable.

### [M0-01] Scaffold Vite + React + TypeScript PWA with routing shell and design tokens
> meta: labels=epic:foundations,type:infra · milestone=M0

**Goal:** A running app skeleton embodying the doc-05 design system.

**Scope**
- Vite + React 18 + TS strict; ESLint + Prettier; `app/` per the doc-03 repo layout
- Tailwind configured with doc-05 tokens: Ivory `#FAF7F0`, Ink `#251C31`, Curtain `#33224A`, Brass `#C79A3D`, Record Red `#D64545`, part colors (Tenor `#8FB7E8`, Lead `#E06A5A`, Bari `#C79A3D`, Bass `#5E8C6E`); light/dark themes
- React Router shell: Home / Start / Activity / Profile tab layout (empty screens with wordmark)
- Vite PWA plugin: manifest, four-quadrant icon, offline app shell

**Acceptance**
- `npm run dev/build/lint/test` all pass; placeholder screens render in both themes on iPhone-size viewport
- Lighthouse PWA installability check passes on the built output

### [M0-02] CI pipeline: lint, typecheck, test, build on every PR
> meta: labels=epic:foundations,type:infra · milestone=M0

**Scope:** GitHub Actions (Linux) running ESLint, `tsc --noEmit`, Vitest, and production build on PRs + main; cache node_modules; fail-fast; status badge in README.

**Acceptance:** A PR with a type error fails CI; a clean PR passes in < 5 min.

### [M0-03] Cloudflare Pages deployment — production + per-PR previews
> meta: labels=epic:foundations,type:infra · milestone=M0

**Scope:** Pages project on the free `*.pages.dev` domain wired to the repo; production deploy from `main`, preview URL per PR (posted as PR comment); SPA fallback routing; security headers (COOP/COEP as needed by ffmpeg.wasm later — verify SharedArrayBuffer availability).

**Acceptance:** Merging to `main` updates the production URL; every PR gets a working preview link; owner can open it on an iPhone.

### [M0-04] Firebase project: Auth + Firestore + local emulators
> meta: labels=epic:foundations,type:infra · milestone=M0

**Scope:** Firebase project (Spark plan) with Auth (Google + email/password enabled) and Firestore; `firebase/` dir with rules stub, indexes file, emulator config; app SDK wiring behind a thin `services/firebase.ts`; `.env.example` documenting config keys (public web config only — no secrets in repo).

**Acceptance:** App boots against emulators locally (`npm run emulators`) and against the real project on the preview deploy; anonymous read of a `config/flags` doc works.

### [M0-05] Cloudflare R2 bucket + Worker skeleton for signed media URLs
> meta: labels=epic:foundations,type:infra · milestone=M0

**Scope:** R2 bucket (free tier); `worker/` (TypeScript, Wrangler) with routes `POST /media/sign-upload` and `GET /media/sign-download` — verifying Firebase ID tokens (JWKS), enforcing max size 100 MB and content-type allowlist; per-uid daily quota counter (Workers KV); deploy via Wrangler in CI; CORS locked to app origins.

**Acceptance:** With a valid ID token, a test script uploads a file via signed PUT and fetches it via signed GET; invalid token → 401; oversize → 413. Documented in `worker/README.md`.

### [M0-06] Test harness: Vitest + Playwright with fake media devices
> meta: labels=epic:foundations,type:infra · milestone=M0

**Scope:** Vitest for unit tests (jsdom + plain); Playwright configured with `--use-fake-device-for-media-stream` / `--use-fake-ui-for-media-stream` and a sample fake-camera E2E that grants permissions and asserts a `getUserMedia` stream renders; CI job for E2E on Chromium; document how AV code gets tested (synthetic `AudioBuffer`s for engine math).

**Acceptance:** Sample unit + E2E tests pass locally and in CI.
