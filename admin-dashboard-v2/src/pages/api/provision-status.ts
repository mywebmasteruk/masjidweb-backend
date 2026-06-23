import type { APIRoute } from "astro";
import { isApiAuthorized } from "../../lib/api-auth";
import { jsonResponse } from "../../lib/api-cors";
import { isInternalProvisionRequest } from "../../lib/provision-internal-auth";
import { getServiceSupabase } from "../../lib/supabase-server";

/**
 * Lightweight status check for the provision polling loop.
 * Returns the current tenant status so the dashboard knows when phase 2 is done.
 */
export const GET: APIRoute = async (context) => {
  if (
    !(await isApiAuthorized(context)) &&
    !isInternalProvisionRequest(context.request)
  ) {
    return jsonResponse({ error: "Unauthorized" }, context.request, 401);
  }

  const tenantId = context.url.searchParams.get("tenantId");
  if (!tenantId) {
    return jsonResponse({ ok: false, error: "tenantId is required" }, context.request, 400);
  }

  const supabase = getServiceSupabase();
  const { data: tenant, error } = await supabase
    .from("tenant_registry")
    .select("id, slug, status")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return jsonResponse({ ok: false, error: error?.message ?? "Not found" }, context.request, 404);
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

  return jsonResponse(
    {
      ok: true,
      tenantId: tenant.id,
      slug: tenant.slug,
      status: tenant.status,
      active: tenant.status === "active",
      publishCompleted,
      publishFailed,
    },
    context.request,
  );
};

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204 });
