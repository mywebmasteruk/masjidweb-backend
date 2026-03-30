import { describe, expect, it, vi } from "vitest";
import {
  coerceTenantAdminEmailToSuffix,
  resolvePlaceholderProvisioningEmail,
} from "./provision-email";

describe("resolvePlaceholderProvisioningEmail", () => {
  it("returns trimmed email when local part is not an x-only placeholder", () => {
    expect(resolvePlaceholderProvisioningEmail("  Admin@Example.COM  ")).toBe("Admin@Example.COM");
  });

  it("replaces xxx@domain with demo-{hex12}@domain", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeffffffff",
    );
    expect(resolvePlaceholderProvisioningEmail("xxx@mywebmaster.co.uk")).toBe(
      "demo-aaaaaaaabbbb@mywebmaster.co.uk",
    );
  });

  it("rejects short xx local (no replacement)", () => {
    expect(resolvePlaceholderProvisioningEmail("xx@a.co")).toBe("xx@a.co");
  });
});

describe("coerceTenantAdminEmailToSuffix", () => {
  it("keeps email when domain already matches suffix", () => {
    expect(
      coerceTenantAdminEmailToSuffix("owner@masjidweb.com", "foo", "masjidweb.com"),
    ).toEqual({ email: "owner@masjidweb.com", coerced: false });
  });

  it("uses slug@suffix when domain differs", () => {
    expect(
      coerceTenantAdminEmailToSuffix("owner@gmail.com", "my-masjid", "masjidweb.com"),
    ).toEqual({ email: "my-masjid@masjidweb.com", coerced: true });
  });

  it("uses slug@suffix when input empty", () => {
    expect(coerceTenantAdminEmailToSuffix("", "bar", "masjidweb.com")).toEqual({
      email: "bar@masjidweb.com",
      coerced: false,
    });
  });
});
