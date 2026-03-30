# Comprehensive test plan — MasjidWeb multi-tenant

This document covers **automated** checks (run locally / CI) and **manual** end-to-end verification for template (`master.*`), provisioning, and auth. **Demo sites** are normal tenants (e.g. provision slug `demo` after updating the template)—there is no separate masjid1 sync.

---

## 1. Objectives

| Area | What “good” looks like |
|------|-------------------------|
| **Type safety** | `admin-dashboard-v2` and `ycode-masjidweb` compile with `tsc --noEmit`. |
| **Tenant constants** | Template UUID resolution (`getTemplateTenantId`) and demo defaults are consistent. |
| **Email policy** | Duplicate emails for new tenants are rejected; normalization works. |
| **Provisioning (manual)** | New tenant gets clone + publish + CMS seed + invite; registry `active`. |

### Integration tools (Cursor MCP) — what can be verified remotely

| Tool | Use |
|------|-----|
| **Supabase MCP** | `list_projects`, `execute_sql` / `apply_migration`, `list_migrations` — registry rows, RPC presence, idempotent data fixes. |
| **YCode MCP** | `list_pages`, `publish`, etc. — against the connected template site (same Supabase project). |
| **Netlify MCP** | `get-projects`, `deploy-site` (upload build), `get-deploy` — ship admin dashboard and YCode app; confirm deploy state. |
| **Browser MCP** | Smoke that public URLs load (`master.*` welcome / builder). |

**Env secrets** (`PROVISIONING_WEBHOOK_SECRET`, etc.) are not readable via MCP; set them in Netlify and confirm provisioning publish works (see section 5).

---

## 2. Automated suite (run every PR / before deploy)

From repository root, run the full local gate (TypeScript, Vitest, ESLint, production builds):

```bash
bash scripts/verify-all.sh
```

Or run packages separately:

```bash
cd admin-dashboard-v2 && npx tsc --noEmit && npm test && npm run build
cd ../ycode-masjidweb && npx tsc --noEmit && npm test && npm run lint && npm run build
```

### What automated tests cover today

| Suite | Location | Scope |
|-------|----------|-------|
| Email policy | `admin-dashboard-v2/src/lib/provision-email-policy.test.ts` | RPC contract, duplicate email, normalization |
| Email helpers | `admin-dashboard-v2/src/lib/provision-email.test.ts` | Placeholder / resolution behavior |
| Master tenant constants | `admin-dashboard-v2/src/lib/master-tenant-constants.test.ts` | Default UUID, `process.env.TEMPLATE_TENANT_ID` override |

**Not covered by automated tests (requires live services):**

- Supabase RPC `delete_tenant_scoped_data`, full `cloneTemplateForTenant`, `inviteUserByEmail`
- Netlify publish API, DNS, real JWT sessions on subdomains

---

## 3. Manual E2E — prerequisites

- [ ] Supabase migrations applied (including `master` slug). Optional: remove legacy `masjid1` row if present; use a provisioned demo tenant instead.
- [ ] **YCode** Netlify: `TEMPLATE_TENANT_ID`, `PROVISIONING_WEBHOOK_SECRET` (16+ chars), `TENANT_DOMAIN_SUFFIX`, aliases for `master.*` and any demo subdomains.
- [ ] **Admin dashboard** Netlify: same `PROVISIONING_WEBHOOK_SECRET`, `SUPABASE_*`, `TEMPLATE_TENANT_ID`, `TENANT_DOMAIN_SUFFIX`.
- [ ] Supabase Auth: SMTP or provider; redirect URL allowlist includes `https://*.your-domain/**`.

Detailed env tables: [`admin-dashboard-v2/docs/MASTER_TENANT.md`](admin-dashboard-v2/docs/MASTER_TENANT.md).

---

## 4. Manual E2E — template publish (`master`)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `https://master.<domain>/ycode`, make a visible change (e.g. text), **Publish** | Publish succeeds in UI. |
| 2 | Inspect network response for `POST .../ycode/api/publish` | JSON success. |

---

## 5. Manual E2E — new tenant provisioning + invite

| Step | Action | Expected |
|------|--------|----------|
| 1 | Submit provision form with **unique** slug and **real** inbox email | HTTP 200 / success; response includes `tenantId`, `slug`, `warnings` array. |
| 2 | Supabase → `tenant_registry` | Row exists, `status: active`, fields match form. |
| 3 | `https://<slug>.<domain>` | Site loads; pages resemble template + seeded CMS fields. |
| 4 | Email inbox | Invite email received (if SMTP configured). |
| 5 | Click invite link → set password → land on builder | Session works on `https://<slug>.<domain>/ycode`. |
| 6 | If invite failed | `warnings` contains `User invite: ...`; tenant may still be `active` — retry invite via Supabase Dashboard or script. |

**Negative checks:**

- Duplicate email (existing tenant) → validation error before insert.
- Duplicate slug → clear error message.

---

## 6. Manual E2E — builder on `master` (template author)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in as template builder (e.g. `master@...`) on `master.*` | Editor loads for template tenant. |
| 2 | Publish | Same as section 4 — publish succeeds. |

---

## 7. Regression matrix (after changes to these areas)

Run **section 2** always. Add **section 4** if you touched: `publish/route.ts`, env docs.

Add **section 5** if you touched: `provision-pipeline.ts`, `ycode-template-clone.ts`, `ycode-cms-seed.ts`, `provision-email-policy.ts`, invite step.

---

## 8. Failure triage

| Symptom | Likely cause |
|---------|--------------|
| `PROVISIONING_WEBHOOK_SECRET missing or too short` | Secret unset or &lt; 16 chars on YCode or admin. |
| Auto-publish warnings in provision response | Secret mismatch; or tenant URL not reachable yet (DNS/TLS). |
| Invite not received | SMTP not configured; or email in spam; check Supabase Auth logs. |
| Wrong site data on subdomain | Proxy cache (60s); wrong `tenant_registry` slug; `TENANT_DOMAIN_SUFFIX` mismatch. |

---

## 9. CI recommendation

Add a workflow that runs:

```yaml
- working-directory: admin-dashboard-v2
  run: |
    npm ci
    npx tsc --noEmit
    npm test
- working-directory: ycode-masjidweb
  run: |
    npm ci
    npx tsc --noEmit
    npm test
```

Secrets are **not** required for unit tests. Staging E2E (Playwright + test Supabase) can be a later phase.
