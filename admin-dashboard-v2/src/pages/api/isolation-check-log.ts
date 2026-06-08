import type { APIRoute } from "astro";
import { isCoreUpdateNotifyAuthorized } from "../../lib/core-update-notify-auth";
import {
  insertIsolationCheckRun,
  parseIsolationCheckPayload,
} from "../../lib/isolation-check-log";

const json = { "Content-Type": "application/json" } as const;

/** GitHub Actions → record daily tenant isolation check result (pass or fail). */
export const POST: APIRoute = async (context) => {
  if (!isCoreUpdateNotifyAuthorized(context)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: json,
    });
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: json,
    });
  }

  const parsed = parseIsolationCheckPayload(body);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ ok: false, error: parsed.error }), {
      status: 400,
      headers: json,
    });
  }

  const row = await insertIsolationCheckRun(parsed.entry);
  if (!row) {
    return new Response(JSON.stringify({ ok: false, error: "Failed to persist run" }), {
      status: 500,
      headers: json,
    });
  }

  return new Response(JSON.stringify({ ok: true, id: row.id }), {
    status: 201,
    headers: json,
  });
};
