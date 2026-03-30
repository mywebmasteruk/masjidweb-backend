import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  assertEmailAvailableForNewTenant,
  DUPLICATE_EMAIL_MESSAGE,
  normalizeProvisioningEmail,
  ProvisionValidationError,
} from "./provision-email-policy";

function mockClient(rpcResult: { data: boolean | null; error: { message: string } | null }) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as unknown as SupabaseClient;
}

describe("normalizeProvisioningEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeProvisioningEmail("  Foo@BAR.com ")).toBe("foo@bar.com");
  });
});

describe("assertEmailAvailableForNewTenant", () => {
  it("resolves when RPC returns false", async () => {
    const sb = mockClient({ data: false, error: null });
    await expect(
      assertEmailAvailableForNewTenant(sb, "new@tenant.co.uk"),
    ).resolves.toBeUndefined();
    expect(sb.rpc).toHaveBeenCalledWith("tenant_registry_email_exists", {
      p_email: "new@tenant.co.uk",
    });
  });

  it("throws ProvisionValidationError when email is taken", async () => {
    const sb = mockClient({ data: true, error: null });
    await expect(assertEmailAvailableForNewTenant(sb, "taken@x.com")).rejects.toThrow(
      ProvisionValidationError,
    );
    await expect(assertEmailAvailableForNewTenant(sb, "taken@x.com")).rejects.toThrow(
      DUPLICATE_EMAIL_MESSAGE,
    );
  });

  it("throws ProvisionValidationError for empty email after normalize", async () => {
    const sb = mockClient({ data: false, error: null });
    await expect(assertEmailAvailableForNewTenant(sb, "   ")).rejects.toThrow(
      ProvisionValidationError,
    );
  });

  it("throws Error when RPC fails", async () => {
    const sb = mockClient({ data: null, error: { message: "rpc failed" } });
    await expect(assertEmailAvailableForNewTenant(sb, "a@b.co")).rejects.toThrow(
      /Could not verify email availability/,
    );
  });
});
