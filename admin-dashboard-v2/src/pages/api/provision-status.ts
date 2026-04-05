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

  return new Response(
    JSON.stringify({
      ok: true,
      tenantId: tenant.id,
      slug: tenant.slug,
      status: tenant.status,
      active: tenant.status === "active",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
