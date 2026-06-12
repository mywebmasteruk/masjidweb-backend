import type { APIRoute } from "astro";
import { isAdminPasswordMatch } from "../../../lib/admin-password";
import { adminLoginRateLimiter, getLoginClientKey } from "../../../lib/login-rate-limit";
import {
  checkPersistentLoginRateLimit,
  resetPersistentLoginRateLimit,
} from "../../../lib/login-rate-limit-persistent";
import { readServerEnv } from "../../../lib/server-env";
import { createSessionToken, serializeSessionCookie } from "../../../lib/session";
import { getServiceSupabase } from "../../../lib/supabase-server";

function tryGetServiceSupabase(): ReturnType<typeof getServiceSupabase> | null {
  try {
    return getServiceSupabase();
  } catch {
    return null;
  }
}

function tooManyAttemptsResponse(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ ok: false, error: "Too many login attempts" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds),
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const clientKey = getLoginClientKey(request);
    const limit = adminLoginRateLimiter.check(clientKey);
    if (!limit.allowed) {
      return tooManyAttemptsResponse(limit.retryAfterSeconds);
    }

    // Durable counter (survives serverless cold starts). Falls back to the
    // in-memory limiter above when the RPC/migration is unavailable.
    const supabase = tryGetServiceSupabase();
    if (supabase) {
      const persistent = await checkPersistentLoginRateLimit(supabase, clientKey);
      if (persistent && !persistent.allowed) {
        return tooManyAttemptsResponse(persistent.retryAfterSeconds);
      }
    }

    const contentType = request.headers.get("content-type") ?? "";
    let password = "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { password?: string };
      password = body.password ?? "";
    } else {
      const form = await request.formData();
      password = String(form.get("password") ?? "");
    }

    const expected = readServerEnv("DASHBOARD_ADMIN_PASSWORD");
    if (!isAdminPasswordMatch(expected, password)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const secret = readServerEnv("ADMIN_SESSION_SECRET");
    if (!secret || secret.length < 32) {
      return new Response(
        JSON.stringify({ ok: false, error: "Server misconfiguration: set ADMIN_SESSION_SECRET (min 32 characters)." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    adminLoginRateLimiter.reset(clientKey);
    if (supabase) {
      await resetPersistentLoginRateLimit(supabase, clientKey);
    }

    const token = await createSessionToken();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": serializeSessionCookie(token),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Login failed";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
