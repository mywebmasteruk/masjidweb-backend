# AGENTS.md

## Cursor Cloud specific instructions

This monorepo has **two runnable products**. The update script installs deps for both
(it runs `git submodule update --init`, then `npm ci` in each project).

| Product | Path | Stack | Dev command | Port |
|---------|------|-------|-------------|------|
| Admin dashboard | `admin-dashboard-v2/` | Astro 5 (SSR, Netlify adapter) | `npm run dev` | 4321 |
| YCode builder | `ycode-masjidweb/` | Next.js 16 (Turbopack) | `npm run dev` | 3002 |

Node 22 is used for everything (CI pins `22`; the YCode submodule `.nvmrc` says `20` but
22 works fine). Package manager is **npm** (both have `package-lock.json`).

### `ycode-masjidweb` is a git submodule
- It lives in a separate repo and is **deprecated** in this monorepo's CI (`.github/workflows/ci.yml`
  only builds `admin-dashboard-v2`; the comment notes builder CI moved to `mywebmasteruk/ycode-mw-tenant`).
- The update script initializes it. If the directory is empty, run `git submodule update --init`.

### Running locally without external services
Neither product needs a real Supabase/Netlify backend just to boot:
- **Admin dashboard**: reads secrets via `process.env` fallback (`src/lib/server-env.ts`), so you can
  pass dev secrets inline instead of writing a `.env` (keeps secrets out of the repo — the repo has a
  strict no-secrets policy + `scripts/check-secrets.sh` pre-commit hook). Login needs only:
  `DASHBOARD_ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` (min 32 chars). Example:
  ```bash
  cd admin-dashboard-v2
  DASHBOARD_ADMIN_PASSWORD=dev-pass \
  ADMIN_SESSION_SECRET=dev-session-secret-please-change-32chars-minimum-0123456789 \
  SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=dummy \
  npm run dev
  ```
  - The host allowlist (`src/lib/admin-host-allowlist.ts`) only permits `localhost`, `127.0.0.1`,
    `*.netlify.app`, or `admin.<suffix>` — other Host headers get a 503. Use `localhost`.
  - `/dashboard` is gated by a JWT session cookie (middleware); unauthenticated requests 302 to `/login`.
  - The dashboard page queries Supabase `tenant_registry`; with a dummy/unreachable Supabase it fails
    open and renders an **empty** tenant list (no crash). A real `SUPABASE_URL` +
    `SUPABASE_SERVICE_ROLE_KEY` are required to see/provision actual tenants.
- **YCode builder**: boots without credentials and shows a first-run **"Welcome to Ycode"** setup screen
  at `/ycode/welcome`. Full builder/CMS functionality needs Supabase (`SUPABASE_*` in
  `ycode-masjidweb/.env.example`). Set `PAGE_AUTH_SECRET` (`openssl rand -hex 32`) for page auth cookies.

### Verify / lint / test / build (commands already documented)
- Root `scripts/verify-all.sh` runs both projects, **but it is stale for the submodule**: it calls
  `npm test` and `npm run lint` in `ycode-masjidweb`, yet that package has **no `test` script** (use
  `npx vitest run`) and its lint emits only warnings. Prefer per-project commands:
  - `admin-dashboard-v2`: `npx tsc --noEmit` · `npm test` (vitest) · `npm run build`
  - `ycode-masjidweb`: `npm run type-check` · `npx vitest run` · `npm run lint` · `npm run build`
- **Known pre-existing failures in the `ycode-masjidweb` submodule snapshot** (not environment issues —
  do not "fix" as part of setup): `type-check` reports 2 missing `*.png` module declarations in
  `lib/apps/registry.ts`, and 2 vitest cases in `lib/masjidweb/update-api-gates.test.ts` assert an old
  hardcoded version (`0.13.0`) vs the current package version. The build and lint still pass.
