# AGENTS.md

Guidance for cloud agents working in the MasjidWeb monorepo.

## Repository layout

| Path | App | Stack |
|------|-----|-------|
| `admin-dashboard-v2/` | Tenant provisioning admin UI | Astro 5 (SSR), Vitest |
| `ycode-masjidweb/` | YCode builder + public site renderer | Next.js 16, ESLint, Vitest |
| `supabase/migrations/` | Shared Postgres schema | SQL |
| `scripts/` | Verification, env sync, migrations | Bash / Node |

`ycode-masjidweb` is a **git submodule**. Initialize it before working on the builder:

```bash
git submodule update --init --recursive
```

## Node.js

- **Admin dashboard:** Node **22** (see `admin-dashboard-v2` CI / Netlify).
- **YCode builder:** Node **≥20** (`ycode-masjidweb/package.json` engines).

The cloud VM ships Node 22; no `.tools/` bootstrap needed on Linux.

## Verification

From repo root:

```bash
bash scripts/verify-all.sh
```

If `tsc --noEmit` fails but you need a quick gate:

```bash
cd admin-dashboard-v2 && npm test && npm run build
cd ../ycode-masjidweb && npx vitest run && npm run lint && npm run build
```

Enable the secret scan hook once per clone:

```bash
git config core.hooksPath .githooks
```

## Cursor Cloud specific instructions

### Dependency refresh (automatic)

The VM update script runs `git submodule update --init --recursive` and `npm ci` in both app directories. No Docker or local Supabase stack exists in this repo.

### Environment variables

Both apps talk to **remote Supabase Cloud** and Netlify APIs. There is no in-repo `.env` with secrets.

- **Admin local dev:** copy `admin-dashboard-v2/.env.example` → `.env`, or run `bash scripts/fetch-netlify-env.sh` when `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` are set (admin site `masjidweb-admin-v2`).
- **YCode local dev:** copy `ycode-masjidweb/.env.example` → `.env.local` with Supabase keys and `TENANT_DOMAIN_SUFFIX=masjidweb.com`.

Without env, local servers still start but API health is **degraded** (503 on `/ycode/api/health`). The admin login page and YCode builder shell still load.

### Starting dev servers

Use separate tmux sessions (long-running):

```bash
# Admin — http://localhost:4321 (redirects to /dashboard login)
cd admin-dashboard-v2 && npm run dev -- --host 0.0.0.0 --port 4321

# YCode — http://localhost:3002/ycode
cd ycode-masjidweb && npm run dev -- --hostname 0.0.0.0
```

**Production verification** (preferred for UI changes per workspace rules): `https://admin.masjidweb.com` and `https://masjidemo1.masjidweb.com/ycode`. Do not treat localhost alone as the primary check for shipped work.

### Shipping

Push to **`main`** on this repo; Netlify builds admin from `admin-dashboard-v2/` (`netlify.toml`). The builder submodule deploys from its linked Netlify site. Never use manual Netlify CLI production deploys except emergencies.

### Known verify-all caveats (as of setup)

- `admin-dashboard-v2`: `npx tsc --noEmit` may fail on `core-update-wizard-ui` types while `npm test` and `npm run build` still pass.
- `ycode-masjidweb`: standalone `tsc --noEmit` can fail on missing `lib/apps/*/logo.png` imports; `next build` succeeds. Two Vitest cases in `update-api-gates.test.ts` expect version `0.13.0` but package is `1.6.1`.
- `verify-all.sh` calls `npm test` in YCode, but `package.json` has no `test` script — use `npx vitest run` instead until a script is added upstream.
