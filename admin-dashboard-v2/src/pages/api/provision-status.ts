import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { getServiceSupabase } from "../../lib/supabase-server";

/**
 * Poll after POST /api/provision when `publishPending` is true: background publish
 * writes `provision_publish_step` to the audit log when done.
 */
export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(context.request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) {
    return new Response(
      JSON.stringify({ ok: false, error: "tenantId query parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = getServiceSupabase();
  const { data: tenant, error: tErr } = await supabase
    .from("tenant_registry")
    .select("id, status")
    .eq("id", tenantId)
    .maybeSingle();

  if (tErr || !tenant) {
    return new Response(JSON.stringify({ ok: false, error: "Tenant not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: auditRows } = await supabase
    .from("provisioning_audit_log")
    .select("action")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  const publishStepDone =
    auditRows?.some((r) => r.action === "provision_publish_step") ?? false;
  const publishFailed =
    auditRows?.some((r) => r.action === "provision_publish_background_failed") ??
    false;

  return new Response(
    JSON.stringify({
      ok: true,
      tenantId,
      status: tenant.status,
      publishStepDone,
      publishFailed,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
