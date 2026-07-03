import type { APIRoute } from "astro";
import { isApiAuthorized } from "../../lib/api-auth";
import { jsonResponse } from "../../lib/api-cors";
import { isCoreUpdateNotifyAuthorized } from "../../lib/core-update-notify-auth";
import { getServiceSupabase } from "../../lib/supabase-server";

/**
 * Test-debris cleanup (see supabase/migrations/20260703090000_test_debris_cleanup.sql).
 *
 * GET  — dashboard: config + dry-run preview counts + recent run log.
 * POST — execute a real run. Dashboard sessions (mode=manual) or the daily
 *        GitHub Actions cron via the shared notify secret (mode=scheduled).
 *        A disabled config makes real runs a green no-op — the admin
 *        dashboard toggle is the kill switch for the cron.
 * PUT  — dashboard: update config (enabled / retention_days / test_tenant_slugs).
 */

export const GET: APIRoute = async (context) => {
  if (!(await isApiAuthorized(context))) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, context.request, 401);
  }

  const supabase = getServiceSupabase();

  const { data: config, error: configError } = await supabase
    .from("mw_cleanup_config")
    .select("enabled, retention_days, test_tenant_slugs, test_name_patterns, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (configError) {
    return jsonResponse({ ok: false, error: configError.message }, context.request, 500);
  }

  const { data: preview, error: previewError } = await supabase.rpc("mw_cleanup_run", {
    p_dry_run: true,
    p_mode: "preview",
  });
  if (previewError) {
    return jsonResponse({ ok: false, error: previewError.message }, context.request, 500);
  }

  const { data: log } = await supabase
    .from("mw_cleanup_log")
    .select("ran_at, mode, dry_run, status, deleted_counts, duration_ms, error")
    .order("ran_at", { ascending: false })
    .limit(10);

  return jsonResponse({ ok: true, config, preview, log: log ?? [] }, context.request);
};

export const POST: APIRoute = async (context) => {
  const machine = isCoreUpdateNotifyAuthorized(context);
  if (!machine && !(await isApiAuthorized(context))) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, context.request, 401);
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("mw_cleanup_run", {
    p_dry_run: false,
    p_mode: machine ? "scheduled" : "manual",
  });

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, context.request, 500);
  }
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    return jsonResponse({ ok: false, error: (data as Record<string, unknown>).error }, context.request, 500);
  }

  return jsonResponse({ ok: true, result: data ?? null }, context.request);
};

export const PUT: APIRoute = async (context) => {
  if (!(await isApiAuthorized(context))) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, context.request, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, context.request, 400);
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;

  if (body.retention_days !== undefined) {
    const days = Number(body.retention_days);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return jsonResponse({ ok: false, error: "retention_days must be an integer between 1 and 3650" }, context.request, 400);
    }
    updates.retention_days = days;
  }

  const supabase = getServiceSupabase();

  if (body.test_tenant_slugs !== undefined) {
    if (!Array.isArray(body.test_tenant_slugs) || body.test_tenant_slugs.some((s) => typeof s !== "string")) {
      return jsonResponse({ ok: false, error: "test_tenant_slugs must be an array of slugs" }, context.request, 400);
    }
    const slugs = (body.test_tenant_slugs as string[]).map((s) => s.trim()).filter(Boolean);
    if (slugs.length > 0) {
      // Every slug must be a real tenant — a typo here must never silently
      // widen (or no-op) an automated deletion job.
      const { data: found, error: lookupError } = await supabase
        .from("tenant_registry")
        .select("slug")
        .in("slug", slugs);
      if (lookupError) {
        return jsonResponse({ ok: false, error: lookupError.message }, context.request, 500);
      }
      const known = new Set((found ?? []).map((r: { slug: string }) => r.slug));
      const unknown = slugs.filter((s) => !known.has(s));
      if (unknown.length > 0) {
        return jsonResponse({ ok: false, error: `Unknown tenant slugs: ${unknown.join(", ")}` }, context.request, 400);
      }
    }
    updates.test_tenant_slugs = slugs;
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse({ ok: false, error: "Nothing to update" }, context.request, 400);
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("mw_cleanup_config")
    .update(updates)
    .eq("id", 1)
    .select("enabled, retention_days, test_tenant_slugs, test_name_patterns, updated_at")
    .single();

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, context.request, 500);
  }

  return jsonResponse({ ok: true, config: data }, context.request);
};

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204 });
