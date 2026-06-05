# Core update regression runbook

Companion to `CORE_UPDATE_WORKFLOW.md`. Documents known regressions from the
June 2026 core-update cycle (merge `feafbe0`, Ycode `30cc6a3`) and the
guardrails added to prevent recurrence.

---

## Known regressions from feafbe0 merge

### 1 — Invite hidden for provisioned tenant admins

| | |
|---|---|
| **Root cause** | Upstream commit `8176908` added RBAC (`requireManageMembers`). MasjidWeb tenants provisioned without `role` in `app_metadata` default to `designer`, which cannot manage members. |
| **Symptom** | "Invite User" button invisible; POST `/ycode/api/auth/invite` returns 403. |
| **Fix** | `bootstrapTenantOwnerIfNeeded` in `lib/masjidweb/bootstrap-tenant-owner.ts`. Called from `GET /ycode/api/auth/users` and `POST /ycode/api/auth/session` when tenant has no owner/admin. Promotes the current active user to `owner`. |
| **Status** | Fix implemented + tests pass. Needs a commit + Netlify deploy to take effect. |
| **Regression test** | `lib/masjidweb/provisioned-tenant-rbac.test.ts` (20 tests). Added to CI. |

**How to manually verify (two-tenant smoke):**

1. Open `https://{slug}.masjidweb.com/ycode/dashboard` as the provisioned tenant admin.
2. Navigate to Settings → Members. "Invite User" button should be visible.
3. If not, check `app_metadata.role` in Supabase Auth console: should now be `owner` after the first `/ycode/api/auth/users` call.

---

### 2 — Collection item helpers truncated by AI repair

| | |
|---|---|
| **Root cause** | AI repair (commit `084af0b`) cut `collectionItemRepository.ts` from ~1 900 lines to ~1 500 by truncating `stageSingleItem`, `publishSingleItem`, and `unpublishSingleItem`. Also introduced invalid `getSupabaseAdmin(tenantId)` calls. |
| **Symptom** | Stage / publish / unpublish of individual items fails silently at runtime. |
| **Fix** | Restored in commit `c53d63d`. Truncation prevention hardened in `44c7881` (reject `finish_reason=length`, budget output tokens, assert balanced delimiters). |
| **Status** | Fixed + hardened. |
| **Regression guard** | `scripts/check-repair-completeness.sh` — run automatically in `ai-repair-safe-update.yml` before commit. |

---

## Guardrails added in this cycle

### Layer 1 — Pre-merge CI (ci-build-check.yml)

Added to the **Tenant safety tests** step:

- `lib/masjidweb/bootstrap-tenant-owner.test.ts` — bootstrap logic unit tests.
- `lib/masjidweb/provisioned-tenant-rbac.test.ts` — **new** regression suite (20 tests):
  - Role-less user resolves to `designer`.
  - `designer` cannot manage members.
  - Bootstrap promotes the only active user to `owner`.
  - After bootstrap user can manage members.
  - Bootstrap is no-op when owner/admin already exists.
  - Pending invite user is never promoted.

These tests would have caught regression #1 before merge.

### Layer 2 — Post-AI-repair completeness check (ai-repair-safe-update.yml)

**`scripts/check-repair-completeness.sh`** runs automatically after every AI
repair run, before the commit step. It:

- Confirms critical exports exist in each touched repository file.
- Verifies `getSupabaseAdmin` is not called with arguments (invalid pattern).
- Fails the workflow step (non-zero exit) if any check fails, preventing a
  truncated/corrupted file from being committed.

Files checked: `collectionItemRepository`, `mcpTokenRepository`, `mcp/handler`,
`pageRepository`, `collectionFieldRepository`, `bootstrap-tenant-owner`,
`roles.ts`, `roles-server.ts`, invite route.

### Layer 3 — Truncation prevention in AI repair engine (already shipped 44c7881)

- Reject OpenRouter responses with `finish_reason=length`.
- Budget `max_tokens` from the size of the text being resolved (3.2 chars/token
  + 25% headroom, clamped to 60k).
- Assert balanced delimiters after each hunk resolution.

---

## Broad audit status after 3144c5a / 43e8b2b

### Reviewed high-risk merge paths

The post-merge audit re-checked the highest-risk MasjidWeb seams from
`feafbe0`:

- Auth / RBAC: `api/auth/users`, `api/auth/session`, `api/auth/invite`,
  `lib/roles*`, `bootstrap-tenant-owner`
- Fragile login flow: `accept-invite`, `YCodeLayoutClient`, `proxy.ts`,
  shared Supabase cookie-domain handling
- Tenant isolation repositories: `collectionItemRepository`, `pageRepository`,
  `translationRepository`
- Safe-update automation: admin wizard, AI repair dispatch/status, PR CI,
  completeness script, deploy notification

### Audit conclusion

- No additional shipped regression was found in the reviewed auth / tenant paths
  after the follow-up fixes on `main` (`03932b6`, `3144c5a`).
- The original failures are covered by real guardrails now:
  - provisioned-tenant RBAC bootstrap tests
  - completeness checks for truncated AI repair output
  - OpenRouter truncation rejection (`finish_reason=length`)
  - direct Netlify polling for post-merge production confirmation

### Gaps still open

These are **process / coverage gaps**, not confirmed production regressions:

1. **AI repair success is not the same as PR safety green.**
   `ai-repair-safe-update.yml` verifies the build and completeness script, but
   it does **not** run the full tenant vitest safety suite itself. Approval must
   still wait for the normal PR checks to finish green.
2. **Accept-invite / standalone-route behavior is still mostly manual.**
   The fragile flow is documented and partially covered, but we still rely on
   preview smoke for `/ycode/accept-invite`, magic-link handoff, and standalone
   layout exclusion.
3. **Completeness checks are structural, not semantic.**
   `check-repair-completeness.sh` proves critical exports survived and blocks the
   broken `getSupabaseAdmin(tenantId)` pattern, but it cannot prove business
   logic correctness in repaired functions.
4. **Backend auth-link tests are still narrow.**
   `send-tenant-auth-link.test.ts` protects the redirect target, but not yet the
   full invite-recovery / magic-link fallback matrix.

---

## Pre-approve checklist for future core updates

Before clicking **Approve merge** in the admin dashboard:

- [ ] CI green (`ci-build-check.yml`: tsc + tenant safety tests + build).
- [ ] If AI repair pushed a commit, wait for the **normal PR checks** to rerun
      and finish green. Do **not** approve based only on “AI repair finished”.
- [ ] `bash scripts/check-repair-completeness.sh` exits 0 (automated in AI repair workflow; run manually for human-resolved conflicts).
- [ ] Update safety check report reviewed — all `high` files listed were inspected.
- [ ] If upstream added RBAC, auth, or role logic: confirm MasjidWeb provisioning path still works (provisioned user can log in, invite others, publish).
- [ ] If upstream changed repository files: verify they still call `applyTenantEq` and `resolveEffectiveTenantId`.
- [ ] Netlify deploy preview opens without JS errors.
- [ ] If auth / proxy / layout files changed: preview-test `/ycode/accept-invite`,
      magic-link to `/ycode`, and Settings → Members (“Invite User” visible for a
      provisioned tenant with no pre-existing owner role).
- [ ] Optional: run `MT_VALIDATION_CHECKLIST.md` two-tenant smoke on the preview deploy.

---

## Fix order for open issues (as of June 2026)

| # | Issue | Status | Next action |
|---|-------|--------|-------------|
| 1 | Invite hidden | Fix implemented locally | Commit `bootstrap-tenant-owner` changes + deploy |
| 2 | Collection item helpers truncated | Fixed in c53d63d | Deployed; monitor for stage/publish errors |
| 3 | `getSupabaseAdmin(tenantId)` misuse | Fixed in c53d63d | Completeness script now prevents recurrence |
| 4 | MasjidWeb RBAC tests missing from CI | Fixed — added to ci-build-check.yml | Commit workflow change |
| 5 | Post-repair truncation guard | Fixed — ai-repair-safe-update.yml updated | Commit workflow change |

---

## Related docs

- `CORE_UPDATE_WORKFLOW.md` — full update lifecycle
- `MT_VALIDATION_CHECKLIST.md` — two-tenant smoke checklist
- `UPSTREAM_MERGE_HOTSPOTS.md` — high-risk files by path prefix
- `ycode-mw-tenant/docs/masjidweb-core-seams.md` — what must not break
- `ycode-mw-tenant/lib/masjidweb/bootstrap-tenant-owner.ts` — bootstrap logic
- `ycode-mw-tenant/scripts/check-repair-completeness.sh` — completeness script
