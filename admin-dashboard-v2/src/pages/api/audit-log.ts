import type { APIRoute } from "astro";
import { isApiAuthorized } from "../../lib/api-auth";
import { jsonResponse } from "../../lib/api-cors";
import { getServiceSupabase } from "../../lib/supabase-server";

export const GET: APIRoute = async (context) => {
  if (!(await isApiAuthorized(context))) {
    return jsonResponse({ error: "Unauthorized" }, context.request, 401);
  }

  const limitRaw = context.url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitRaw) || 100, 1), 500);
  const tenantId = context.url.searchParams.get("tenantId");

  const supabase = getServiceSupabase();
  let query = supabase
    .from("provisioning_audit_log")
    .select("id, tenant_id, action, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) {
    return jsonResponse({ ok: false, error: error.message }, context.request, 500);
  }

  return jsonResponse({ ok: true, rows: data ?? [] }, context.request);
};

export const DELETE: APIRoute = async (context) => {
  if (!(await isApiAuthorized(context))) {
    return jsonResponse({ error: "Unauthorized" }, context.request, 401);
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("provisioning_audit_log")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    return jsonResponse({ error: error.message }, context.request, 500);
  }

  return jsonResponse({ ok: true }, context.request);
};

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204 });
