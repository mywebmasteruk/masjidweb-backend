import type { APIRoute } from "astro";
import {
  formatCoreUpdateEmail,
  sendCoreUpdateEmail,
  type CoreUpdateEmailEvent,
} from "../../../lib/core-update-email";
import { readServerEnv } from "../../../lib/server-env";

const json = { "Content-Type": "application/json" } as const;

const ALLOWED_EVENTS = new Set<CoreUpdateEmailEvent>([
  "update_started",
  "update_prepared",
  "update_ready",
  "update_failed",
  "update_approved",
  "update_deployed",
  "operator_alert",
]);

export const POST: APIRoute = async (context) => {
  const secret = readServerEnv("CORE_UPDATE_NOTIFY_SECRET")?.trim();
  const provided = context.request.headers.get("x-core-update-notify-secret")?.trim();
  if (!secret || !provided || provided !== secret) {
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

  const email = formatCoreUpdateEmail(event, {
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
