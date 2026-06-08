import type { APIRoute } from "astro";
import { isCoreUpdateNotifyAuthorized } from "../../../lib/core-update-notify-auth";
import {
  formatCoreUpdateEmail,
  formatTenantIsolationFailureEmail,
  sendCoreUpdateEmail,
  type CoreUpdateEmailEvent,
} from "../../../lib/core-update-email";

const json = { "Content-Type": "application/json" } as const;

const ALLOWED_EVENTS = new Set<CoreUpdateEmailEvent>([
  "update_started",
  "update_prepared",
  "update_ready",
  "update_failed",
  "update_approved",
  "update_deployed",
  "operator_alert",
  "tenant_isolation_failed",
]);

export const POST: APIRoute = async (context) => {
  if (!isCoreUpdateNotifyAuthorized(context)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: json,
    });
  }

  let body: {
    event?: string;
    message?: string;
    prNumber?: number;
    prUrl?: string;
    previewUrl?: string;
    workflowName?: string;
    runUrl?: string;
    branch?: string;
    commitSha?: string;
    failureOutput?: string;
    summary?: string;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: json,
    });
  }

  const event = body.event as CoreUpdateEmailEvent;
  if (!event || !ALLOWED_EVENTS.has(event)) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid event" }), {
      status: 400,
      headers: json,
    });
  }

  const email =
    event === "tenant_isolation_failed"
      ? formatTenantIsolationFailureEmail({
          workflowName:
            typeof body.workflowName === "string" && body.workflowName.trim()
              ? body.workflowName.trim()
              : "Daily tenant isolation check",
          runUrl: typeof body.runUrl === "string" ? body.runUrl : "",
          branch: typeof body.branch === "string" ? body.branch : "unknown",
          commitSha: typeof body.commitSha === "string" ? body.commitSha : "unknown",
          failureOutput:
            typeof body.failureOutput === "string" && body.failureOutput.trim()
              ? body.failureOutput
              : typeof body.message === "string"
                ? body.message
                : "(no failure output provided — open the Actions run for logs)",
          summary: typeof body.summary === "string" ? body.summary : undefined,
        })
      : formatCoreUpdateEmail(event, {
          message: typeof body.message === "string" ? body.message : undefined,
          prNumber: typeof body.prNumber === "number" ? body.prNumber : null,
          prUrl: typeof body.prUrl === "string" ? body.prUrl : null,
          previewUrl: typeof body.previewUrl === "string" ? body.previewUrl : null,
        });

  const result = await sendCoreUpdateEmail(email);
  return new Response(
    JSON.stringify({
      ok: true,
      emailSent: result.sent,
      emailReason: result.reason ?? null,
    }),
    { headers: json },
  );
};
