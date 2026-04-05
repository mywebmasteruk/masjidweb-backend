import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { isInternalProvisionRequest } from "../../lib/provision-internal-auth";
import { getServiceSupabase } from "../../lib/supabase-server";

/**
 * Lightweight status check for the provision polling loop.
 * Returns the current tenant status so the dashboard knows when phase 2 is done.
 */
export const GET: APIRoute = async (context) => {
  if (
    !(await isAuthorized(context)) &&
    !isInternalProvisionRequest(context.request)
  ) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tenantId = context.url.searchParams.get("tenantId");
  if (!tenantId) {
    return new Response(
      JSON.stringify({ ok: false, error: "tenantId is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = getServiceSupabase();
  const { data: tenant, error } = await supabase
    .from("tenant_registry")
    .select("id, slug, status")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return new Response(
      JSON.stringify({ ok: false, error: error?.message ?? "Not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Publish state comes from provisioning audit actions.
  // `provision_publish_step` => explicit phase-3 publish success.
  // `provision_complete` => legacy/full-flow completion where publish may be bundled.
  // `provision_publish_failed` => publish hard-failed.
  const { data: publishAuditRows } = await supabase
    .from("provisioning_audit_log")
    .select("action, created_at")
    .eq("tenant_id", tenantId)
    .in("action", [
      "provision_publish_step",
      "provision_publish_failed",
      "provision_complete",
    ])
    .order("created_at", { ascending: false })
    .limit(1);

  const latestPublishAction = publishAuditRows?.[0]?.action ?? null;
  const publishCompleted =
    latestPublishAction === "provision_publish_step" ||
    latestPublishAction === "provision_complete";
  const publishFailed = latestPublishAction === "provision_publish_failed";

  return new Response(
    JSON.stringify({
      ok: true,
      tenantId: tenant.id,
      slug: tenant.slug,
      status: tenant.status,
      active: tenant.status === "active",
      publishCompleted,
      publishFailed,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
