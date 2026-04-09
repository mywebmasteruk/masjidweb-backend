# Verify baseline (`main`)

Before merging changes, run from the **repository root**:

```bash
bash scripts/verify-all.sh
```

This runs TypeScript checks, tests, lint, and production builds for `admin-dashboard-v2` and `ycode-masjidweb`. CI runs the same steps via [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

If Node is not available in a sandbox, run the script on your machine and attach logs to the PR.

## Local `node_modules` hygiene (cloud-sync workspaces)

If **`tsc`** fails with **TS2688** (cannot find type definition for names like `'chai 2'` or `'node 2'`), check for **duplicate folders** under `node_modules/@types/` whose names end with **` 2`** (common with OneDrive/iCloud conflict copies). Remove the stray `* 2` directories, or run a clean **`npm ci`** in a path that is not cloud-duplicating `node_modules`. This is a machine sync issue, not an application bug.

## MT preview site on Netlify (`masjidweb-ycode-mt-preview`)

- **Dashboard:** [Netlify project](https://app.netlify.com/projects/masjidweb-ycode-mt-preview) — use the **Deploy log** for the latest deploy if the build fails (exit code 2).
- **Local first:** `cd ycode-masjidweb && npm install --legacy-peer-deps && npm run build` — fix any error shown; then push or run `bash scripts/deploy-ycode-mt-preview.sh` (requires Netlify CLI auth).
- **Recommended:** connect this site to your **Git** repo with base directory `ycode-masjidweb` so Netlify builds from revision control instead of folder upload only.
- Environment variables were aligned with the production tenant pool site for a working runtime; **rotate any API tokens or secrets** if they may have been exposed outside your vault.
