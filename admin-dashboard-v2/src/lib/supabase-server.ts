import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

function envUrl(): string | undefined {
  return typeof process !== "undefined"
    ? process.env["SUPABASE_URL"]
    : undefined;
}

function envKey(): string | undefined {
  return typeof process !== "undefined"
    ? process.env["SUPABASE_SERVICE_ROLE_KEY"]
    : undefined;
}

export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = envUrl();
  const key = envKey();
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
