import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import {
  cleanupOrphanDomainAliases,
  previewOrphanDomainAliases,
} from "../../lib/netlify-domain-reconcile";
import { readServerEnv } from "../../lib/server-env";
import { getServiceSupabase } from "../../lib/supabase-server";

function netlifyConfig():
  | { ok: true; token: string; siteId: string; domainSuffix: string }
  | { ok: false; error: string } {
  const token = readServerEnv("NETLIFY_AUTH_TOKEN");
  const siteId = readServerEnv("NETLIFY_SITE_ID");
  const domainSuffix = readServerEnv("TENANT_DOMAIN_SUFFIX") || "masjidweb.com";

  if (!token || !siteId) {
    return {
      ok: false,
      error: "NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID are required for subdomain cleanup",
    };
  }

  return { ok: true, token, siteId, domainSuffix };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const config = netlifyConfig();
  if (!config.ok) {
    return json({ ok: false, error: config.error }, 500);
  }

  try {
    const preview = await previewOrphanDomainAliases({
      supabase: getServiceSupabase(),
      netlifyToken: config.token,
      siteId: config.siteId,
      domainSuffix: config.domainSuffix,
    });

    return json({
      ok: true,
      ...preview,
      totalPending: preview.orphanAliases.length,
    });
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
};

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const config = netlifyConfig();
  if (!config.ok) {
    return json({ ok: false, error: config.error }, 500);
  }

  let aliases: string[] | undefined;
  try {
    const raw = await context.request.text();
    if (raw.trim()) {
      const body = JSON.parse(raw) as { aliases?: unknown };
      if (Array.isArray(body.aliases)) {
        aliases = body.aliases.filter((alias): alias is string => typeof alias === "string");
      }
    }
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  try {
    const result = await cleanupOrphanDomainAliases({
      supabase: getServiceSupabase(),
      netlifyToken: config.token,
      siteId: config.siteId,
      domainSuffix: config.domainSuffix,
      aliases,
    });

    return json({
      ok: true,
      ...result,
      totalPending: result.orphanAliases.length,
      removed: result.removedAliases,
      skipped: result.skippedAliases,
    });
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
};
