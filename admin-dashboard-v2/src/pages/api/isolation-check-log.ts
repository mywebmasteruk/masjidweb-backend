import type { APIRoute } from "astro";
import { isApiAuthorized } from "../../lib/api-auth";
import { jsonResponse } from "../../lib/api-cors";
import { isCoreUpdateNotifyAuthorized } from "../../lib/core-update-notify-auth";
import {
  insertIsolationCheckRun,
  listIsolationCheckRuns,
  parseIsolationCheckPayload,
} from "../../lib/isolation-check-log";

/** List recent daily tenant isolation check runs (platform overview). */
export const GET: APIRoute = async (context) => {
  if (!(await isApiAuthorized(context))) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, context.request, 401);
  }

  const limitRaw = context.url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitRaw) || 30, 1), 200);
  const rows = await listIsolationCheckRuns(limit);

  return jsonResponse({ ok: true, rows }, context.request);
};

/** GitHub Actions → record daily tenant isolation check result (pass or fail). */
export const POST: APIRoute = async (context) => {
  if (!isCoreUpdateNotifyAuthorized(context)) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, context.request, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, context.request, 400);
  }

  const parsed = parseIsolationCheckPayload(body);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, context.request, 400);
  }

  const row = await insertIsolationCheckRun(parsed.entry);
  if (!row) {
    return jsonResponse({ ok: false, error: "Failed to persist run" }, context.request, 500);
  }

  return jsonResponse({ ok: true, id: row.id }, context.request, 201);
};

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204 });
