import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoginRateLimitResult } from "./login-rate-limit";

export const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
export const ADMIN_LOGIN_WINDOW_SECONDS = 15 * 60;

type RateCheckRow = { allowed: boolean; retry_after_seconds: number };

/**
 * Durable rate check backed by the `admin_login_rate_check` RPC
 * (migration 20260610120000_admin_login_rate_limit.sql). Netlify functions are
 * stateless, so the in-memory limiter alone resets on every cold start.
 *
 * Fails open (`null`) when the RPC is missing or Supabase is unreachable so a
 * pending migration or outage can never lock the operator out of the dashboard;
 * the caller keeps the in-memory limiter as a second line.
 */
export async function checkPersistentLoginRateLimit(
  supabase: SupabaseClient,
  clientKey: string,
): Promise<LoginRateLimitResult | null> {
  try {
    const { data, error } = await supabase.rpc("admin_login_rate_check", {
      p_client_key: clientKey,
      p_max_attempts: ADMIN_LOGIN_MAX_ATTEMPTS,
      p_window_seconds: ADMIN_LOGIN_WINDOW_SECONDS,
    });
    if (error) return null;

    const row: RateCheckRow | undefined = Array.isArray(data) ? data[0] : data ?? undefined;
    if (!row || typeof row.allowed !== "boolean") return null;

    if (row.allowed) return { allowed: true };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 1),
    };
  } catch {
    return null;
  }
}

/** Clear the durable counter after a successful login. Best-effort. */
export async function resetPersistentLoginRateLimit(
  supabase: SupabaseClient,
  clientKey: string,
): Promise<void> {
  try {
    await supabase.rpc("admin_login_rate_reset", { p_client_key: clientKey });
  } catch {
    /* best-effort */
  }
}
