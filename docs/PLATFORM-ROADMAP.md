# MasjidWeb Platform Roadmap — Payload Hub & Headless Ops

## Executive summary

MasjidWeb already has the bones of a serious platform: **Astro admin-dashboard-v2** at `admin.masjidweb.com` handles the hardest operational work today—multi-phase tenant provisioning, magic-link generation, core YCode updates with rollback, orphan cleanup, provisioning/isolation logs, and AI-assisted merge repair. **Payload (`manage.masjidweb.com`)** hosts a unified admin surface with charity CRM collections (organisations, donors, donations, campaigns, volunteers, events) and an ops console that mirrors Astro. **YCode on `ycode-mw-tenant`** delivers a full visual builder, CMS, forms, localization, and role-based team management per tenant subdomain. **Supabase** is the correct system of record for tenant data, auth, and builder content, with tenant isolation enforced through subdomain routing, JWT metadata, RLS, and service-role scoping.

The main strategic problem is **surface fragmentation and wrong primary UI**, not missing infrastructure. Today masjid admins land directly in the YCode builder on `{slug}.masjidweb.com/ycode` with no portal home; platform staff split time between Astro and Payload ops console; and charity CRM data lives in Payload without a tenant-facing workflow. Recent incidents (June 2026 core-update RBAC regression, Payload SSL/readiness false positives) show the platform is operationally capable but **fragile at seams**—auth, tenant scoping, and health checks must be treated as product features, not afterthoughts.

The recommended direction: **`manage.masjidweb.com` (Payload) becomes the unified home for platform admin UI and all tenant user portals**; **`admin.masjidweb.com` (Astro) becomes headless backend/services only**—provisioning APIs, deploy hooks, core updates, magic-link generation, audit—not the primary UI long-term; **YCode + Supabase unchanged** for public sites (`{slug}.masjidweb.com/`) and the visual builder (`{slug}.masjidweb.com/ycode`); **tenant portal sessions live on `manage.masjidweb.com`**, with magic links bridging into the builder on the tenant subdomain when needed.

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

**Gaps (relative to headless-ops target)**

- UI will migrate to Payload; Astro should expose stable APIs for all ops actions
- No **organisation/customer CRM** view at platform level (Payload has schema; not unified UX)
- No **billing/subscription** management (Stripe, plans, usage)
- No **support** queue (tickets, impersonation audit, SLA)
- No **health dashboard** API consumed by Payload
- Limited **search/filter** on tenant table at scale
- No **role-based platform team** (single shared login model)

**Maturity verdict:** **Strong for infra ops APIs (B+)**; **UI is transitional—Payload becomes primary (see roadmap)**.

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

- They land in **YCode builder on tenant subdomain**, not a portal on `manage.masjidweb.com`.
- `/ycode/welcome` is **YCode self-host setup**, not masjid onboarding.
- No guided “launch checklist” (connect domain, edit homepage, publish, invite team).
- No tenant-facing **donors/campaigns/volunteers/events** modules in a unified portal—only whatever CMS collections exist in the cloned template.
- No **billing self-service** or **support** entry point.

**Gaps (relative to Payload portal target)**

- No **tenant portal home on `manage.masjidweb.com`**
- Builder remains on subdomain (correct long-term); portal must link via magic link
- No **charity operations** UI wired to Payload CRM collections
- Onboarding is **email invite → accept-invite on subdomain → builder** with no progressive disclosure on manage

**Maturity verdict:** **Excellent website builder (A)**; **immature tenant ops portal (D+)**—Payload hub is the fix.

---

### Payload role (`masjidweb-manage-payload`)

**Strategic role (target—not retire)**

| Surface | Purpose |
|---------|---------|
| **Platform admin UI** | Tenant/org overview, onboarding pipeline, health, support queue, billing (future)—replacing Astro dashboard as primary staff UI |
| **Tenant user portal** | All tenant admins land here: checklist, charity ops (donors, campaigns, volunteers, events), team summary, “Open website builder” |
| **Charity CRM** | `organisations`, `donors`, `donations`, `campaigns`, `volunteers`, `events` — tenant-scoped, integrated with portal |
| **Marketing (optional)** | `marketing_pages`, `posts`, `media` for MasjidWeb.com or tenant-adjacent content |
| **Audit** | `audit_events` — platform and tenant actions |

**What exists today**

| Payload capability | Verdict |
|--------------------|---------|
| Ops console (`/ops-console`, `/ops/*`) | **Transitional** — mirrors Astro; APIs move to Astro headless; UI consolidates into Payload admin |
| Tenant registry mirror (`tenants` collection) | **Evolve** — align with `tenant_registry` in Supabase; Payload is presentation layer |
| Charity CRM schema | **Keep and productize** — becomes tenant portal modules |
| MasjidWeb marketing site CMS | **Optional** — evaluate vs YCode for masjidweb.com |
| Oracle + Railway hosting | **Keep** — primary UI host; fix readiness (DB ping) per incident lessons |

**Cost posture:** Oracle Always Free + Coolify ≈ $0; Railway cold standby ≈ $0 until failover. Payload is the **right long-term UI host**—invest in it, don’t retire it.

---

### Infrastructure

| Layer | Role | Notes |
|-------|------|-------|
| **Supabase** | Pooled Postgres, Auth, Storage, RLS | Single project; `tenant_id` + JWT metadata; service-role paths need explicit scoping |
| **Netlify** | `admin.masjidweb.com` (Astro APIs + transitional UI), `{slug}.masjidweb.com` (YCode) | Node 20+; clean builds; domain aliases per tenant |
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

### Platform admin (Payload on `manage.masjidweb.com`)

**Personas**

| Persona | Jobs to be done |
|---------|-----------------|
| **Platform owner** | Provision tenants, approve core updates, recover from incidents |
| **Support engineer** | Find tenant, resend login link, continue failed provision, check isolation logs |
| **Success / onboarding** | Track org onboarding, launch dates, checklist completion |
| **Finance (future)** | Plans, invoices, churn, usage |

**North-star UX**

> Open `manage.masjidweb.com` as platform staff and answer in 30 seconds: *Are we healthy? Who needs help? What's blocked?*

One sidebar (platform role): **Overview → Tenants → Organisations → Operations → Logs → Settings**.
Traffic-light health at top (fed by Astro API readiness). Tenant row opens a **360° drawer** (registry, provision timeline, links, last isolation check, notes).
Heavy ops (provision phase 2, core update apply) call **`admin.masjidweb.com` APIs** from Payload UI—staff never need to bookmark Astro dashboard long-term.

---

### Tenant user portal (Payload on `manage.masjidweb.com`)

**Roles**

| Role | Primary surface | Capabilities |
|------|-----------------|--------------|
| **Tenant owner** | Portal on manage | Checklist, charity ops, team summary, magic link → builder |
| **Tenant admin** | Portal on manage | Same minus billing (future) |
| **Designer** | Portal + builder | Portal home; “Edit site” → magic link to `{slug}.masjidweb.com/ycode` |
| **Editor** | Portal + builder (content) | Limited portal; builder in content mode |
| **Member (future)** | Public/member area | Events signup, volunteer profile—not builder |

**Onboarding journey (target)**

```text
Platform provisions tenant (Astro API)
  → Email: "Your portal is ready" → manage.masjidweb.com/login
  → Tenant session on manage.masjidweb.com (portal home)
  → Checklist: review org profile, invite team, open builder, publish
  → "Open website builder" → magic link → {slug}.masjidweb.com/ycode/accept-invite (if needed) → builder
  → Public site live at {slug}.masjidweb.com/
```

**Key principle:** Tenant **portal and charity ops** live on **`manage.masjidweb.com`**. Tenant **public site and visual builder** stay on **`{slug}.masjidweb.com`**. One login domain for day-to-day admin work; subdomain only for builder session and public SSR.

---

## Recommended architecture (what lives where)

| Feature | Payload UI (`manage`) | Astro APIs (`admin`) | YCode (`{slug}`) | Supabase |
|---------|:---------------------:|:--------------------:|:----------------:|:--------:|
| Platform admin UI (tenants, orgs, health) | ✅ primary | APIs only | — | ✅ registry + audit |
| Tenant user portal (home, checklist, charity ops) | ✅ primary | — | magic link only | ✅ tenant-scoped |
| Tenant provisioning & lifecycle | ✅ trigger UI | ✅ execute pipeline | — | ✅ |
| Magic links / invites | ✅ request from portal | ✅ generate | ✅ accept + session on subdomain | ✅ Auth |
| Core YCode updates & rollback | ✅ approve UI | ✅ execute | preview only | checkpoints |
| Orphan cleanup | ✅ trigger UI | ✅ execute | — | ✅ |
| Platform health dashboard | ✅ display | ✅ poll/readiness APIs | — | metrics tables |
| Organisation CRM (prospect→active) | ✅ | sync hooks | read-only summary | ✅ |
| Tenant onboarding checklist | ✅ execute | ✅ view/status API | deep-link target | ✅ |
| Website builder & publish | ✅ “Open builder” CTA | — | ✅ | ✅ builder tables |
| Public marketing site | — | — | ✅ | ✅ |
| CMS content (events, news, etc.) | ✅ charity modules | — | ✅ collections | ✅ |
| Form submissions | ✅ view in portal | — | ✅ | ✅ RLS |
| Donors / donations / campaigns | ✅ tenant portal | — | public bind optional | ✅ tenant-scoped |
| Volunteers / events | ✅ tenant portal | — | public bind optional | ✅ |
| Gift Aid / compliance | ✅ reports | — | export optional | ✅ |
| Billing & plans (future) | ✅ | webhooks API | self-service link | ✅ Stripe |
| Support tickets | ✅ | ✅ queue API | ✅ “Get help” | ✅ |
| Platform team auth | ✅ Payload users + roles | service auth | — | ✅ |
| MasjidWeb.com marketing CMS | ✅ optional | — | optional | ✅ |
| Disaster standby | ✅ Railway Payload | Netlify unaffected | unaffected | unaffected |

**Opinionated call:** Payload owns **all human-facing admin** (platform + tenant portal); Astro owns **headless ops execution**; YCode owns **visual builder + public sites**; Supabase owns **data**.

---

## Architecture diagram (text)

```text
                                    ┌─────────────────────────────────────┐
                                    │         manage.masjidweb.com         │
                                    │              (Payload)               │
                                    │  ┌──────────────┬──────────────────┐ │
                                    │  │ Platform     │ Tenant portal    │ │
                                    │  │ admin UI     │ (all tenants)    │ │
                                    │  │ (staff RBAC) │ (tenant RBAC)    │ │
                                    │  └──────┬───────┴────────┬─────────┘ │
                                    └─────────┼────────────────┼───────────┘
                                              │                │
                         REST / server actions│                │ magic link
                                              ▼                │ "Open builder"
                                    ┌─────────────────┐        │
                                    │ admin.masjidweb │        │
                                    │     (Astro)     │        │
                                    │  HEADLESS OPS   │        │
                                    │  provision      │        │
                                    │  deploy         │        │
                                    │  core updates   │        │
                                    │  magic-link gen │        │
                                    │  audit APIs     │        │
                                    └────────┬────────┘        │
                                             │                 │
                                             └────────┬────────┘
                                                      │
                              ┌───────────────────────┼───────────────────────┐
                              │                       ▼                       │
                              │              ┌─────────────────┐              │
                              │              │    Supabase     │              │
                              │              │  Auth + Postgres │              │
                              │              │  tenant_id + RLS │              │
                              │              └────────┬────────┘              │
                              │                       │                       │
                              ▼                       ▼                       ▼
                    ┌──────────────────┐    ┌──────────────────┐    (CRM, registry,
                    │ {slug}.masjidweb │    │ {slug}.masjidweb │     audit, checklist)
                    │      .com/       │    │   .com/ycode     │
                    │   PUBLIC SITE    │    │  VISUAL BUILDER  │
                    │     (YCode)      │    │     (YCode)      │
                    └──────────────────┘    └──────────────────┘
                         subdomain              subdomain
                         (tenant SSR)            (accept-invite +
                                                 builder session)
```

**Traffic summary**

| User | Lands on | Goes to builder via |
|------|----------|---------------------|
| Platform staff | `manage.masjidweb.com` (platform nav) | N/A (or impersonation magic link for support) |
| Tenant admin | `manage.masjidweb.com` (tenant portal) | Magic link → `{slug}.masjidweb.com/ycode` |
| Public visitor | `{slug}.masjidweb.com/` | N/A |
| Builder session | `{slug}.masjidweb.com/ycode` | Direct (after magic link or existing subdomain cookie) |

---

## Auth and routing implications

### Tenant session on `manage.masjidweb.com`

- **Primary tenant login** happens on Payload (`manage.masjidweb.com`), not on `{slug}.masjidweb.com`.
- Supabase Auth (or Payload auth bridged to Supabase) must carry **`tenant_id` in user metadata** aligned with the tenant the user belongs to—same isolation contract as today, different host.
- JWT/session cookies for manage use **`manage.masjidweb.com` cookie domain**—distinct from tenant subdomain cookies used by YCode builder.
- A user for tenant A must not access tenant B portal routes on manage even if they manipulate URLs; enforce server-side tenant scope on every Payload API/route (mirror `TENANCY.md` rules).
- **Cross-tenant ID access** must fail or return empty on manage, same as builder and public SSR.

### Magic link to tenant subdomain YCode builder

- Portal CTA **“Open website builder”** calls Astro **`tenant-auth-link` API** (or equivalent) to generate a link targeting **`https://{slug}.{TENANT_DOMAIN_SUFFIX}/ycode/accept-invite`** (or builder entry that flows through accept-invite when session missing).
- **Preserve the fragile accept-invite flow unchanged on the subdomain:**
  - Redirect targets `/ycode/accept-invite` on tenant subdomain
  - Hash tokens → POST `/ycode/api/auth/session` → SSR cookies on subdomain
  - `YCodeLayoutClient` excludes accept-invite from shared auth init until tokens handled
  - Cookie domain via `supabaseCookieOptionsForRequestHeaders()` when `TENANT_DOMAIN_SUFFIX` enabled
- **Two session domains by design:** manage session for portal/CRM; subdomain session for builder. Magic link is the bridge—not a shared cookie across domains.
- Initial provision invite may evolve: email can point to **manage portal first** (set password there), with separate builder magic link from portal—or keep subdomain accept-invite for bootstrap then redirect to manage; either path must regression-test all three Supabase link formats.

### Platform staff vs tenant RBAC on same domain

- **`manage.masjidweb.com` serves both audiences on one origin**—navigation and route access are **role-based**, not separate apps.
- **Platform roles** (owner, support, ops): see platform sidebar—Tenants, Organisations, Operations, Logs, Settings. No tenant charity data unless impersonating/support mode with audit.
- **Tenant roles** (owner, admin, designer, editor): see tenant portal nav—Home, Donors, Campaigns, Volunteers, Events, Team, “Open builder”. Never see platform provisioning or core update UI.
- **Implementation sketch:** Payload access control + `user_type` / `platform_role` vs `tenant_role` in JWT; route groups `/admin/*` vs `/portal/*` (exact paths TBD); shared login page with post-auth redirect based on role resolution.
- **Support impersonation (future):** platform staff generates time-bound magic link or “view as tenant” with **`audit_events`** entry—never silent cross-tenant access.

### What does not change

- Public site routing: **`{slug}.masjidweb.com/`** → YCode SSR, subdomain → tenant_registry.
- Builder isolation: all builder tables filtered by **`tenant_id`** from subdomain context.
- Provisioning pipeline: still **2-phase idempotent** via Astro APIs; Payload triggers, Astro executes.
- Service-role scoping: explicit **`tenant_id` filters** everywhere Knex/service-role touches data.

---

## Phased roadmap (6–12 months)

### Phase 0: Stabilize (weeks 1–4) — **Priority: P0**

| Deliverable | Effort | Notes |
|-------------|--------|-------|
| Verify Payload + Astro readiness endpoints do real DB `SELECT 1` everywhere | S | Post Jun-2026 incident |
| Quarterly Railway failover drill documented + executed | S | Already documented in `FAILOVER-RAILWAY.md` |
| Run full `MT_VALIDATION_CHECKLIST` on two live tenants after any auth/proxy change | S | Manual but mandatory |
| UptimeRobot/Better Stack on admin APIs, manage, sample tenant | S | Free tier |
| Document Payload-first direction in this roadmap; align team | S | This doc |
| Ensure `DATABASE_SSL_REJECT_UNAUTHORIZED=false` on Oracle Coolify primary | S | Match Railway |

**Quick win:** Health strip on Payload platform overview (poll Astro readiness APIs).

---

### Phase 1: Payload portal hub + Astro API integration (months 1–3) — **P1**

| Deliverable | Effort |
|-------------|--------|
| **Extract Astro ops into stable JSON APIs** — provision status, tenant-auth-link, audit log, isolation log, core-update actions | M |
| **Payload platform overview** — health, tenant counts, failed/provisioning alerts (consumes admin APIs) | M |
| **Payload tenant portal shell** — login, role-based nav, placeholder home/checklist | M |
| **“Open website builder”** — portal button → Astro magic-link API → subdomain YCode | M |
| **Organisation entity** aligned across Supabase + Payload collections | M |
| **Tenant 360 view in Payload** — provision timeline from `provisioning_audit_log`, quick actions | M |
| **Freeze new Astro dashboard features** — bugfix + API only; UI investment moves to Payload | S |
| **Auth spike** — tenant session on manage + platform staff RBAC on same domain | L |

**Strategic bet:** Payload becomes the only UI masjid admins and platform staff open daily; Astro becomes invisible infrastructure.

---

### Phase 2: Tenant onboarding & portal home (months 2–5) — **P1**

| Deliverable | Effort |
|-------------|--------|
| **Portal Home checklist** on manage — driven by Supabase/`tenant_registry` | M |
| Post-provision email points to **manage.masjidweb.com** portal (not straight to builder) | M |
| Checklist items deep-link: org profile, invite team, magic link to builder, publish confirmation | M |
| Owner bootstrap validation when first login is on manage (coordinate with `bootstrap-tenant-owner`) | M |
| **“Help & support”** panel on portal | S |
| Role-aware nav labels on manage (“Manage team” vs “Open builder”) | S |
| Regression suite: manage login → magic link → accept-invite → builder session | M |

**Quick win:** Post-provision email copy + portal URL + checklist.

---

### Phase 3: Charity operations in tenant portal (months 4–8) — **P2**

| Deliverable | Effort |
|-------------|--------|
| Productize Payload CRM collections with strict **tenant_id** scoping + RLS in Supabase where mirrored | L |
| Portal modules: Donors, Campaigns, Volunteers, Events (Payload admin UI, tenant-facing skin) | L |
| Bind public YCode collection pages to CRM tables OR sync to builder CMS | M |
| Stripe Connect or per-tenant donation links (start manual/bank transfer) | M |
| Gift Aid export (CSV) for UK charities | M |
| Sync/consolidate any legacy Payload rows with Supabase source of truth | M |

**Strategic bet:** Charity ops live on **manage portal**, not a third UI or raw Payload ops console.

---

### Phase 4: Business platform & Astro UI sunset (months 6–12) — **P3**

| Deliverable | Effort |
|-------------|--------|
| Billing: plans, Stripe customer portal, feature flags per tenant | L |
| Support tickets (Payload UI + Astro queue API) | M |
| Usage metrics (storage, bandwidth, seats) | M |
| **Retire Astro dashboard UI** — keep Netlify deploy for API routes only; redirect `/dashboard` → manage | M |
| Optional: member portal (volunteer login) on public routes | L |
| Platform team RBAC hardening on Payload | M |

---

### Quick wins vs strategic bets

| Quick wins (≤2 weeks each) | Strategic bets (multi-month) |
|----------------------------|------------------------------|
| Health checks on Payload via Astro APIs | Payload as unified admin + tenant portal |
| Astro API extraction (tenant-auth-link, audit) | Tenant session on manage.masjidweb.com |
| Portal shell + “Open builder” magic link | Full charity CRM in tenant portal |
| Post-provision email → manage portal URL | Astro dashboard UI retirement |
| Uptime monitoring | Billing + support queue |

---

## UX principles for both surfaces

**Platform admin (Payload on manage)**

1. **Ops-first, not dev-first** — plain language, traffic lights, confirm destructive actions.
2. **One action per anxiety** — “Continue setup” not “run phase 2 RPC” (Astro executes; Payload asks).
3. **Audit everything** — who provisioned, who rolled back, who sent login link.
4. **Never hide fragile state** — show provisioning checkpoint, last publish error.
5. **Mobile-tolerant** — support on-call from phone (read-only minimum).

**Tenant portal (Payload on manage)**

1. **Portal before builder** — checklist and charity ops on manage; builder is a deliberate deep dive.
2. **Role-aware UI** — editors see content tasks, not platform settings.
3. **`manage.masjidweb.com` is tenant home** — builder is `{slug}.masjidweb.com/ycode` via magic link.
4. **Publish is the milestone** — celebrate first publish (detect via Supabase/YCode API).
5. **Charity language** — “Donors”, “Jumuah times”, “Campaigns”—not “collections” and “layers.”
6. **Help is one click** — never leave tenant stranded after login failure.

**YCode builder (subdomain—unchanged UX principles)**

1. **Subdomain session for builder only** — accept-invite and cookie rules unchanged.
2. **Role-aware builder chrome** — existing YCode RBAC.
3. **Return to portal** link back to manage (future).

---

## Technical guardrails (tenant isolation, fragile flows)

**Non-negotiables (from `TENANCY.md`, architecture rules, incident playbook)**

1. **Subdomain → `tenant_registry` → `x-tenant-id`** is primary selector for YCode/public; **manage routes** must resolve tenant from authenticated user metadata, never from URL alone.
2. **Service-role code** always uses `scopeToTenantRow` / explicit `tenant_id` filters.
3. **Never remove tenant scoping** to fix a bug—build compatibility bridges.
4. **Provisioning stays 2-phase idempotent** — checkpoints `clone_complete`, `cms_seed_complete`; Astro APIs execute.
5. **Magic links to builder** always target tenant subdomain `/ycode/accept-invite`; session via `/ycode/api/auth/session`.
6. **`YCodeLayoutClient`** excludes accept-invite from shared auth init until tokens handled.
7. **Cookie domain** — manage cookies on `manage.masjidweb.com`; builder cookies on tenant subdomain via `supabaseCookieOptionsForRequestHeaders()` when enabled.
8. **Upstream merges** require seam review + `bootstrap-tenant-owner` tests + MT checklist.
9. **CRM / portal tables** must have RLS from day one—charity data is PII.
10. **Readiness endpoints** must fail if DB unreachable.

**Before any PR touching auth, proxy, provision, Payload portal, or repositories:**

- Read fragile-flow files listed in `.cursor/rules/masjidweb-app-architecture-and-fragile-flows.mdc`
- Run `bash ycode-mw-tenant/scripts/check-tenant-isolation.sh`
- Run two-tenant manual checklist from `MT_VALIDATION_CHECKLIST.md`
- Test manage portal → magic link → accept-invite → builder on two tenants

---

## Metrics / success criteria

**Platform admin (Payload)**

| Metric | Target (12 mo) |
|--------|----------------|
| Mean time to provision (active tenant) | < 15 min p95 |
| Failed provision rate | < 2% |
| Core update rollback events | 0 unplanned/month |
| Isolation daily check | 100% green |
| Support: time to login link | < 2 min |
| Astro dashboard UI usage | 0 (API-only) |

**Tenant portal (Payload on manage)**

| Metric | Target |
|--------|--------|
| Login lands on manage portal (not raw builder) | 100% new tenants |
| Invite → first publish | < 7 days median |
| Portal → builder magic link success | > 95% |
| Owner bootstrap success | 100% on provisioned tenants |
| Monthly active tenant admins on manage | track + grow |

**Business (when billing lands)**

| Metric | Target |
|--------|--------|
| Trial → paid conversion | define per GTM |
| Churn | < 5% annual |

---

## Risks and dependencies

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dual auth domains (manage vs subdomain) confuses users | Medium | Clear “Open builder” UX; docs; session bridge via magic link only |
| Upstream YCode merge breaks RBAC/collections | High | Seam checklist, safe-update workflow |
| Magic-link regressions on subdomain | High | Automated + manual invite tests; never change redirect URLs without tests |
| Platform vs tenant RBAC leak on same domain | High | Separate route groups; server-side role checks; audit impersonation |
| Payload/Supabase schema drift | Medium | Single source of truth in Supabase; Payload as UI layer |
| Oracle VM failure | Medium for portal UI | Railway failover; YCode/public on Netlify unaffected |
| Scope creep on portal | Medium | Phase 1 shell first; CRM modules incremental |
| Team capacity | High | Phase 0–1 before Phase 3 CRM |

**Dependencies:** Supabase migrations; Astro API stability; Payload deploy on Oracle/Railway; Netlify env parity; GitHub Actions secrets; tenant template quality; email deliverability for invites to manage.

---

## Immediate next 2-week sprint (Phase 1 aligned)

1. **Astro API audit** — document and stabilize JSON endpoints needed by Payload: `tenant-auth-link`, `provision` status, `audit-log`, readiness. Add CORS/service auth for `manage.masjidweb.com` if needed. *(M)*
2. **Payload platform health strip (MVP)** — overview widget calling `admin.masjidweb.com` readiness + sample tenant check. *(S)*
3. **Payload tenant portal shell** — authenticated layout with role placeholder, “Home” and “Open website builder” stub. *(M)*
4. **Wire “Open builder”** — portal button calls Astro `tenant-auth-link` API; open returned URL; verify accept-invite → `/ycode` on subdomain. *(M)*
5. **Auth spike doc** — tenant login on manage: Supabase vs Payload auth, `tenant_id` in JWT, route split `/admin/*` vs `/portal/*`. *(S)*
6. **Execute two-tenant MT validation** — add path: manage portal (when shell exists) → magic link → builder; paste results into tracking doc. *(S)*
7. **Align provision email copy (design)** — target URL `manage.masjidweb.com` for portal; builder via in-portal CTA. *(S)*

---

## Appendix: Target navigation map

**Payload — platform staff (`manage.masjidweb.com/admin/...`)**

`Overview | Tenants | Organisations | Operations | Logs | Settings`

**Payload — tenant portal (`manage.masjidweb.com/portal/...`)**

`Home | Donors | Campaigns | Volunteers | Events | Team | Help` + **Open website builder** (magic link)

**Astro — headless (`admin.masjidweb.com`)**

API routes only (long-term): `provision*`, `tenants`, `tenant-auth-link`, `audit-log`, `isolation-check-log`, `updates/*`, `cleanup-*`, `readiness`
Transitional UI: existing `/dashboard` until Phase 4 redirect

**YCode builder (`{slug}.masjidweb.com/ycode`)**

Unchanged: Pages/Layers | CMS | Forms | Localization | Integrations | Profile | Settings

**YCode settings nav** (`lib/settings-nav-items.ts`)

`General | Users | Redirects | Email | Templates` (+ `Updates` for template tenants only)

---

*Stack assumptions: Payload on manage.masjidweb.com for all admin UI (platform + tenant portal); Astro on admin.masjidweb.com for headless ops APIs; YCode on tenant subdomains for public sites and visual builder; Supabase for data; Netlify for Astro + YCode; Oracle/Railway for Payload.*
