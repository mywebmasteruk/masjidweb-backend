# MasjidWeb Platform Roadmap — Control Centre & Tenant Portal

## Executive summary

MasjidWeb already has the bones of a serious platform: **Astro admin-dashboard-v2** at `admin.masjidweb.com` handles the hardest operational work—multi-phase tenant provisioning, magic-link auth, core YCode updates with rollback, orphan cleanup, provisioning/isolation logs, and AI-assisted merge repair. **YCode on `ycode-mw-tenant`** delivers a full visual builder, CMS, forms, localization, and role-based team management per tenant subdomain. **Supabase** is the correct system of record for tenant data, auth, and builder content, with tenant isolation enforced through subdomain routing, JWT metadata, RLS, and service-role scoping.

The main strategic problem is **surface fragmentation and duplication**, not missing infrastructure. **Payload (`manage.masjidweb.com`)** still hosts an ops console that mirrors Astro (tenants, provision status, auth links, core updates, cleanup, audit log) while also defining charity CRM collections (organisations, donors, donations, campaigns, volunteers, events) that are **not integrated** into tenant admin workflows or public sites. Recent incidents (June 2026 core-update RBAC regression, Payload SSL/readiness false positives) show the platform is operationally capable but **fragile at seams**—auth, tenant scoping, and health checks must be treated as product features, not afterthoughts.

The recommended direction: **one platform control centre (Astro)**, **one tenant experience hub (YCode builder + a thin “portal home”)**, **Supabase as unified data plane**, and **honest retirement of Payload ops** while migrating CRM either into Supabase tenant tables or a dedicated tenant-facing module—not a third admin UI masjids never open.

---

## Current state assessment

### Platform admin (`masjidweb-backend/admin-dashboard-v2`)

**What exists (mature)**

| Area | Implementation | Maturity |
|------|----------------|----------|
| **Tenant registry CRUD** | `/dashboard` — list clients/templates, stats, provision form, row actions | **Production-ready** |
| **Provisioning** | 2-phase pipeline (`provision-pipeline.ts`): registry → Netlify alias → clone → CMS seed → publish → invite; checkpointed via `provisioning_audit_log` | **Production-ready**, battle-tested |
| **Tenant actions** | Open builder (magic link), copy login link, continue setup, edit, deactivate/reactivate, delete | **Production-ready** |
| **Core updates** | `/dashboard/maintenance` — safe update wizard, preview, approve, rollback, full rollback, AI repair hooks | **Production-ready** (high complexity) |
| **Maintenance** | Orphan DB cleanup, orphan Netlify subdomain cleanup | **Production-ready** |
| **Logs** | Provisioning audit + daily isolation check history | **Good** |
| **AI settings** | OpenRouter config for blocked safe-update repair | **Good** |
| **Auth** | Platform session cookie; host allowlist middleware | **Adequate** |
| **Deploy** | GitHub Actions → Netlify only | **Correct pattern** |

**Routes today**

- `/dashboard` — Tenants
- `/dashboard/logs` — Provisioning + isolation checks
- `/dashboard/maintenance` — Core update + recovery + cleanup
- `/dashboard/settings/ai` — AI provider
- `/dashboard/updates` — redirects to maintenance (legacy)
- APIs: `provision*`, `tenants`, `tenant-auth-link`, `audit-log`, `isolation-check-log`, `updates/*`, `cleanup-*`, `reseed-cms`, `auth/*`

**Gaps**

- No **organisation/customer CRM** view (prospect → onboarding → active) at platform level
- No **billing/subscription** management (Stripe, plans, usage)
- No **support** queue (tickets, impersonation audit, SLA)
- No **health dashboard** (synthetic checks for admin, manage, sample tenants)
- No **onboarding pipeline UI** beyond tenant status badges
- No **template management UI** (“New demo” still requires Supabase manual step)
- Limited **search/filter** on tenant table at scale
- No **role-based platform team** (single shared login model)
- Payload ops console still exists as confusing alternate entry point

**Maturity verdict:** **Strong for infra ops (B+)**; **weak for business ops (D)**.

---

### Tenant portal (`ycode-mw-tenant`)

**What exists (mature)**

| Area | Implementation | Maturity |
|------|----------------|----------|
| **Visual builder** | Pages, layers, components, publish | **Production-ready** |
| **CMS** | Collections, items, seeded from template on provision | **Production-ready** |
| **Public site** | `{slug}.masjidweb.com/` SSR with tenant isolation | **Production-ready** |
| **Team & roles** | `owner > admin > designer > editor`; Settings → Users; invite flow | **Production-ready** (fragile) |
| **Settings** | General, Users, Redirects, Email, Templates | **Good** |
| **Forms** | Builder forms + `form_submissions` with tenant RLS | **Good** |
| **Localization** | Locales/translations | **Good** |
| **Integrations** | Apps/oauth/MCP | **Moderate** (upstream-sensitive) |
| **Auth entry** | `/ycode/accept-invite`, session route, cookie domain handling | **Production-ready** (fragile) |

**Roles (from `lib/roles.ts`)**

- **Owner / Admin** — manage members, settings, structure
- **Designer** — edit site structure (not settings)
- **Editor** — content-only; restricted sidebar

**Provisioning bootstrap:** `bootstrap-tenant-owner.ts` promotes first active tenant user to `owner` when no owner/admin exists—critical after upstream RBAC changes.

**What masjid admins actually get today**

- They land in **YCode builder**, not a “portal.”
- `/ycode/welcome` is **YCode self-host setup**, not masjid onboarding.
- No guided “launch checklist” (connect domain, edit homepage, publish, invite team).
- No tenant-facing **donors/campaigns/volunteers/events** modules—only whatever CMS collections exist in the cloned template.
- No **billing self-service** or **support** entry point.

**Gaps**

- No **tenant portal home** (“what to do next”)
- No **charity operations** UI (CRM, Gift Aid, campaigns)
- No **member-facing** area (volunteer portal, donor portal)—only public marketing pages
- Onboarding is **email invite → accept-invite → builder** with no progressive disclosure
- Template/demo distinction is invisible to client admins
- `masjidweb-website` is a generic YCode README sibling—not an active MasjidWeb product surface

**Maturity verdict:** **Excellent website builder (A)**; **immature tenant ops portal (D+)**.

---

### Payload role (`masjidweb-manage-payload`)

**Unique value (keep conceptually)**

| Collection group | Purpose |
|------------------|---------|
| **Clients** | `organisations`, `tenants` (with onboarding fields), links to YCode refs |
| **Charity CRM** | `donors`, `donations`, `campaigns`, `volunteers`, `events` |
| **Marketing** | `marketing_pages`, `posts`, `media` |
| **Audit** | `audit_events` |

**Duplicates Astro admin (retire ops)**

Payload `/ops-console` + `/ops/*` routes mirror Astro:

- Tenant list (reads `tenant_registry` via Supabase REST fallback)
- Provision status, tenant auth links
- Core update sync/apply/rollback/PRs/deploys
- Cleanup orphans, audit log

**Honest assessment**

| Payload capability | Verdict |
|--------------------|---------|
| Platform ops console | **Retire** — Astro is canonical, Netlify-deployed, better maintained |
| Tenant registry mirror (`tenants` collection) | **Retire** — `tenant_registry` in Supabase is source of truth |
| Charity CRM schema | **Keep data model ideas, migrate implementation** — not wired to tenants or public sites today |
| MasjidWeb marketing site CMS | **Optional** — only if `manage.masjidweb.com` public pages are actively used; overlaps YCode for tenant marketing |
| Oracle + Railway hosting | **Keep until CRM migration done**, then evaluate full retirement |

**Cost posture:** Oracle Always Free + Coolify ≈ $0; Railway cold standby ≈ $0 until failover. Payload is not expensive—it is **cognitively expensive** (two admin UIs, dual schema, readiness incidents).

---

### Infrastructure

| Layer | Role | Notes |
|-------|------|-------|
| **Supabase** | Pooled Postgres, Auth, Storage, RLS | Single project; `tenant_id` + JWT metadata; service-role paths need explicit scoping |
| **Netlify** | `admin.masjidweb.com` (Astro), `{slug}.masjidweb.com` (YCode) | Node 20+; clean builds; domain aliases per tenant |
| **Oracle + Coolify** | Payload primary (`manage.masjidweb.com`) | Jun 2026 outage: SSL cert chain; readiness lied until DB ping added |
| **Railway** | Payload cold standby | Project configured; deploy only on disaster; 10–20 min RTO |
| **GitHub Actions** | Admin deploy, safe YCode updates, daily isolation check | Strong automation culture |

**Incident lessons to bake into roadmap**

1. **Readiness must prove DB connectivity**, not env presence (`FAILOVER-RAILWAY.md` incident).
2. **Upstream YCode merges break MasjidWeb seams** (RBAC, collections, OAuth allowlists)—require seam checklist + MT validation.
3. **Magic-link / invite flow is fragile**—any auth change needs regression tests on accept-invite, session cookies, subdomain alignment.
4. **Only one Payload writer** at a time (Oracle XOR Railway).
5. **Daily isolation tests catch unit regressions**, not live cross-tenant HTTP—deploy checklist still required.

---

## Vision

### Platform admin control centre

**Personas**

| Persona | Jobs to be done |
|---------|-----------------|
| **Platform owner** | Provision tenants, approve core updates, recover from incidents |
| **Support engineer** | Find tenant, resend login link, continue failed provision, check isolation logs |
| **Success / onboarding** | Track org onboarding, launch dates, checklist completion |
| **Finance (future)** | Plans, invoices, churn, usage |

**North-star UX**

> Open `admin.masjidweb.com` and answer in 30 seconds: *Are we healthy? Who needs help? What’s blocked?*

One sidebar: **Overview → Tenants → Organisations → Operations → Logs → Settings**.
Traffic-light health at top. Tenant row opens a **360° drawer** (registry, provision timeline, links, last isolation check, notes).
No second ops UI on Payload.

---

### Multi-tenant portal

**Roles**

| Role | Primary surface | Capabilities |
|------|-----------------|--------------|
| **Tenant owner** | Portal home + builder | Everything including billing (future), team, publish |
| **Tenant admin** | Portal home + builder | Team, settings, publish |
| **Designer** | Builder | Site structure + CMS |
| **Editor** | Builder (content mode) | CMS/pages only |
| **Member (future)** | Public/member area | Events signup, volunteer profile—not builder |

**Onboarding journey (target)**

```text
Platform provisions tenant
  → Email: "Your site is ready"
  → accept-invite / set password
  → Portal Home (checklist: review homepage, update contact, publish, invite team)
  → Deep-link into builder tasks
  → "You're live" celebration + link to public site
```

Portal Home lives at `{slug}.masjidweb.com/ycode/home` (or `/portal`)—**not** a separate app initially.

---

## Recommended architecture (what lives where)

| Feature | Astro admin | YCode builder/portal | Supabase | Retire Payload ops |
|---------|:-----------:|:--------------------:|:--------:|:------------------:|
| Tenant provisioning & lifecycle | ✅ | — | ✅ registry + audit | ✅ |
| Magic links / invites | ✅ generate | ✅ accept + session | ✅ Auth | — |
| Core YCode updates & rollback | ✅ | preview only | checkpoints | ✅ |
| Orphan cleanup | ✅ | — | ✅ | ✅ |
| Platform health dashboard | ✅ | — | metrics tables | — |
| Organisation CRM (prospect→active) | ✅ | read-only summary | ✅ new `organisations` | migrate off Payload |
| Tenant onboarding checklist | ✅ view | ✅ execute | ✅ | fields migrate |
| Website builder & publish | — | ✅ | ✅ builder tables | — |
| Public marketing site | — | ✅ | ✅ | Payload marketing optional |
| CMS content (events, news, etc.) | — | ✅ collections | ✅ | Payload events if duplicated |
| Form submissions | — | ✅ | ✅ RLS | — |
| Donors / donations / campaigns | — | ✅ tenant module | ✅ tenant-scoped | ✅ Payload CRM |
| Volunteers | — | ✅ tenant module | ✅ | ✅ |
| Gift Aid / compliance | — | ✅ reports | ✅ | ✅ |
| Billing & plans | ✅ | ✅ self-service | ✅ Stripe webhooks | — |
| Support tickets | ✅ | ✅ “Get help” | ✅ | — |
| Platform team auth | ✅ | — | ✅ | Payload users for ops only until retired |
| MasjidWeb.com marketing CMS | — | optional | ✅ | keep Payload OR move to Astro content |
| Disaster standby | — | — | — | Railway Payload until retired |

**Opinionated call:** Astro owns **platform**; YCode owns **tenant product**; Supabase owns **data**; Payload **ops retires in Q1–Q2**, CRM **migrates or dies on the vine**.

---

## Phased roadmap (6–12 months)

### Phase 0: Stabilize (weeks 1–4) — **Priority: P0**

| Deliverable | Effort | Notes |
|-------------|--------|-------|
| Verify Payload + Astro readiness endpoints do real DB `SELECT 1` everywhere | S | Post Jun-2026 incident |
| Quarterly Railway failover drill documented + executed | S | Already documented in `FAILOVER-RAILWAY.md` |
| Run full `MT_VALIDATION_CHECKLIST` on two live tenants after any auth/proxy change | S | Manual but mandatory |
| UptimeRobot/Better Stack on admin, sample tenant, manage readiness | S | Free tier |
| Document “Payload ops deprecated—use admin” banner on `/ops-console` | S | Stop dual operations |
| Ensure `DATABASE_SSL_REJECT_UNAUTHORIZED=false` on Oracle Coolify primary | S | Match Railway |

**Quick win:** Health strip on Astro dashboard (3 URLs, last check time).

---

### Phase 1: Consolidate platform control centre (months 1–3) — **P1**

| Deliverable | Effort |
|-------------|--------|
| **Overview dashboard** — health, tenant counts, failed/provisioning alerts | M |
| **Tenant 360 drawer** — provision timeline from `provisioning_audit_log`, quick actions | M |
| **Organisation entity** in Supabase linked to `tenant_registry` | M |
| **Search/filter** on tenant table | S |
| **Template management** — “Create demo template” flow (not raw Supabase) | M |
| **Freeze Payload ops** — read-only banner; no new features on `/ops-console` | S |
| **Platform audit log** unified view (provision + core update + admin actions) | M |

**Strategic bet:** Astro becomes the only place MasjidWeb staff work.

---

### Phase 2: Tenant portal home & onboarding (months 2–5) — **P1**

| Deliverable | Effort |
|-------------|--------|
| **Portal Home** route in YCode with checklist driven by Supabase/`tenant_registry` | M |
| Replace generic post-invite landing with checklist (not `/ycode/welcome`) | M |
| Contextual empty states in builder (“Edit your homepage”, “Publish”) | S |
| Owner bootstrap + invite regression suite in CI (already exists—keep green) | S |
| **“Help & support”** panel (mailto + future ticket ID) | S |
| Role-aware nav labels (“Manage team” vs “Edit pages”) | S |

**Quick win:** Post-provision email copy + checklist deep links.

---

### Phase 3: Charity operations in tenant product (months 4–8) — **P2**

| Deliverable | Effort |
|-------------|--------|
| Supabase schema: `donors`, `donations`, `campaigns`, `volunteers`, `events` with `tenant_id` + RLS | L |
| YCode **Operations** section: Donors, Campaigns, Volunteers, Events (simple CRUD UI) | L |
| Bind public collection pages to new tables OR migrate template CMS | M |
| Stripe Connect or per-tenant donation links (start manual/bank transfer) | M |
| Gift Aid export (CSV) for UK charities | M |
| Import script from Payload CRM tables if data exists | M |

**Strategic bet:** Tenant admins manage charity ops **inside their subdomain**, not Payload.

---

### Phase 4: Business platform (months 6–12) — **P3**

| Deliverable | Effort |
|-------------|--------|
| Billing: plans, Stripe customer portal, feature flags per tenant | L |
| Support tickets (Supabase + Astro queue) | M |
| Usage metrics (storage, bandwidth, seats) | M |
| Payload **retirement** — export CRM, shut Oracle primary, keep Railway doc only if needed | L |
| Optional: member portal (volunteer login) on public routes | L |

---

### Quick wins vs strategic bets

| Quick wins (≤2 weeks each) | Strategic bets (multi-month) |
|----------------------------|------------------------------|
| Health checks on Astro dashboard | Unified Supabase charity CRM |
| Deprecate Payload ops console | Tenant portal home + onboarding |
| Tenant 360 drawer | Stripe billing |
| Post-invite checklist links | Full Payload retirement |
| Uptime monitoring | Member/volunteer portal |

---

## UX principles for both surfaces

**Platform admin (Astro)**

1. **Ops-first, not dev-first** — plain language, traffic lights, confirm destructive actions.
2. **One action per anxiety** — “Continue setup” not “run phase 2 RPC.”
3. **Audit everything** — who provisioned, who rolled back, who sent login link.
4. **Never hide fragile state** — show provisioning checkpoint, last publish error.
5. **Mobile-tolerant** — support on-call from phone (read-only minimum).

**Tenant portal (YCode)**

1. **Progressive disclosure** — checklist before full builder chrome.
2. **Role-aware UI** — editors never see scary settings.
3. **Subdomain is home** — all links stay on `{slug}.masjidweb.com`.
4. **Publish is the milestone** — celebrate first publish.
5. **Charity language** — “Donors”, “Jumuah times”, “Campaigns”—not “collections” and “layers.”
6. **Help is one click** — never leave tenant stranded after invite failure.

---

## Technical guardrails (tenant isolation, fragile flows)

**Non-negotiables (from `TENANCY.md`, architecture rules, incident playbook)**

1. **Subdomain → `tenant_registry` → `x-tenant-id`** is primary selector; JWT `user_metadata.tenant_id` must align.
2. **Service-role code** always uses `scopeToTenantRow` / explicit `tenant_id` filters.
3. **Never remove tenant scoping** to fix a bug—build compatibility bridges.
4. **Provisioning stays 2-phase idempotent** — checkpoints `clone_complete`, `cms_seed_complete`.
5. **Magic links** always redirect to `/ycode/accept-invite` on tenant subdomain; session via `/ycode/api/auth/session`.
6. **`YCodeLayoutClient`** excludes accept-invite from shared auth init until tokens handled.
7. **Cookie domain** consistent via `supabaseCookieOptionsForRequestHeaders()` when `TENANT_DOMAIN_SUFFIX` enabled.
8. **Upstream merges** require `masjidweb-core-seams.md` review + `bootstrap-tenant-owner` tests + MT checklist.
9. **New CRM tables** must have RLS from day one—charity data is PII.
10. **Readiness endpoints** must fail if DB unreachable.

**Before any PR touching auth, proxy, provision, or repositories:**

- Read fragile-flow files listed in `.cursor/rules/masjidweb-app-architecture-and-fragile-flows.mdc`
- Run `bash ycode-mw-tenant/scripts/check-tenant-isolation.sh`
- Run two-tenant manual checklist from `MT_VALIDATION_CHECKLIST.md`

---

## Metrics / success criteria

**Platform admin**

| Metric | Target (12 mo) |
|--------|----------------|
| Mean time to provision (active tenant) | < 15 min p95 |
| Failed provision rate | < 2% |
| Core update rollback events | 0 unplanned/month |
| Isolation daily check | 100% green |
| Support: time to login link | < 2 min |
| Dual ops console usage | 0 (Payload ops retired) |

**Tenant portal**

| Metric | Target |
|--------|--------|
| Invite → first publish | < 7 days median |
| Invite completion rate | > 85% |
| Owner bootstrap success | 100% on provisioned tenants |
| Monthly active tenant admins | track + grow |
| Form submission response time | tenant-defined |

**Business (when billing lands)**

| Metric | Target |
|--------|--------|
| Trial → paid conversion | define per GTM |
| Churn | < 5% annual |

---

## Risks and dependencies

| Risk | Impact | Mitigation |
|------|--------|------------|
| Upstream YCode merge breaks RBAC/collections | High | Seam checklist, safe-update workflow, no direct main merges |
| Payload/Supabase schema drift during CRM migration | Medium | Single migration plan; read-only Payload; import scripts |
| Magic-link regressions | High | Automated + manual invite tests; don’t simplify redirect URLs |
| Oracle VM failure | Low for tenants | Railway failover; admin/YCode unaffected |
| Scope creep on portal (second product) | Medium | Portal Home in YCode first; separate app only if proven necessary |
| Gift Aid / legal compliance | Medium | Legal review before donation features; export-only MVP |
| $0 hosting limits (Oracle, Railway free) | Low | Monitor usage; Payload retirement reduces moving parts |
| Team capacity | High | Phase 0–1 before Phase 3 CRM |

**Dependencies:** Supabase migrations pipeline; Netlify env parity; GitHub Actions secrets; tenant template quality (`masjidemo1`); email deliverability for `@masjidweb.com` invites.

---

## Immediate next 2-week sprint (5–7 actionable items)

1. **Add platform health strip to Astro `/dashboard`** — poll readiness for admin, one tenant subdomain, and `manage.masjidweb.com/ops/readiness`; show green/amber/red. *(S)*
2. **Run and document quarterly Railway failover drill** — temporary deploy, verify `"database": { "ok": true }`, tear down. *(S)*
3. **Banner on Payload `/ops-console`**: “Deprecated — use admin.masjidweb.com/dashboard.” Link prominently. *(S)*
4. **Tenant 360 drawer (MVP)** on Astro dashboard — show last 5 `provisioning_audit_log` entries + status + quick “Copy login link”. *(M)*
5. **Design Portal Home checklist schema** — add `onboarding_checklist` JSON or columns on `tenant_registry`; no UI required yet. *(S)*
6. **Execute two-tenant MT validation** on production slugs; paste results into a tracking doc/PR template. *(S)*
7. **Audit Payload CRM row counts** — if empty, accelerate ops retirement; if populated, plan Supabase import. *(S)*

---

## Appendix: Current navigation map

**Astro admin sidebar**

`Tenants | Logs | Maintenance | Settings (AI)`

**YCode tenant settings** (`lib/settings-nav-items.ts`)

`General | Users | Redirects | Email | Templates` (+ `Updates` for template tenants only)

**YCode builder main areas**

Pages/Layers | CMS | Forms | Localization | Integrations | Profile | Settings

---

*Stack assumptions: Astro for platform ops, YCode for visual/tenant product, Supabase for data, Netlify for admin + tenants, Oracle/Railway only for Payload until CRM migration completes.*
