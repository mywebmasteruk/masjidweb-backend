# MasjidWeb Manage Portal — Review & Build Plan

**Host:** `manage.masjidweb.com` (Payload on Oracle/Coolify, Railway failover)  
**Headless ops:** `admin.masjidweb.com` (Astro APIs)  
**Builder & public sites:** `{slug}.masjidweb.com` (YCode + Supabase)  
**Last updated:** June 2026 — post Phase 1 review

Related docs: [PLATFORM-ROADMAP.md](./PLATFORM-ROADMAP.md), [PAYLOAD-API-CONTRACT.md](./PAYLOAD-API-CONTRACT.md), [AUTH-SPIKE-MANAGE-PORTAL.md](./AUTH-SPIKE-MANAGE-PORTAL.md), [TENANCY.md](./TENANCY.md)

---

## Executive summary

MasjidWeb's strategic bet is correct: **`manage.masjidweb.com` becomes the single human-facing hub** for platform staff, charity teams, volunteers, and donors; **`admin.masjidweb.com` stays headless** for provisioning, magic links, core updates, and Stripe webhooks; **YCode stays on tenant subdomains** for visual editing and public SSR.

**Phase 1 delivered the skeleton, not the product.** We have a tenant portal shell (`/portal/home`, `/portal/help`), a capable ops console mirroring Astro (`/ops-console`), Payload CRM schema (donors, donations, campaigns, volunteers, events), Astro JSON API contract with service-secret auth, and auth-spike documentation. **Critical gaps remain:** the “Open website builder” handoff is still a **stub** in `open-builder.ts` (returns Track C placeholder, does not call Astro `tenant-auth-link`); platform overview shows placeholder stats; charity CRM has **no tenant-scoped access control** or portal UI; **volunteer and donor personas do not exist**; tenant editor is not modelled separately from tenant admin; provision emails still land users on the subdomain builder, not manage.

**Opinionated next moves (Phase 2 sprint):**

1. **Wire open-builder end-to-end** — replace stub with `resolvePortalTenantForUser` → `requestTenantAuthLink` → `window.open(actionLink)`; regression-test two tenants.
2. **Ship live platform overview** — wire `PlatformHealthStrip` + tenant counts from Astro APIs into `/admin/overview`.
3. **Add `charity_editor` role** and split tenant admin vs editor nav; map to YCode `designer`/`editor` on builder handoff.
4. **Tenant-scoped CRM ACL** on all charity collections before any portal module ships.
5. **Design volunteer + donor** as lightweight Supabase-auth personas with `/volunteer` and `/donor` route groups — no YCode access.

Cost posture: Oracle Always Free + Netlify + Supabase free tier covers Phase 2–4. Stripe Connect Express (UK) when donations go live — no platform subscription billing until GTM requires it.

---

## What's built today (honest inventory with maturity %)

| Area | What exists | Maturity | Notes |
|------|-------------|----------|-------|
| **Tenant portal shell** | `/portal/home`, `/portal/help`, `PortalShell`, role redirect | **55%** | Checklist UI is mostly “Planned”; tenant resolution works when `tenantRegistryId` or org→tenant link set |
| **Platform overview** | `/admin/overview` layout, nav | **25%** | Stats are `—`; health strip not wired; copy says “Track C hook point” |
| **Ops console** | `/ops-console` — tenants table, provision, audit log, core updates, cleanup | **80%** | Substantial `OpsConsoleClient`; proxies Astro via `/api/ops/*`; production-usable for platform staff |
| **Astro API bridge** | `admin-api-client.ts`, `PAYLOAD-API-CONTRACT.md`, CORS + service secret | **75%** | Readiness, tenant-auth-link, provision-status, audit-log documented and routed |
| **Open builder handoff** | Routes exist; docs complete; **implementation stub** | **35%** | `createOpenBuilderLink` returns stub failure; UI button calls API but gets error |
| **Payload CRM schema** | organisations, tenants, donors, donations, campaigns, volunteers, events, audit_events | **45%** | Schema only; scoped by `organisation` relationship, not `tenant_id`; no RLS in Supabase mirror |
| **Roles (Payload)** | `platform_admin`, `support`, `content_editor`, `charity_admin` | **40%** | No `charity_editor`, `volunteer`, `donor`; ops authz only checks `platform_admin` strictly |
| **YCode builder RBAC** | owner > admin > designer > editor on subdomain | **90%** | Mature but disconnected from manage roles; fragile accept-invite flow |
| **Astro admin dashboard** | Full provisioning, maintenance, logs, AI settings | **95%** | Still primary UI for many ops; correct as API layer, wrong as daily staff home |
| **Auth spike doc** | Two-session-domain model, route split, MT checklist | **85%** | Authoritative design; partially implemented |
| **Platform health** | `PlatformHealthStrip`, `/ops/readiness`, Payload DB ping | **60%** | Component exists; not on overview; Payload readiness fixed post-incident |
| **Provision → portal email** | Still subdomain-first invite | **10%** | Roadmap item; not started |
| **Stripe** | `donations.source = stripe` enum only | **5%** | No Connect, webhooks, or checkout |
| **Support tickets** | Help page with mailto | **15%** | No ticket entity |
| **AI platform capabilities** | Astro OpenRouter for core-update repair only | **20%** | No tenant-facing or platform-config AI in manage |

**Phase 1 overall: ~45%** — infrastructure and seams are in place; user-visible portal value is thin; the highest-risk integration (builder handoff) is documented but not live.

---

## Personas & permissions matrix (5 roles × capabilities)

MasjidWeb manage uses **one origin, role-based route groups**. YCode subdomain roles remain for builder sessions only.

### Role definitions

| Manage role | Maps to YCode (builder) | Audience |
|-------------|-------------------------|----------|
| `platform_admin` | — | MasjidWeb owner / engineering |
| `support` | — | MasjidWeb support (subset of platform) |
| `charity_admin` | `owner` or `admin` | Masjid/charity lead — full tenant ops |
| `charity_editor` | `designer` or `editor` | Content staff — no settings/billing/team |
| `volunteer` | — | Registered volunteer at one tenant |
| `donor` | — | Registered donor at one tenant |

`content_editor` remains for MasjidWeb.com marketing CMS only — not a tenant persona.

### Capabilities matrix

| Capability | Platform admin | Support | Charity admin | Charity editor | Volunteer | Donor |
|------------|:--------------:|:-------:|:-------------:|:--------------:|:---------:|:-----:|
| Platform overview & health | ✅ | ✅ read | ❌ | ❌ | ❌ | ❌ |
| Provision / deactivate tenants | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Core YCode updates & rollback | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View all tenants (360°) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Impersonate / magic link any tenant | ✅ | ✅ audited | ❌ | ❌ | ❌ | ❌ |
| Organisation CRM (all clients) | ✅ | ✅ read | ❌ | ❌ | ❌ | ❌ |
| Tenant settings & org profile | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Team invites (manage + builder) | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Open website builder | via ops pick | via ops pick | ✅ | ✅ | ❌ | ❌ |
| Donors / donations / campaigns | ✅ all tenants | ✅ read | ✅ own tenant | ❌ | ❌ | ❌ |
| Volunteers roster | ✅ all | ✅ read | ✅ own tenant | ❌ | ❌ | ❌ |
| Events management | ✅ all | ✅ read | ✅ own tenant | ✅ own tenant | ❌ | ❌ |
| Support tickets (create) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Support tickets (assign/resolve) | ✅ | ✅ | ✅ own tenant | ❌ | ❌ | ❌ |
| Own donation history | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Own volunteer shifts / profile | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Gift Aid declaration | ❌ | ❌ | ✅ manage | ❌ | ❌ | ✅ self |
| Stripe Connect onboarding | ✅ assist | ✅ view | ✅ own tenant | ❌ | ❌ | ❌ |
| Platform AI config | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tenant AI assist (content) | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |

**Enforcement:** server-side on every Payload route and custom API; never trust client `tenantId`. Volunteers and donors bind to exactly one `tenant_registry_id` + optional `organisation` link.

---

## Information architecture — sitemap for manage.masjidweb.com

```text
manage.masjidweb.com
├── /                          → role-based redirect (see Auth)
├── /admin/login               → shared login (Payload auth)
│
├── /platform/                 → platform staff (alias: /admin/ for Phase 2 compat)
│   ├── overview               → health, tenant counts, alerts
│   ├── tenants                → searchable registry + 360° drawer
│   ├── organisations          → prospect → active pipeline
│   ├── donations              → cross-tenant Stripe reconciliation (future)
│   ├── volunteers             → cross-tenant roster view (support)
│   ├── tickets                → platform queue
│   ├── operations             → link to /ops-console (heavy ops)
│   ├── ai                     → platform AI keys, safe-update repair config
│   ├── logs                   → provisioning + isolation history
│   └── settings               → team, secrets status, feature flags
│
├── /portal/                   → charity_admin + charity_editor
│   ├── home                   → checklist, status, quick actions
│   ├── organisation           → profile, address, Gift Aid settings
│   ├── donors                 → CRM list (admin only)
│   ├── donations              → ledger (admin only)
│   ├── campaigns              → fundraising (admin only)
│   ├── volunteers             → roster (admin only)
│   ├── events                 → calendar (admin + editor)
│   ├── team                   → manage users, invite (admin only)
│   ├── tickets                → tenant-scoped support
│   ├── settings               → Stripe Connect, notifications (admin)
│   └── help                   → docs + contact
│
├── /volunteer/                → volunteer persona (NEW)
│   ├── home                   → shifts, announcements
│   ├── profile                → availability, skills, safeguarding
│   ├── tickets                → my requests
│   └── events                 → sign-up / RSVP
│
├── /donor/                    → donor persona (NEW)
│   ├── home                   → giving summary
│   ├── donations              → history, receipts
│   ├── campaigns              → active appeals (read-only)
│   ├── gift-aid               → declaration manage
│   └── tickets                → my requests
│
├── /ops-console               → transitional heavy ops UI (platform_admin)
├── /admin/*                   → Payload CMS collections (staff)
└── /api/
    ├── portal/*               → tenant-scoped server actions
    ├── ops/*                  → platform ops → Astro
    └── webhooks/stripe        → Astro or manage (see Stripe plan)
```

**Phase 2 compat:** keep `/admin/overview` → redirect to `/platform/overview` when renamed. Keep `/ops-console` until operations merge into `/platform/operations`.

**Public marketing:** MasjidWeb.com content stays in Payload `marketing-pages` / `posts` or YCode — out of scope for tenant portal.

---

## User journey maps (onboarding → daily use) per persona

### 1. Platform admin

```text
ONBOARDING
  Hire → Payload user created (platform_admin)
  → manage.masjidweb.com/admin/login
  → /platform/overview (health strip green)

DAILY USE
  Morning: overview → failed provisions? isolation check red?
  → /platform/tenants → filter provisioning/failed
  → 360° drawer: audit timeline, continue setup, magic link for support
  → /ops-console for core update approve/apply
  → /platform/tickets for escalations

INCIDENT
  Isolation fail → logs → rollback via ops → audit event
```

### 2. Tenant admin (`charity_admin`)

```text
ONBOARDING (target)
  Astro provisions tenant → email: "Your portal is ready"
  → manage.masjidweb.com/login (set password)
  → /portal/home checklist
  → Review organisation profile
  → Open website builder (magic link → subdomain accept-invite)
  → Publish homepage → checklist marks complete
  → Invite team (charity_editor + volunteers)

DAILY USE
  /portal/home → status snapshot
  → Donations / campaigns / volunteers as needed
  → Open builder for site changes
  → /portal/tickets for MasjidWeb support
  → /portal/settings → Stripe Connect when live

TODAY (honest)
  Provision email → subdomain accept-invite → YCode builder (skips manage portal)
  Manage portal usable only if Payload user manually created with org link
```

### 3. Tenant editor (`charity_editor`)

```text
ONBOARDING
  Admin invites → email → manage.masjidweb.com/login
  → /portal/home (simplified checklist — content tasks only)
  → Open builder → designer/editor chrome on subdomain

DAILY USE
  /portal/events → add/edit events (portal module)
  → Open builder → edit CMS pages, no Settings/Users
  → Cannot see donors, team, or Stripe
```

### 4. Volunteer (NEW)

```text
ONBOARDING
  Admin sends volunteer invite (email) OR self-registers via public form
  → manage.masjidweb.com/login (volunteer role, tenant-bound)
  → /volunteer/home → welcome + assigned coordinator
  → Complete profile (availability, emergency contact, safeguarding ack)

DAILY USE
  /volunteer/home → upcoming shifts / event assignments
  → /volunteer/tickets → request help or report issue
  → /volunteer/events → RSVP
  → No builder, no CRM admin, no other tenants
```

### 5. Donor (NEW)

```text
ONBOARDING
  First online donation (Stripe Checkout) OR admin creates donor record + invite
  → Receipt email with "Create portal account" link
  → manage.masjidweb.com/login (donor role, tenant-bound)
  → /donor/gift-aid → UK declaration if applicable

DAILY USE
  /donor/home → YTD giving, active campaigns
  → /donor/donations → receipts, download PDF
  → /donor/campaigns → one-click give (Stripe)
  → /donor/tickets → query about donation
  → No visibility into other donors or charity admin functions
```

---

## Feature modules

### Tenants & provisioning

| Layer | Responsibility |
|-------|----------------|
| **Payload UI** | Tenant table, 360° drawer, provision form trigger, status badges |
| **Astro API** | Execute 2-phase pipeline, `provision-status`, `audit-log` |
| **Supabase** | `tenant_registry`, `provisioning_audit_log` — source of truth |
| **Payload collections** | `tenants`, `organisations` — mirror for CRM UX |

**Gap:** Payload tenant rows must stay synced with `tenant_registry` (webhook or poll on overview).

### Donations & Stripe

See dedicated Stripe section. Module includes: campaign pages, checkout, webhook ingestion, manual donations, Gift Aid flags, reconciliation dashboard for platform admin.

### Volunteers

Admin roster in `/portal/volunteers` (Payload collection + portal skin). Volunteer self-service in `/volunteer/*`. Optional public signup form on YCode site → Supabase edge function → create volunteer applicant + notify admin.

### Tickets (support)

Unified `support_tickets` table: tenant-scoped for charity users; platform queue for staff. Start with email-to-ticket + in-app create; no Zendesk ($0). SLA fields optional.

### AI

| Scope | Phase | Approach |
|-------|-------|----------|
| Platform safe-update repair | Now | Astro OpenRouter (existing) |
| Platform config UI | Phase 4 | `/platform/ai` — model pick, budget cap |
| Tenant content assist | Phase 5 | Optional OpenRouter key per tenant or shared pool; generate event blurb, campaign copy — **never** auto-publish |

### Content (website)

| Surface | Owner |
|---------|-------|
| Visual pages, components, publish | YCode on subdomain |
| Charity ops content (events list metadata) | Payload portal modules |
| Public marketing (masjidweb.com) | Payload marketing collections |

Portal shows **read-only publish status** + “Open builder” CTA — not an embedded builder.

### Settings

- **Platform:** feature flags, AI keys, team users
- **Tenant:** org profile, Stripe Connect, notification prefs, custom domain (future — Astro alias API)

---

## What stays in Astro API vs Payload UI vs YCode vs Supabase

| Concern | Payload UI | Astro API | YCode | Supabase |
|---------|:----------:|:---------:|:-----:|:--------:|
| Login sessions (manage) | ✅ | — | — | optional mirror |
| Builder sessions | — | magic link gen | ✅ accept-invite | Auth |
| Provision / deactivate | trigger | ✅ execute | — | ✅ |
| Core updates | approve UI | ✅ execute | preview | checkpoints |
| Tenant registry reads | ✅ | ✅ | — | ✅ SoT |
| Charity CRM CRUD | ✅ portal skin | — | public bind | ✅ + RLS |
| Donation checkout | embed/link | webhook endpoint | donate page | ✅ |
| Form submissions | view | — | ✅ collect | ✅ RLS |
| Website pages/CMS | — | — | ✅ | ✅ builder tables |
| Support tickets | ✅ | optional notify | “Get help” link | ✅ |
| Audit / isolation logs | display | ✅ write/read | — | ✅ |
| File uploads (CRM) | ✅ | — | assets | Storage |
| Gift Aid exports | ✅ | — | — | ✅ |

**Rule:** Supabase is system of record for tenant-bound operational data. Payload Postgres holds CRM + users for manage auth; **mirror or sync** tenant-scoped rows to Supabase when RLS-protected public/volunteer/donor access is needed.

---

## Stripe integration plan

### Recommendation: Stripe Connect Express (UK charities)

| Approach | Verdict | Why |
|----------|---------|-----|
| **Connect Express** | ✅ Primary | Each masjid onboard own Stripe account; MasjidWeb takes optional application fee; donors pay charity directly; GDPR/Gift Aid stays with charity |
| **Direct charges on platform account** | ❌ | PCI + regulatory burden; wrong for multi-tenant charities |
| **Payment Links only (no Connect)** | ⚠️ MVP fallback | $0 setup; manual per-tenant Payment Links; no unified reconciliation — use only pre-Connect |

### Architecture

```text
Donor → YCode donate page OR /donor/campaigns
  → Stripe Checkout Session (Connect: stripeAccount = tenant.connect_account_id)
  → Webhook → admin.masjidweb.com/api/webhooks/stripe (headless, idempotent)
  → Upsert Supabase donations + Payload donations (service role, tenant-scoped)
  → Email receipt + optional portal invite
```

### Webhooks on admin API (not Payload UI)

- **Why Astro:** Netlify stable URL, already holds ops secrets, same pattern as isolation-check webhook
- **Events:** `checkout.session.completed`, `payment_intent.succeeded`, `charge.refunded`, `account.updated` (Connect onboarding)
- **Security:** `STRIPE_WEBHOOK_SECRET`, verify signature, store `event_id` for idempotency
- **Gift Aid UK:** Store declaration on `donors.giftAid`; checkout collects opt-in; export CSV from `/portal/donors` (HMRC-style columns); **not** automated HMRC submission in v1

### Stripe plugin best practices (Payload)

- Do **not** use Payload as payment processor — use **Checkout Sessions** from Astro route or Next route on manage with service secret
- Store only: `stripe_connect_account_id`, `stripe_customer_id` (donor), `stripe_payment_intent_id` on donation row — never card data
- Payload `@payloadcms/plugin-stripe` is for **billing platform subscriptions** (Phase 6) — not charity donations; keep donations on custom Connect flow
- Test mode per tenant during onboarding; platform admin sees reconciliation across tenants

### Cost

Stripe standard pricing per charity account; Connect Express free. MasjidWeb application fee 0% until business model defined.

---

## Auth & onboarding flows per persona

### Single login on manage

- **One login page:** `/admin/login` (Payload auth)
- **Post-login router** (`/api/auth/redirect` or middleware):

| Role | Redirect |
|------|----------|
| `platform_admin` | `/platform/overview` |
| `support` | `/platform/overview` |
| `content_editor` | `/admin` (CMS) |
| `charity_admin` | `/portal/home` |
| `charity_editor` | `/portal/home` |
| `volunteer` | `/volunteer/home` |
| `donor` | `/donor/home` |

### Tenant binding (charity / volunteer / donor)

Required fields on Payload `users`:

- `role`
- `tenantRegistryId` (UUID from `tenant_registry`) — **required** for non-platform roles
- `organisation` — optional convenience link to Payload org

Resolution order matches `portal-auth.ts`: direct `tenantRegistryId` → else org → tenant.ycode.tenantId.

### Builder handoff (charity_admin / charity_editor only)

1. Browser `POST /api/portal/open-builder` (same-origin, session cookie)
2. Server resolves tenant from session **only**
3. Server calls Astro `POST /api/tenant-auth-link` with `returnLink: true`
4. Returns `{ actionLink }` → `window.open`
5. Subdomain accept-invite → `/ycode/api/auth/session` → `/ycode`

**YCode role sync:** When generating link, Astro uses tenant admin email; YCode `app_metadata.role` should match manage role (`charity_admin` → `admin`, `charity_editor` → `designer` or `editor`). Phase 2: extend `send-tenant-auth-link` to accept optional `builderRole` metadata.

### Volunteer / donor onboarding

- **Invite flow:** charity_admin creates invite → Payload sends email → user sets password → lands on role home
- **Self-serve donor:** Stripe webhook creates donor row → magic link email to claim account
- **No subdomain session** for volunteer/donor unless they later become charity_editor

### Platform support impersonation (Phase 4)

- `platform_admin` / `support` uses ops console `tenant-auth-link` with explicit tenant pick + `audit_events` row
- No silent JWT tenant switching

---

## Data model additions needed

### Supabase (new tables + RLS)

| Table | Purpose | RLS |
|-------|---------|-----|
| `support_tickets` | id, tenant_id, created_by_user_id, assignee_id, status, subject, body, priority | tenant_id = JWT metadata |
| `support_ticket_messages` | thread | via ticket tenant |
| `portal_users` (optional) | If Supabase auth used alongside Payload — link auth.users to tenant + role | self + tenant admin |
| `tenant_checklist` | checklist item, completed_at, tenant_id | tenant admin read/write |
| `volunteer_shifts` | volunteer_id, event_id, start, end, status | volunteer self + admin |
| `donation_receipts` | pdf_url, donation_id | donor self + admin |
| `stripe_connect_accounts` | tenant_id, stripe_account_id, onboarding_complete | tenant admin |
| `stripe_webhook_events` | event_id, processed_at (idempotency) | service role only |

**Extend existing:**

- `tenant_registry` — add `stripe_connect_account_id`, `checklist_completed_at` (optional)
- Mirror Payload `donations` / `donors` to Supabase if public donor API needed — or single SoT in Supabase with Payload read replica

### Payload collections (changes)

| Collection | Changes |
|------------|---------|
| `users` | Add roles: `charity_editor`, `volunteer`, `donor`; require `tenantRegistryId` for tenant-bound roles |
| `donors` | Link to `users` when portal account claimed; `stripe_customer_id` |
| `donations` | `stripe_payment_intent_id`, `gift_aid_amount`, `checkout_session_id` |
| `campaigns` | `stripe_product_id` / `price_id` optional |
| `volunteers` | Link to `users`; `portal_user` relationship |
| `support_tickets` | New collection or Supabase-only with Payload UI via custom view |
| All charity collections | Access hooks: filter `organisation` → user's tenant org |

### RLS policy pattern

```sql
-- Example: donations readable by tenant admin via service role from Payload;
-- donor sees own rows: auth.uid() = donor.user_id AND tenant_id match
```

Service-role Payload routes must still call `scopeToTenantRow` — RLS is defense in depth for any direct Supabase client paths (donor mobile app future).

---

## Phased build roadmap (Phase 2–6)

### Phase 2: Complete Phase 1 seams + tenant admin UX (weeks 1–6) — **P0**

| Deliverable | Effort | Deps |
|-------------|--------|------|
| Live `open-builder` (remove stub) | S | Astro secret configured |
| Platform overview live stats + health strip | S | Astro readiness API |
| Post-login role router | S | — |
| Add `charity_editor` role + nav split | M | — |
| Tenant-scoped collection access control | M | org↔tenant link |
| Checklist backed by `tenant_checklist` table | M | Supabase migration |
| Provision email → manage portal URL (design + implement) | M | Astro email templates |
| Two-tenant MT validation documented | S | — |

### Phase 3: Charity ops portal modules (weeks 6–12) — **P1**

| Deliverable | Effort | Deps |
|-------------|--------|------|
| `/portal/donors`, `/donations`, `/campaigns` UI | L | Phase 2 ACL |
| `/portal/volunteers`, `/portal/events` UI | M | — |
| `/portal/organisation`, `/portal/team` | M | invite API |
| YCode public pages bind to CRM or sync | M | — |
| Gift Aid CSV export | S | donors schema |
| Return-to-portal link in YCode builder chrome | S | — |

### Phase 4: Support + platform consolidation (weeks 10–16) — **P1**

| Deliverable | Effort | Deps |
|-------------|--------|------|
| `support_tickets` + `/portal/tickets` + `/platform/tickets` | M | Supabase migration |
| Merge ops into `/platform/operations` (optional) | M | — |
| Tenant 360° drawer with audit timeline | M | Astro APIs |
| Support impersonation with audit | M | — |
| `/platform/ai` config UI | S | — |

### Phase 5: Volunteer & donor personas (weeks 14–20) — **P1**

| Deliverable | Effort | Deps |
|-------------|--------|------|
| `volunteer` + `donor` roles, routes `/volunteer/*`, `/donor/*` | L | Auth router |
| Donor self-serve registration post-checkout | M | Stripe Phase 6 or manual |
| Volunteer invite + profile + shifts | M | events module |
| Donor receipt PDF generation | M | donations |
| Supabase RLS for donor/volunteer self-access | M | migrations |

### Phase 6: Stripe Connect + billing (weeks 18–26) — **P2**

| Deliverable | Effort | Deps |
|-------------|--------|------|
| Stripe Connect Express onboarding in `/portal/settings` | L | — |
| Checkout on campaign pages | M | Connect |
| Webhook handler on Astro | M | — |
| Platform reconciliation dashboard | M | webhooks |
| Optional: MasjidWeb SaaS billing via Payload Stripe plugin | L | GTM decision |

**Effort key:** S = 1–3 days, M = 1–2 weeks, L = 2–4 weeks (solo dev).

---

## UX principles (app.ycode.com inspiration)

1. **Calm density** — generous whitespace, 4–5 font sizes max, card-based modules like YCode's app shell
2. **Sidebar + contextual main** — persistent nav per persona; no Payload admin chrome for tenant users
3. **Progressive disclosure** — checklist before advanced CRM; editors never see greyed-out admin items — hide entirely
4. **Status-first** — traffic lights for health, provisioning, publish state before tables
5. **One primary CTA per screen** — portal home: "Open website builder"; donor home: "Give again"
6. **Plain language** — "Donations" not "CRM ledger"; "Your website" not "YCode tenant"
7. **Mobile-tolerant** — platform overview readable on phone; volunteer shifts critical on mobile
8. **Empty states that teach** — first donor: "Share your campaign link to receive donations"
9. **No dead ends** — help link on every error; mailto fallback until tickets live
10. **Return paths** — builder → "Back to portal" in YCode header (Phase 3)

---

## Success metrics

| Metric | Target (6 mo) | Target (12 mo) |
|--------|---------------|----------------|
| Open-builder success rate | > 90% | > 95% |
| New tenants land on manage portal first | 80% | 100% |
| Portal checklist completion (first 30 days) | 50% | 70% |
| Charity admin MAU on manage | baseline | +30% QoQ |
| Time to login link (support) | < 5 min | < 2 min |
| Isolation check green | 100% | 100% |
| Donor portal account claim rate | — | 40% of online donors |
| Volunteer active monthly | — | 30% of roster |
| Stripe donation reconciliation accuracy | — | 99.5% |
| Astro dashboard UI sessions (staff) | declining | ~0 (API only) |

---

## Immediate next sprint (after Phase 1)

**Sprint goal:** Make Phase 1 **honestly complete** — portal delivers one real workflow end-to-end.

| # | Task | Owner | Effort |
|---|------|-------|--------|
| 1 | **Replace `open-builder` stub** with `resolvePortalTenantForUser` + `requestTenantAuthLink`; handle errors in `PortalShell` | Backend | S |
| 2 | **Wire `PlatformHealthStrip`** + tenant counts into `/admin/overview` (or `/platform/overview`) | Frontend | S |
| 3 | **Post-login redirect** by role (charity → portal, platform → overview) | Backend | S |
| 4 | **Add `charity_editor` role** to Users collection + `requirePortalUser` allow list | Backend | S |
| 5 | **Collection access hooks** — charity_admin sees only own organisation's CRM rows | Backend | M |
| 6 | **Manual QA script** — two tenants A/B: portal → open-builder → accept-invite → builder; document in MT checklist | QA | S |
| 7 | **Provision email copy PR** (Astro) — point to manage login; builder via portal CTA | Product | S |
| 8 | **Create Supabase migration** stub for `tenant_checklist` + `support_tickets` (schema only) | Backend | S |

**Definition of done:** Charity admin logs into manage → sees tenant name on home → clicks Open website builder → lands in YCode on correct subdomain → platform overview shows live readiness.

---

## Appendix: Phase 1 file map

| Path | Status |
|------|--------|
| `masjidweb-manage-payload/src/app/(payload)/portal/home/page.tsx` | Shell ✅ |
| `masjidweb-manage-payload/src/portal/open-builder.ts` | **Stub — fix first** |
| `masjidweb-manage-payload/src/ops/admin-api-client.ts` | Ready ✅ |
| `masjidweb-manage-payload/src/ops/portal-auth.ts` | Ready ✅ |
| `masjidweb-manage-payload/src/app/(payload)/ops-console/` | Mature ✅ |
| `masjidweb-backend/admin-dashboard-v2/src/pages/api/tenant-auth-link.ts` | Ready ✅ |
| `masjidweb-backend/docs/PAYLOAD-API-CONTRACT.md` | Ready ✅ |
| `ycode-mw-tenant/lib/roles.ts` | Builder RBAC ✅ |

---

*This plan supersedes scattered Phase 1 notes in PLATFORM-ROADMAP immediate sprint. Update when Phase 2 ships.*
