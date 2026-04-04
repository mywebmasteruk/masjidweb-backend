import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { isInternalProvisionRequest } from "../../lib/provision-internal-auth";
import { ProvisionPublishConfigError } from "../../lib/provision-publish";
import {
  completeProvision,
  publishTenantAfterProvision,
} from "../../lib/provision-pipeline";

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
    const warnings = [...result.warnings];

    /**
     * Run auto-publish in the same function invocation as phase 2 (seed, invite, activate).
     * This avoids a second Netlify cold start and cuts 504s between /provision-complete
     * and /provision-publish-tenant. Publish failures are warnings when phase 2 succeeded.
     */
    try {
      const pub = await publishTenantAfterProvision(
        body.tenantId,
        "dashboard-v2",
      );
      warnings.push(...pub.warnings);
    } catch (pubErr) {
      if (pubErr instanceof ProvisionPublishConfigError) {
        warnings.push(
          `Publish: ${pubErr.message} Set the same PROVISIONING_WEBHOOK_SECRET (16+ chars) on this dashboard and the YCode Netlify site, and set YCODE_SITE_INTERNAL_URL to the pool hostname (e.g. https://your-site.netlify.app) so publish does not depend on new subdomain TLS.`,
        );
      } else {
        const msg =
          pubErr instanceof Error ? pubErr.message : String(pubErr);
        warnings.push(
          `Publish: ${msg} The tenant is active — open the builder on their subdomain and click Publish, or use Continue setup to retry.`,
        );
      }
    }

    return new Response(JSON.stringify({ ok: true, warnings }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
