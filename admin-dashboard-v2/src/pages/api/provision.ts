import type { APIRoute } from "astro";
import { ZodError } from "zod";
import { isAuthorized } from "../../lib/auth-helpers";
import { ProvisionValidationError } from "../../lib/provision-email-policy";
import { startProvision } from "../../lib/provision-pipeline";

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await startProvision(body, "dashboard-v2");
    return new Response(
      JSON.stringify({
        ok: true,
        tenantId: result.tenantId,
        slug: result.slug,
        siteUrl: result.siteUrl,
        warnings: result.warnings,
        needsCompletion: result.needsCompletion,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    if (e instanceof ZodError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: e.flatten().fieldErrors,
          message: e.message,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (e instanceof ProvisionValidationError) {
      return new Response(
        JSON.stringify({ ok: false, error: e.message, message: e.message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes("parse") || message.includes("Required") ? 400 : 500;
    return new Response(JSON.stringify({ ok: false, error: message, message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
};
