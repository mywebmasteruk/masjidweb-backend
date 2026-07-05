import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { readServerEnv } from "../../lib/server-env";
import { netlifyBuilderSiteId } from "../../lib/netlify-site-ids";

/**
 * GET  /api/platform-flags  — current production values of the tenant-builder
 *                             feature flags + latest deploy state.
 * POST /api/platform-flags  — { key, value }: set ONE allowlisted flag on the
 *                             builder site's production context and trigger a
 *                             redeploy (env changes only take effect on deploy).
 *
 * The flags are Netlify env vars on the BUILDER site (tenants.masjidweb.com),
 * managed via Netlify's Envelope API with the dashboard's NETLIFY_AUTH_TOKEN.
 * Keys are strictly allowlisted — this route can never write arbitrary env.
 */

type FlagDef = {
  key: string;
  label: string;
  /** Allowed literal values; first entry is the "safe default" direction. */
  values: string[];
  description: string;
  danger?: string;
};

// The kill switches for everything shipped in the isolation/caching workstreams.
// Value semantics mirror the app code: anything other than the "on" literal
// behaves as OFF, so we always write explicit literals rather than deleting.
export const PLATFORM_FLAGS: FlagDef[] = [
  {
    key: "MW_TENANT_RLS_ENFORCE",
    label: "Database RLS enforcement (app path)",
    values: ["true", "false"],
    description:
      "App queries run on a tenant-scoped JWT client so Postgres RLS enforces isolation. OFF = service-role + app-layer filters only (pre-Phase-4 behaviour).",
    danger:
      "Turning this OFF while seam retirement is ON leaves only the app-layer filters guarding reads (they re-arm automatically, but turn seam retirement OFF too if you are diagnosing isolation).",
  },
  {
    key: "MW_SEAMS_RETIRED",
    label: "Seam retirement (RLS-only reads)",
    values: ["true", "false"],
    description:
      "applyTenantEq becomes a no-op for queries provably running on the RLS client (marker header). OFF = seams filter every query again (pre-2026-07-05 behaviour).",
  },
  {
    key: "MW_ROUTE_TENANT_RESOLUTION",
    label: "Public-page CDN caching (route-based tenant resolution)",
    values: ["on", "canary", "off"],
    description:
      "Public pages rewrite to the cacheable /mw-tenant route: on = all tenants, canary = only MW_ROUTE_TENANT_CANARY_HOSTS, off = dynamic per-request rendering (slow but simplest).",
  },
];

const NETLIFY_API = "https://api.netlify.com/api/v1";

function netlifyToken(): string {
  const t = readServerEnv("NETLIFY_AUTH_TOKEN");
  if (!t) throw new Error("NETLIFY_AUTH_TOKEN is not set");
  return t;
}

async function netlifyJson(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${NETLIFY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${netlifyToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

let cachedAccountSlug: string | null = null;
async function accountSlugForSite(siteId: string): Promise<string> {
  if (cachedAccountSlug) return cachedAccountSlug;
  const res = await netlifyJson(`/sites/${siteId}`);
  if (!res.ok) throw new Error(`Netlify getSite failed (${res.status})`);
  const site = (await res.json()) as { account_slug?: string };
  if (!site.account_slug) throw new Error("Site has no account_slug");
  cachedAccountSlug = site.account_slug;
  return cachedAccountSlug;
}

async function readFlagValue(account: string, siteId: string, key: string): Promise<string | null> {
  const res = await netlifyJson(`/accounts/${account}/env/${key}?site_id=${siteId}`);
  if (res.status === 404) return null; // var not set at all
  if (!res.ok) throw new Error(`Netlify getEnvVar ${key} failed (${res.status})`);
  const data = (await res.json()) as { values?: { value: string; context: string }[] };
  const prod = data.values?.find((v) => v.context === "production" || v.context === "all");
  return prod?.value ?? null;
}

async function latestDeploy(siteId: string): Promise<{ state: string; created_at: string } | null> {
  const res = await netlifyJson(`/sites/${siteId}/deploys?per_page=1`);
  if (!res.ok) return null;
  const list = (await res.json()) as { state: string; created_at: string }[];
  return list[0] ?? null;
}

export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return json({ error: "Unauthorized" }, 401);
  }
  try {
    const siteId = netlifyBuilderSiteId();
    if (!siteId) return json({ ok: false, error: "Builder site id not configured" }, 500);
    const account = await accountSlugForSite(siteId);

    const flags = await Promise.all(
      PLATFORM_FLAGS.map(async (def) => ({
        key: def.key,
        label: def.label,
        values: def.values,
        description: def.description,
        danger: def.danger ?? null,
        current: await readFlagValue(account, siteId, def.key),
      })),
    );
    // Display-only context for the caching flag's canary mode.
    const canaryHosts = await readFlagValue(account, siteId, "MW_ROUTE_TENANT_CANARY_HOSTS");
    const deploy = await latestDeploy(siteId);

    return json({ ok: true, flags, canaryHosts, deploy });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return json({ error: "Unauthorized" }, 401);
  }
  try {
    const body = (await context.request.json()) as { key?: string; value?: string };
    const def = PLATFORM_FLAGS.find((f) => f.key === body.key);
    if (!def) return json({ ok: false, error: "Unknown flag" }, 400);
    if (typeof body.value !== "string" || !def.values.includes(body.value)) {
      return json({ ok: false, error: `Value must be one of: ${def.values.join(", ")}` }, 400);
    }

    const siteId = netlifyBuilderSiteId();
    if (!siteId) return json({ ok: false, error: "Builder site id not configured" }, 500);
    const account = await accountSlugForSite(siteId);

    const patch = await netlifyJson(`/accounts/${account}/env/${def.key}?site_id=${siteId}`, {
      method: "PATCH",
      body: JSON.stringify({ context: "production", value: body.value }),
    });
    if (!patch.ok) {
      return json({ ok: false, error: `Netlify setEnvVarValue failed (${patch.status})` }, 502);
    }

    // Env changes only apply on a fresh deploy.
    const build = await netlifyJson(`/sites/${siteId}/builds`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!build.ok) {
      return json(
        {
          ok: false,
          error: `Flag saved but redeploy trigger failed (${build.status}) — trigger a deploy manually`,
        },
        502,
      );
    }

    return json({ ok: true, key: def.key, value: body.value, redeploy: "triggered" });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
