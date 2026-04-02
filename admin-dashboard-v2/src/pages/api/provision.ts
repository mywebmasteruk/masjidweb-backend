import type { APIRoute } from "astro";
import { ZodError } from "zod";
import { isAuthorized } from "../../lib/auth-helpers";
import { ProvisionValidationError } from "../../lib/provision-email-policy";
import {
  completeProvision,
  publishTenantAfterProvision,
  startProvision,
} from "../../lib/provision-pipeline";
import { getServiceSupabase } from "../../lib/supabase-server";

type NetlifyLocals = {
  netlify?: { context?: { waitUntil?: (p: Promise<unknown>) => void } };
};

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
    const warnings = [...result.warnings];
    let needsCompletion = result.needsCompletion;
    let publishPending = false;

    if (result.needsCompletion && result.tenantId) {
      try {
        const p2 = await completeProvision(result.tenantId, "dashboard-v2");
        warnings.push(...p2.warnings);
        needsCompletion = false;

        const locals = context.locals as NetlifyLocals;
        const waitUntil = locals.netlify?.context?.waitUntil;

        const tenantId = result.tenantId;
        const runPublish = () =>
          publishTenantAfterProvision(tenantId, "dashboard-v2");

        if (typeof waitUntil === "function") {
          publishPending = true;
          waitUntil(
            runPublish().catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              return getServiceSupabase()
                .from("provisioning_audit_log")
                .insert({
                  tenant_id: tenantId,
                  action: "provision_publish_background_failed",
                  actor: "dashboard-v2",
                  details: { error: msg },
                });
            }),
          );
          warnings.push(
            "Publishing is completing in the background (often 1–2 minutes). Refresh the list or open the site if content is not live yet.",
          );
        } else {
          try {
            const p3 = await runPublish();
            warnings.push(...p3.warnings);
          } catch (pubErr) {
            const msg =
              pubErr instanceof Error ? pubErr.message : String(pubErr);
            warnings.push(`Publish step: ${msg}`);
          }
        }
      } catch (phase2Err) {
        const message =
          phase2Err instanceof Error ? phase2Err.message : String(phase2Err);
        return new Response(
          JSON.stringify({
            ok: false,
            error: message,
            tenantId: result.tenantId,
            slug: result.slug,
            siteUrl: result.siteUrl,
            warnings,
            needsCompletion: true,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        tenantId: result.tenantId,
        slug: result.slug,
        siteUrl: result.siteUrl,
        warnings,
        needsCompletion,
        publishPending,
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
