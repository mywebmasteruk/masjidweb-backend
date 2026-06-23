import type { APIRoute } from "astro";
import { isApiAuthorized } from "../../lib/api-auth";
import { jsonResponse } from "../../lib/api-cors";
import { readServerEnv } from "../../lib/server-env";
import { getServiceSupabase } from "../../lib/supabase-server";

type EnvCheck = {
  name: string;
  configured: string[];
  missing: string[];
  optional?: boolean;
};

function isConfigured(key: string): boolean {
  const value = readServerEnv(key);
  return typeof value === "string" && value.length > 0;
}

function checkGroup(name: string, keys: string[], optional?: boolean): EnvCheck {
  const configured = keys.filter(isConfigured);
  const missing = keys.filter((key) => !isConfigured(key));
  return { name, configured, missing, optional };
}

async function pingSupabase(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isConfigured("SUPABASE_URL") || !isConfigured("SUPABASE_SERVICE_ROLE_KEY")) {
    return { ok: false, error: "Supabase env is not configured" };
  }

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("tenant_registry").select("id").limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Lightweight ops readiness for Payload platform overview and uptime checks. */
export const GET: APIRoute = async (context) => {
  const authorized = await isApiAuthorized(context);

  const checks = [
    checkGroup("supabase", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]),
    checkGroup("dashboard-auth", ["ADMIN_SESSION_SECRET", "DASHBOARD_ADMIN_PASSWORD"]),
    checkGroup("netlify-provision", ["NETLIFY_AUTH_TOKEN", "NETLIFY_SITE_ID"], true),
    checkGroup("payload-bridge", ["PAYLOAD_SERVICE_SECRET"], true),
  ];

  const requiredMissing = checks
    .filter((check) => !check.optional)
    .flatMap((check) => check.missing);

  const envOk = requiredMissing.length === 0;
  const database = envOk ? await pingSupabase() : { ok: false as const, error: "skipped until required env is set" };
  const ok = envOk && database.ok;

  const body = authorized
    ? { ok, checks, requiredMissing, database, service: "admin-dashboard-v2" }
    : { ok, service: "admin-dashboard-v2" };

  return jsonResponse(body, context.request, ok ? 200 : 503);
};

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204 });
