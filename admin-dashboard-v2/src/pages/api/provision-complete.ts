import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { isInternalProvisionRequest } from "../../lib/provision-internal-auth";
import { completeProvision } from "../../lib/provision-pipeline";

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
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
