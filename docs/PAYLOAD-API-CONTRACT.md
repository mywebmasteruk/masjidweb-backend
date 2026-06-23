# Payload ↔ Astro admin API contract

**Base URL:** `https://admin.masjidweb.com` (local dev: `http://localhost:4321`)

**Consumer:** Payload on `manage.masjidweb.com` (platform overview, tenant 360, “Open website builder”).

**Phase 1 scope:** stable JSON routes for ops reads and magic-link generation. Astro `/dashboard` UI continues to use the same routes with session cookies.

---

## Authentication

| Mode | When | Mechanism |
|------|------|-----------|
| **Dashboard session** | Astro `/dashboard` UI (unchanged) | Cookie from `POST /api/auth/login` |
| **Payload service secret** | Server-to-server from manage | Header `x-payload-service-secret: <secret>` |
| **Provision internal** | Automation only on `provision-status` | Header `x-provision-internal: <PROVISION_INTERNAL_SECRET>` |
| **Core update notify** | GitHub Actions on `POST isolation-check-log` only | Header `x-core-update-notify-secret: <CORE_UPDATE_NOTIFY_SECRET>` |

### Service secret env

Set the **same** value on admin (Netlify) and manage (Oracle/Railway):

```env
PAYLOAD_SERVICE_SECRET=   # min 16 chars (canonical)
# Alias accepted on admin only:
# PAYLOAD_OPS_API_SECRET=
```

If neither secret is configured, Payload service auth is disabled; dashboard session auth still works for Astro UI.

### CORS (browser calls from manage)

Optional. Server-side Payload routes should prefer the service secret (no CORS).

```env
PAYLOAD_PORTAL_ORIGINS=https://manage.masjidweb.com,http://localhost:3003
```

Defaults include `https://manage.masjidweb.com` and local Payload dev (`localhost:3003`). Unknown origins receive no `Access-Control-Allow-Origin`.

**Preflight:** `OPTIONS /api/*` returns `204` with allowed methods `GET, POST, DELETE, OPTIONS`.

---

## Endpoints

### `GET /api/readiness`

Ops health for platform overview and uptime probes.

| | |
|---|---|
| **Auth** | Optional. Unauthenticated: minimal body. Session or service secret: full diagnostics. |
| **Query** | — |

**Response `200` (healthy) / `503` (unhealthy)**

Unauthenticated:

```json
{ "ok": true, "service": "admin-dashboard-v2" }
```

Authorized (session or `x-payload-service-secret`):

```json
{
  "ok": true,
  "service": "admin-dashboard-v2",
  "checks": [
    { "name": "supabase", "configured": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "missing": [] },
    { "name": "dashboard-auth", "configured": ["ADMIN_SESSION_SECRET", "DASHBOARD_ADMIN_PASSWORD"], "missing": [] },
    { "name": "netlify-provision", "configured": [], "missing": ["NETLIFY_AUTH_TOKEN", "NETLIFY_SITE_ID"], "optional": true },
    { "name": "payload-bridge", "configured": ["PAYLOAD_SERVICE_SECRET"], "missing": [], "optional": true }
  ],
  "requiredMissing": [],
  "database": { "ok": true }
}
```

`database.ok: false` includes `{ "error": "<message>" }`. HTTP status is `503` when `ok` is false.

---

### `POST /api/tenant-auth-link`

Generate tenant builder login link (invite recovery or magic link). Redirect target remains `{slug}.<TENANT_DOMAIN_SUFFIX>/ycode/accept-invite` (fragile flow unchanged).

| | |
|---|---|
| **Auth** | Session or `x-payload-service-secret` |
| **Content-Type** | `application/json` |

**Request body**

```json
{
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "returnLink": false
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tenantId` | UUID string | yes | Payload must verify tenant binding server-side before calling |
| `returnLink` | boolean | no | When `true`, return link only — no Supabase invite email |

**Query alternatives for link-only:** `?return_link=true` or `?mode=copy`

**Response `200` — invite path**

```json
{
  "ok": true,
  "method": "invite",
  "email": "admin@tenant.masjidweb.com",
  "coerced": false,
  "message": "Invite sent.",
  "actionLink": "https://slug.masjidweb.com/ycode/accept-invite#...",
  "linkOnly": false
}
```

**Response `200` — magic link path**

```json
{
  "ok": true,
  "method": "magiclink",
  "email": "admin@tenant.masjidweb.com",
  "coerced": false,
  "actionLink": "https://slug.masjidweb.com/ycode/accept-invite#...",
  "message": "Magic link generated.",
  "linkOnly": true
}
```

**Errors:** `401` unauthorized · `400` invalid JSON or validation · `500` `{ "ok": false, "error": "<message>" }`

---

### `GET /api/provision-status`

Poll tenant provisioning / publish state (same shape as Astro dashboard provision modal).

| | |
|---|---|
| **Auth** | Session, `x-payload-service-secret`, or `x-provision-internal` |
| **Query** | `tenantId` (UUID, required) |

**Response `200`**

```json
{
  "ok": true,
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "slug": "example-masjid",
  "status": "provisioning",
  "active": false,
  "publishCompleted": false,
  "publishFailed": false
}
```

`status` values include `provisioning`, `active`, `failed`, `deactivated`, etc. (from `tenant_registry.status`).

`publishCompleted` / `publishFailed` derive from latest `provisioning_audit_log` action among `provision_publish_step`, `provision_complete`, `provision_publish_failed`.

**Errors:** `401` · `400` missing tenantId · `404` tenant not found

---

### `GET /api/audit-log`

List provisioning audit rows for tenant 360 / ops timeline.

| | |
|---|---|
| **Auth** | Session or `x-payload-service-secret` |
| **Query** | `limit` (1–500, default 100) · `tenantId` (optional UUID filter) |

**Response `200`**

```json
{
  "ok": true,
  "rows": [
    {
      "id": "00000000-0000-0000-0000-000000000001",
      "tenant_id": "00000000-0000-0000-0000-000000000002",
      "action": "clone_complete",
      "details": {},
      "created_at": "2026-06-23T12:00:00.000Z"
    }
  ]
}
```

**Errors:** `401` · `500` `{ "ok": false, "error": "<message>" }`

---

### `DELETE /api/audit-log`

Clear all provisioning audit rows (existing Astro logs page action). **Destructive** — restrict to platform staff.

| | |
|---|---|
| **Auth** | Session or `x-payload-service-secret` |

**Response `200`:** `{ "ok": true }`

**Errors:** `401` · `500` `{ "error": "<message>" }`

---

### `GET /api/isolation-check-log`

List recent daily tenant isolation check runs (GitHub Actions workflow history).

| | |
|---|---|
| **Auth** | Session or `x-payload-service-secret` |
| **Query** | `limit` (1–200, default 30) |

**Response `200`**

```json
{
  "ok": true,
  "rows": [
    {
      "id": "00000000-0000-0000-0000-000000000001",
      "status": "pass",
      "durationMs": 142000,
      "repository": "mywebmasteruk/ycode-mw-tenant",
      "branch": "main",
      "commitSha": "abc123",
      "workflowRunId": "12345678",
      "workflowRunUrl": "https://github.com/.../actions/runs/12345678",
      "workflowName": "Tenant isolation check",
      "summary": "All checks passed",
      "failureOutput": null,
      "details": {},
      "createdAt": "2026-06-23T03:00:00.000Z"
    }
  ]
}
```

**Errors:** `401` `{ "ok": false, "error": "Unauthorized" }`

---

### `POST /api/isolation-check-log`

**GitHub Actions webhook only** — not for Payload UI. Records a daily isolation run.

| | |
|---|---|
| **Auth** | `x-core-update-notify-secret` (`CORE_UPDATE_NOTIFY_SECRET`) |
| **Content-Type** | `application/json` |

**Request body**

```json
{
  "status": "pass",
  "durationMs": 142000,
  "repository": "mywebmasteruk/ycode-mw-tenant",
  "branch": "main",
  "commitSha": "abc123",
  "workflowRunId": "12345678",
  "workflowRunUrl": "https://github.com/.../actions/runs/12345678",
  "workflowName": "Tenant isolation check",
  "summary": "All checks passed",
  "failureOutput": null,
  "details": {}
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `status` | yes | `"pass"` or `"fail"` |
| `durationMs` | no | non-negative integer |
| others | no | strings; `details` object |

**Response `201`:** `{ "ok": true, "id": "<uuid>" }`

**Errors:** `401` · `400` validation · `500` persist failure

---

## Payload integration checklist

1. Set `YCODE_ADMIN_URL=https://admin.masjidweb.com` and matching `PAYLOAD_SERVICE_SECRET` on manage.
2. Call admin APIs **server-side** from Payload route handlers / server actions with `x-payload-service-secret`.
3. Resolve the user's tenant **before** calling `tenant-auth-link` — never trust client-supplied `tenantId` alone.
4. Use `GET /api/readiness` for platform health strip; treat `503` as degraded.
5. Use `GET /api/provision-status` + `GET /api/audit-log?tenantId=` for tenant 360 provisioning timeline.
6. Use `POST /api/tenant-auth-link` with `returnLink: true` for “Open website builder” until email-first portal flow ships.

---

## Local smoke tests

```bash
cd masjidweb-backend/admin-dashboard-v2
npm run dev

# Readiness (no auth)
curl -s http://localhost:4321/api/readiness | jq

# Full readiness
curl -s -H "x-payload-service-secret: $PAYLOAD_SERVICE_SECRET" \
  http://localhost:4321/api/readiness | jq

# Magic link (link only)
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "x-payload-service-secret: $PAYLOAD_SERVICE_SECRET" \
  -d '{"tenantId":"<uuid>","returnLink":true}' \
  http://localhost:4321/api/tenant-auth-link | jq

# CORS preflight
curl -s -X OPTIONS \
  -H "Origin: http://localhost:3003" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:4321/api/tenant-auth-link -D -
```

---

## Related docs

- [PLATFORM-ROADMAP.md](./PLATFORM-ROADMAP.md) — Phase 1 sprint item 1
- Astro fragile flows: magic-link / accept-invite (workspace rules)
- Admin env template: `admin-dashboard-v2/.env.example`
