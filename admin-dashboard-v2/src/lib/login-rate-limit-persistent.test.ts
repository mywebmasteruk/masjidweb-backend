import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkPersistentLoginRateLimit,
  resetPersistentLoginRateLimit,
} from "./login-rate-limit-persistent";

function supabaseWithRpc(rpc: ReturnType<typeof vi.fn>): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

describe("checkPersistentLoginRateLimit", () => {
  it("allows when the RPC reports allowed", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0 }],
      error: null,
    });

    const result = await checkPersistentLoginRateLimit(supabaseWithRpc(rpc), "203.0.113.7");

    expect(result).toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledWith("admin_login_rate_check", {
      p_client_key: "203.0.113.7",
      p_max_attempts: 5,
      p_window_seconds: 900,
    });
  });

  it("blocks with retry-after when the RPC reports blocked", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: false, retry_after_seconds: 321 }],
      error: null,
    });

    const result = await checkPersistentLoginRateLimit(supabaseWithRpc(rpc), "203.0.113.7");

    expect(result).toEqual({ allowed: false, retryAfterSeconds: 321 });
  });

  it("fails open (null) when the RPC errors, e.g. migration not applied", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "function admin_login_rate_check does not exist" },
    });

    expect(await checkPersistentLoginRateLimit(supabaseWithRpc(rpc), "x")).toBeNull();
  });

  it("fails open (null) when the RPC throws", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network down"));

    expect(await checkPersistentLoginRateLimit(supabaseWithRpc(rpc), "x")).toBeNull();
  });

  it("fails open (null) on a malformed RPC response", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{}], error: null });

    expect(await checkPersistentLoginRateLimit(supabaseWithRpc(rpc), "x")).toBeNull();
  });
});

describe("resetPersistentLoginRateLimit", () => {
  it("calls the reset RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await resetPersistentLoginRateLimit(supabaseWithRpc(rpc), "203.0.113.7");

    expect(rpc).toHaveBeenCalledWith("admin_login_rate_reset", {
      p_client_key: "203.0.113.7",
    });
  });

  it("swallows RPC failures", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(
      resetPersistentLoginRateLimit(supabaseWithRpc(rpc), "x"),
    ).resolves.toBeUndefined();
  });
});
