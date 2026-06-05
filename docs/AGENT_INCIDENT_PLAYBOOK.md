# Agent incident playbook

Canonical companion to `CORE_UPDATE_WORKFLOW.md`. This is the symptom-first,
agent-optimized write-up of the June 2026 MasjidWeb core-update incident that
started with Ycode merge `feafbe0` (`30cc6a3`) and follow-up guardrail commits
`03932b6`, `3144c5a`, `7a78dad`, `17908f2`, and backend runbook commit
`11459f9`.

Use this document when a post-merge builder deploy looks "mostly alive" but
MasjidWeb-specific flows are broken.

---

## Read this first

Before changing auth, tenant scoping, invite flow, proxy behavior, or collection
repositories, read:

- `docs/TENANCY.md`
- `docs/NATIVE_SCOPE_AUDIT.md`
- `docs/MT_VALIDATION_CHECKLIST.md`
- `docs/CORE_UPDATE_WORKFLOW.md`
- `../ycode-mw-tenant/docs/core-update-process.md`
- `../ycode-mw-tenant/docs/masjidweb-core-seams.md`

If auth or magic-link behavior is involved, also read these fragile-flow files:

- `admin-dashboard-v2/src/lib/send-tenant-auth-link.ts`
- `admin-dashboard-v2/src/lib/send-tenant-auth-link.test.ts`
- `../ycode-mw-tenant/app/(builder)/ycode/accept-invite/page.tsx`
- `../ycode-mw-tenant/app/(builder)/ycode/api/auth/session/route.ts`
- `../ycode-mw-tenant/lib/supabase-cookie-domain.ts`
- `../ycode-mw-tenant/lib/supabase-browser.ts`
- `../ycode-mw-tenant/lib/supabase-route-client.ts`
- `../ycode-mw-tenant/proxy.ts`
- `../ycode-mw-tenant/app/(builder)/ycode/YCodeLayoutClient.tsx`

---

## Quick triage index

| If you see this | Check this first | Run this next | Likely fix |
|---|---|---|---|
| Settings -> Members has no `Invite User` | User has no `app_metadata.role`; upstream RBAC now gates invite UI | `npx vitest run lib/masjidweb/bootstrap-tenant-owner.test.ts lib/masjidweb/provisioned-tenant-rbac.test.ts` | `bootstrap-tenant-owner.ts`, auth users/session routes, settings page `callerRole` |
| Builder collection layers shimmer forever or render empty cards | Data exists in Supabase, but Knex field-sort path is failing; store retries forever | `npm run type-check` and verify collection repos plus `useCollectionLayerStore.ts` error handling | Supabase fallback in `collectionItemRepository.ts`; record `layerConfig` on error to break infinite retry |
| AI repair run says success but core repo later fails mysteriously | OpenRouter response was truncated (`finish_reason=length`) or a file tail was chopped | `bash scripts/check-repair-completeness.sh` | Reject truncation, run completeness guard, require PR CI green before merge |
| OAuth `/register` or `/token` returns 401 before handler runs | Route is public in code but missing from `PUBLIC_API_EXACT` | `npx vitest run lib/tenant/middleware-utils.test.ts` | Add OAuth DCR register/token routes to `middleware-utils.ts` allowlist |
| Post-merge builder looks broken in several unrelated places | Upstream feature landed without matching MasjidWeb proxy / bootstrap / tenant-scope updates | Review seams in `docs/masjidweb-core-seams.md` and rerun tenant safety tests | Re-apply MasjidWeb seams in same merge; do not ship until PR CI is green |

---

## Incident timeline

### Merge and follow-up reference SHAs

- `feafbe0`: merged safe Ycode update PR
- `03932b6`: fixed tenant owner bootstrap and collection tenant scoping
- `3144c5a`: added RBAC guardrails and repair completeness checks
- `7a78dad`: allowed unauthenticated OAuth register and token routes
- `17908f2`: hardened AI repair workflow with tenant safety tests
- `44c7881`: hardened AI repair against truncated OpenRouter output
- `c53d63d`: restored truncated `collectionItemRepository.ts` tail
- `11459f9`: documented post-audit gaps and stricter approval checklist

### What actually went wrong

This was not one bug. The `feafbe0` merge carried new upstream behavior in RBAC,
collections, OAuth, and AI-repair-adjacent files, but MasjidWeb needs matching
fork logic in proxy, bootstrap, tenant scoping, and route allowlists. The merge
compiled, but those seams were no longer fully aligned.

The durable lesson is: upstream behavior changes are not safe in MasjidWeb until
the corresponding fork seams are updated in the same PR and the PR finishes with
normal CI green.

---

## Incident 1: `Invite User` hidden after `feafbe0`

### Symptom

- Provisioned tenant opens `https://{slug}.masjidweb.com/ycode`
- Settings -> Members shows users but no `Invite User` control
- `POST /ycode/api/auth/invite` returns `403`
- The affected user appears as `Designer`, not `Owner` or `Admin`

### Root cause

Upstream commit `8176908` introduced RBAC gates such as
`requireManageMembers`. MasjidWeb provisions tenant admins without a Ycode
`role` in `app_metadata`, so role resolution fell back to `designer`. In
upstream Ycode that is acceptable; in MasjidWeb it broke the provisioned-tenant
owner bootstrap assumption.

### Files that mattered

- `../ycode-mw-tenant/lib/masjidweb/bootstrap-tenant-owner.ts`
- `../ycode-mw-tenant/app/(builder)/ycode/api/auth/users/route.ts`
- `../ycode-mw-tenant/app/(builder)/ycode/api/auth/session/route.ts`
- `../ycode-mw-tenant/app/(builder)/ycode/settings/users/page.tsx`
- `../ycode-mw-tenant/lib/roles.ts`
- `../ycode-mw-tenant/lib/roles-server.ts`

### Fix

Bootstrap the current signed-in tenant user to `owner` when:

- the tenant has no existing `owner` or `admin`
- the current user belongs to the tenant
- the current user is an active account, not an unfinished invite

The bootstrap logic lives in
`../ycode-mw-tenant/lib/masjidweb/bootstrap-tenant-owner.ts` and is invoked from:

- `GET /ycode/api/auth/users`
- `POST /ycode/api/auth/session`

The settings page must also compute `callerRole` from the repaired server-side
role so the invite UI reappears immediately.

### How to verify

1. Run:
   ```bash
   cd ../ycode-mw-tenant
   npx vitest run lib/masjidweb/bootstrap-tenant-owner.test.ts lib/masjidweb/provisioned-tenant-rbac.test.ts
   ```
2. Log into a provisioned tenant with no pre-existing owner role.
3. Open `https://masjidemo1.masjidweb.com/ycode`
4. Go to Settings -> Members.
5. Confirm `Invite User` is visible.
6. If still missing, inspect the tenant user in Supabase Auth:
   - `app_metadata.tenant_id` should match the tenant
   - `app_metadata.role` should become `owner` after the bootstrap path runs

### Regression tests

- `../ycode-mw-tenant/lib/masjidweb/bootstrap-tenant-owner.test.ts`
- `../ycode-mw-tenant/lib/masjidweb/provisioned-tenant-rbac.test.ts`

These tests cover:

- no-role user resolves to `designer`
- `designer` cannot manage members
- the only active tenant user is promoted to `owner`
- pending invites are never promoted

---

## Incident 2: collection layers empty / perpetual shimmer on `masjidemo1`

### Symptom

- Builder canvas showed empty repeated layers or gray shimmer bars
- Public data existed in Supabase
- The broken tenant slug was `masjidemo1`
- A common debugging mistake was checking `masjiddemo1` instead

### Root cause

Two failures stacked:

1. A Knex field-sort path hit `ECIRCUITBREAKER` even though the collection data
   still existed in Supabase.
2. `useCollectionLayerStore` kept retrying forever and never stored enough error
   state to stop the shimmer loop.

The net effect was "data exists, UI looks empty forever."

### Files that mattered

- `../ycode-mw-tenant/lib/repositories/collectionItemRepository.ts`
- `../ycode-mw-tenant/stores/useCollectionLayerStore.ts`
- `../ycode-mw-tenant/components/LayerRenderer.tsx`
- `../ycode-mw-tenant/components/FilterableCollection.tsx`

### Fix

- Add a Supabase fallback path in
  `../ycode-mw-tenant/lib/repositories/collectionItemRepository.ts` when the
  Knex field-sort path fails.
- Record `layerConfig` on error in `useCollectionLayerStore` so the UI can exit
  the retry loop and surface a real failure state instead of shimmering forever.

### How to verify

1. Run:
   ```bash
   cd ../ycode-mw-tenant
   npm run type-check
   npm run build
   ```
2. Open `https://masjidemo1.masjidweb.com/ycode`
3. Load the builder page that previously showed empty News / Upcoming Events
   collection layers.
4. Confirm repeated items render instead of an endless shimmer.
5. If the UI is still empty, confirm data exists for the correct slug:
   `masjidemo1`, not `masjiddemo1`.
6. If data exists but render still fails, inspect runtime logs for
   `ECIRCUITBREAKER` and whether the fallback path ran.

### Important nuance

This incident did **not** prove the data was missing. It proved MasjidWeb cannot
rely on a single query path for builder collections when core updates modify
repository behavior and a pooler or Netlify env issue makes Knex brittle.

---

## Incident 3: AI repair truncated `collectionItemRepository.ts`

### Symptom

- AI repair workflow reported success
- Later build/type-check failed or stage/publish/unpublish helpers disappeared
- `collectionItemRepository.ts` was shorter than expected and missing exports

### Root cause

OpenRouter returned a truncated answer with `finish_reason=length`. The repair
step accepted it, which chopped the tail of
`../ycode-mw-tenant/lib/repositories/collectionItemRepository.ts` and removed
working implementations of:

- `stageSingleItem`
- `publishSingleItem`
- `unpublishSingleItem`

It also introduced invalid `getSupabaseAdmin(tenantId)` calls.

### Fix

- Restore the lost file tail (`c53d63d`)
- Reject truncated AI responses (`44c7881`)
- Add `../ycode-mw-tenant/scripts/check-repair-completeness.sh`
- Wire the completeness script into
  `../ycode-mw-tenant/.github/workflows/ai-repair-safe-update.yml`

### How to verify

1. Run:
   ```bash
   cd ../ycode-mw-tenant
   bash scripts/check-repair-completeness.sh
   npm run type-check
   npm run build
   ```
2. Confirm the script checks critical exports in:
   - `collectionItemRepository`
   - `mcpTokenRepository`
   - `mcp/handler`
   - `pageRepository`
   - `collectionFieldRepository`
   - `bootstrap-tenant-owner`
   - `roles.ts`
   - `roles-server.ts`
   - invite route
3. Confirm the script rejects `getSupabaseAdmin(tenantId)`

### Process rule

Do not treat "AI repair finished" as merge-ready. AI repair is only a partial
automation step. The PR is not safe until the normal PR checks rerun and finish
green.

---

## Incident 4: OAuth `/register` and `/token` returned 401

### Symptom

- OAuth DCR register or token exchange returned `401`
- Route handler looked public in code, but middleware blocked it before the
  route could run

### Root cause

The routes were intended to be public, but they were missing from
`../ycode-mw-tenant/lib/tenant/middleware-utils.ts` `PUBLIC_API_EXACT`.

### Files that mattered

- `../ycode-mw-tenant/lib/tenant/middleware-utils.ts`
- `../ycode-mw-tenant/lib/tenant/middleware-utils.test.ts`

### Fix

Add:

- `POST /ycode/api/oauth/register`
- `POST /ycode/api/oauth/token`

to `PUBLIC_API_EXACT`, while keeping `/ycode/api/oauth/authorize` protected.

### How to verify

1. Run:
   ```bash
   cd ../ycode-mw-tenant
   npx vitest run lib/tenant/middleware-utils.test.ts
   ```
2. Confirm these assertions pass:
   - register is public
   - token is public
   - authorize stays protected

---

## Cross-cutting lessons that must survive future merges

### 1. Upstream features need matching MasjidWeb seam updates in the same PR

If upstream changes any of these areas, assume MasjidWeb needs explicit fork
work before merge:

- RBAC and role resolution
- auth routes and session bootstrap
- proxy tenant routing
- repository tenant scoping
- OAuth allowlists
- collection data-loading paths

### 2. AI repair is never sufficient evidence on its own

Required bar:

- repair succeeded
- completeness script passed
- tenant safety tests passed
- type-check passed
- build passed
- PR checks finished green

### 3. Structural guards catch file loss, not business regressions

`check-repair-completeness.sh` catches truncated exports and known bad call
patterns. It does **not** prove RBAC, collection loading, or tenant routing are
correct. That still needs tests and manual smoke.

### 4. Fragile invite and cookie-domain flow remains a manual hotspot

Even after this incident, the full invite-recovery and magic-link matrix is not
fully proven by automation. If a core update touches auth/proxy/layout, manually
verify:

- `/ycode/accept-invite`
- `/ycode/api/auth/session`
- tenant-subdomain cookie persistence
- Settings -> Members invite flow

---

## Guardrails shipped from this incident

### Pre-merge / PR guardrails

- `03932b6`: tenant owner bootstrap and collection tenant-scope fixes
- `3144c5a`: RBAC tests + repair completeness checks
- `7a78dad`: OAuth public-route allowlist fix
- `17908f2`: AI repair workflow hardening with tenant safety tests

### AI repair guardrails

- `44c7881`: reject `finish_reason=length`, budget tokens, assert balanced delimiters
- `c53d63d`: restored truncated repository tail and removed invalid admin calls
- `../ycode-mw-tenant/scripts/check-repair-completeness.sh`
- `../ycode-mw-tenant/.github/workflows/ai-repair-safe-update.yml`

### Documentation guardrails

- `11459f9`: stricter approval checklist and post-audit gaps

---

## Before / during / after core update checklist

### Before merge

- [ ] Read `docs/TENANCY.md`, `docs/NATIVE_SCOPE_AUDIT.md`, `docs/MT_VALIDATION_CHECKLIST.md`
- [ ] Read `../ycode-mw-tenant/docs/masjidweb-core-seams.md`
- [ ] Review changed files against `docs/UPSTREAM_MERGE_HOTSPOTS.md`
- [ ] If upstream touched auth, RBAC, proxy, or repositories, assume MasjidWeb seam work is required

### During conflict resolution / AI repair

- [ ] Re-apply Tier 1 proxy/auth seams first
- [ ] Re-apply repository tenant-scope seams (`applyTenantEq`, `resolveEffectiveTenantId`, `tenant_id` on writes)
- [ ] Run `bash scripts/check-repair-completeness.sh`
- [ ] Reject any AI output with `finish_reason=length`
- [ ] Never approve a PR only because AI repair completed

### Before approval

- [ ] `npm run type-check`
- [ ] `npm run build`
- [ ] `npx vitest run lib/masjidweb/bootstrap-tenant-owner.test.ts lib/masjidweb/provisioned-tenant-rbac.test.ts lib/tenant/middleware-utils.test.ts`
- [ ] Review preview deploy for JS errors
- [ ] Smoke tenant A and tenant B per `docs/MT_VALIDATION_CHECKLIST.md`
- [ ] For auth changes, preview-test `/ycode/accept-invite` and Settings -> Members

### After merge / production verification

- [ ] Confirm the deploy actually finished for the merged SHA
- [ ] Verify `Invite User` on a provisioned tenant
- [ ] Verify collection layers render on `masjidemo1`
- [ ] Verify OAuth register/token for MCP clients
- [ ] If any one of those fails, re-open this playbook before debugging from scratch

---

## Known remaining gaps

These are not confirmed current regressions; they are places future agents
should distrust first:

1. Full invite-recovery / magic-link fallback matrix is still only partially
   covered by tests.
2. Completeness checks are structural, not semantic.
3. Collection rendering can still be sensitive to downstream Knex / pooler env
   failures even when Supabase data is healthy.
4. Merge approval is still vulnerable if reviewers equate "automation finished"
   with "PR safe."

---

## Copy-paste commands

```bash
cd "/Users/asirokh/Library/Mobile Documents/com~apple~CloudDocs/OneDrive2/mywebmaster/startups/Non-profit/1.masjidweb/app/ycode-mw-tenant"
npx vitest run lib/masjidweb/bootstrap-tenant-owner.test.ts lib/masjidweb/provisioned-tenant-rbac.test.ts lib/tenant/middleware-utils.test.ts
npm run type-check
npm run build
bash scripts/check-repair-completeness.sh
```

```bash
cd "/Users/asirokh/Library/Mobile Documents/com~apple~CloudDocs/OneDrive2/mywebmaster/startups/Non-profit/1.masjidweb/app/masjidweb-backend"
bash scripts/check-secrets.sh
```

---

## Related docs

- `docs/CORE_UPDATE_WORKFLOW.md`
- `docs/TENANCY.md`
- `docs/NATIVE_SCOPE_AUDIT.md`
- `docs/MT_VALIDATION_CHECKLIST.md`
- `docs/UPSTREAM_MERGE_HOTSPOTS.md`
- `../ycode-mw-tenant/docs/core-update-process.md`
- `../ycode-mw-tenant/docs/masjidweb-core-seams.md`
