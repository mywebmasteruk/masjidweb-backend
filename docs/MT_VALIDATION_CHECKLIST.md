# Multi-tenant validation checklist

Run on **deployed** preview or production URLs (not only localhost). Copy results into your PR.

**Branch:** _______________ **Date:** _______________ **Tester:** _______________

## Registry and routing

- [ ] Two active tenants A and B in `tenant_registry`
- [ ] Tenant A subdomain loads (not 404)
- [ ] Tenant B subdomain loads (not 404)

## Builder / session

- [ ] Editor on tenant A shows only tenant A content (smoke: pages/CMS)
- [ ] No cross-tenant draft data visible in UI spot-check
- [ ] Invite / session `user_metadata.tenant_id` matches subdomain

## Public / SSR

- [ ] Published site for A does not show B content
- [ ] Template / master builder path per env docs

## Provisioning (if exercised)

- [ ] Provision or re-run completion without hard failure
- [ ] Publish webhook outcome understood (success or documented warning)

## Isolation

- [ ] Cross-tenant access by ID fails or returns empty where expected

## Automation

- [ ] `bash scripts/verify-all.sh` passes locally
- [ ] GitHub Actions CI green on the branch

## Netlify / env (preview or production)

- [ ] Site uses Node **20+** (recommended **22**) and build env matches [`ycode-masjidweb/netlify.toml`](../ycode-masjidweb/netlify.toml) (`NODE_VERSION`, `HUSKY=0` where applicable).
- [ ] Deploy bundle excludes local **`.next`** / **`node_modules`** (see [`ycode-masjidweb/.netlifyignore`](../ycode-masjidweb/.netlifyignore)); CI should build clean on Netlify.
- [ ] Required Supabase and builder env vars set on the target site (no accidental prod keys on preview).

## Docs / submodule pointer

- [ ] Parent repo submodule commit for `ycode-masjidweb` matches the tested SHA (see [`docs/SUBMODULE.md`](SUBMODULE.md)).
- [ ] [`docs/UPSTREAM_MERGE_HOTSPOTS.md`](UPSTREAM_MERGE_HOTSPOTS.md) reviewed if upstream was merged this cycle.

**Notes:**
