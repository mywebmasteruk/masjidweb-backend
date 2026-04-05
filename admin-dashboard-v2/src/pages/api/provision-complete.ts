import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { isInternalProvisionRequest } from "../../lib/provision-internal-auth";
import { completeProvision } from "../../lib/provision-pipeline";

/**
 * Phase 2 — clone template + CMS seed + invite + activate.
 *
 * This can take 60-120 s and will gateway-timeout (502/504) on the client side.
 * The Netlify Lambda continues running until it completes.
 * The dashboard does NOT wait for this response; it polls /api/provision-status
 * instead and proceeds to phase 3 once the tenant is active.
 *
 * Returns 200 when complete (rarely seen by client), 202 should the function
 * detect it is already queued, or 500 on hard failure.
 */
export const POST: APIRoute = async (context) => {
  if (
    !(await isAuthorized(context)) &&
    !isInternalProvisionRequest(context.request)
  ) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { tenantId?: string };
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.tenantId) {
    return new Response(
      JSON.stringify({ ok: false, error: "tenantId is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const result = await completeProvision(body.tenantId, "dashboard-v2");
    return new Response(
      JSON.stringify({ ok: true, warnings: result.warnings }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack ?? "" : "";
    // Persist error to audit log so we can diagnose crashes even when Netlify
    // swallows the response with a generic "unknown error".
    try {
      const { getServiceSupabase } = await import("../../lib/supabase-server");
      await getServiceSupabase().from("provisioning_audit_log").insert({
        tenant_id: body.tenantId,
        action: "provision_complete_api_error",
        actor: "dashboard-v2",
        details: { error: message, stack: stack.slice(0, 2000) },
      });
    } catch { /* best-effort logging */ }
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
