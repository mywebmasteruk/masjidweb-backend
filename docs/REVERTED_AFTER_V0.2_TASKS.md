# Restored to v0.2 — redo checklist (and branch policy)

The monorepo was reset to tag **`v0.2`** (commit `e3c9645`) to roll back provisioning/builder changes that did not resolve the empty-builder issue in production. Use this list to **re-apply ideas later** (prefer fresh PRs; SHAs are from history before the revert).

## Production branch policy (entire system → `main`)

- **GitHub:** default branch **`main`**; feature work merges into `main`.
- **CI:** workflows under `.github/workflows/` trigger on **`main`** only (see `ci.yml`, `deploy-admin-dashboard.yml`, `netlify-production-branch-main.yml`).
- **Netlify:** both sites (`masjidweb-admin-v2`, `masjidweb-multi`) should use production branch **`main`**. The workflow `netlify-production-branch-main.yml` PATCHes `build_settings.branch` and `allowed_branches` to `["main"]` when secrets allow.
- **Submodule `ycode-masjidweb`:** ship by bumping the pointer on **`main`**; builder repo also uses **`main`**.

Do not reintroduce a second long-lived production branch (e.g. `mw-admin-dash`) without updating Netlify + docs + CI together.

---

## Admin dashboard (`admin-dashboard-v2`) — tasks to redo selectively

| Topic | What changed (before revert) | Approx. commit (search history) |
|--------|------------------------------|----------------------------------|
| Template `page_layers` merge | `mergeTemplatePageLayersRowsByPageId`: when template has **two rows per `page_id`** (draft vs published ids), pick **richer `layers` JSON**, not newest `updated_at` only. | `c225059` |
| Provision complete + publish | `provision-complete` calls **`finishProvisionAndPublish`** so clone + activate + publish run in one completion path; dashboard polls until publish done. | `5413563` |
| Thin clone repair | **`repairClonedPageLayersIfThinnerThanTemplate`** after template clone if draft layers still much thinner than template. | `8f652f5` |
| Provision UI | Form placement / tab bar / “New tenant” UX tweaks (multiple commits). | `b0a62c6`, `bca69f6`, `f36e48f`, `a425195` |
| Copy / email | Invite email copy clarifications. | `14e85c8` |

Re-run tests: `cd admin-dashboard-v2 && npm test && npm run build`.

---

## YCode app (`ycode-masjidweb` submodule) — tasks to redo selectively

| Topic | What changed (before revert) | Approx. commit on `ycode-masjidweb` |
|--------|------------------------------|-------------------------------------|
| Editor init / empty canvas | **`dedupeLatestDraftPerPage`**: prefer **richer** duplicate draft rows; **`hydrateDraftsForEditor`**: if draft `layers` empty but published has content, **`upsertDraftLayers`** from published on editor init. | `8adc808` |
| Next routes | Duplicate `/api` vs `/ycode` route resolution. | `6c8671c` |
| Auth / tenant | Refresh-token storm fix, slug→id cache default, Supabase config fetch timeout, session recovery, etc. | `f9b0014`, `43fa3e6`, `7995535`, … |

Re-run: `cd ycode-masjidweb && npm run type-check && npm test && npm run build`.

---

## Submodule bump workflow

After changing `ycode-masjidweb`:

1. Commit on **`ycode-masjidweb`** `main`, push `origin main`.
2. In parent repo: `cd ycode-masjidweb && git pull` then `cd .. && git add ycode-masjidweb && git commit -m "chore: bump ycode-masjidweb"` and push **`main`**.

---

## Verify after any redo

- Provision a **new** tenant from the admin dashboard; confirm **public site** and **signed-in builder** show the template (not an empty canvas).
- Netlify deploy **ready** on both sites; spot-check `admin.masjidweb.com` and a tenant URL.
