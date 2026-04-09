# MasjidWeb — Multi-Tenant YCode Platform

**Source of truth: GitHub. Runtime: Netlify.**
Nothing needs to live on a Mac except a temporary copy while you push code to GitHub (or use GitHub's web UI).

## One working copy on your machine

Use **one clone** of this repo locally. Multiple Git worktrees (for example under `~/.cursor/worktrees/...`) duplicated the same code and led to edits landing in the wrong folder. **Keep a single checkout** — the folder you open in your editor.

- Sanity check: `git worktree list` should show **one** line for this repo (the path you use daily).
- To remove an extra worktree from the machine that registered it: `git worktree remove <path> --force` (run from the main clone), then `git worktree prune`.

**Branch:** Everything ships from **`main`** — this repo, the **`ycode-masjidweb`** submodule pointer, GitHub default branch, Netlify production branches, and CI.

## What this repo contains

- **`admin-dashboard-v2/`** — Tenant provisioning dashboard (login, provision form, Netlify domain aliases, Supabase automation). Subdomain multi-tenant on one Netlify site.
- **`ycode-masjidweb/`** — The YCode visual builder + public site renderer (Next.js 16). One deployment serves all tenant subdomains.
- **`supabase/migrations/`** — SQL to run once in your Supabase project (tenant registry, lifecycle, RLS).
- **`scripts/`** — Automation helpers (env sync, DNS, migration apply, verification).
- **`.github/workflows/`** — CI/CD: admin dashboard deploy + full verification pipeline.

## Architecture

All tenants share a **single Netlify deployment** of `ycode-masjidweb`. Each tenant gets a subdomain alias (e.g. `{slug}.masjidweb.com`). The middleware resolves the subdomain to a `tenant_id` and scopes all data access.

The admin dashboard (`admin-dashboard-v2`) provisions new tenants by: inserting a `tenant_registry` row, adding a Netlify domain alias, cloning the template tenant's pages/CMS, publishing, and inviting the tenant owner.

## Setup

1. **Create a GitHub repository** (private is fine) and push this folder as the repo root.
2. **Admin dashboard deploy (recommended):** In GitHub → **Settings → Secrets and variables → Actions**, add **`NETLIFY_AUTH_TOKEN`** (Netlify user settings → personal access tokens) and **`NETLIFY_SITE_ID`** (site **Site settings → Site details → Site ID**, e.g. `masjidweb-admin-v2`). Pushes to **`main`** that touch `admin-dashboard-v2/` run [`.github/workflows/deploy-admin-dashboard.yml`](.github/workflows/deploy-admin-dashboard.yml) and deploy to Netlify production—no manual zip uploads.
3. **Alternative:** Netlify → **Import from Git** on the same repo; build settings are in root [`netlify.toml`](netlify.toml) (`base = admin-dashboard-v2`).
4. **Supabase schema:** apply all migrations in `supabase/migrations/` via the SQL editor, or run `scripts/apply-supabase-migration.sh` with `DATABASE_URL`.
5. **Netlify environment variables:** see [`admin-dashboard-v2/.env.example`](admin-dashboard-v2/.env.example) and [`ycode-masjidweb/.env.example`](ycode-masjidweb/.env.example).

## Local verification

```bash
bash scripts/verify-all.sh
```

Runs TypeScript checks, Vitest, ESLint, and production builds for both `admin-dashboard-v2` and `ycode-masjidweb`.

## Documentation

- **[`admin-dashboard-v2/docs/MASTER_TENANT.md`](admin-dashboard-v2/docs/MASTER_TENANT.md)** — Template tenant setup, env variables, provisioning flow.
- **[`TEST_PLAN.md`](TEST_PLAN.md)** — Automated and manual test plan, regression matrix, failure triage.
