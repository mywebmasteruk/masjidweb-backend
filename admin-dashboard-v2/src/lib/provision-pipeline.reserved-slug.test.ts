import { describe, expect, it } from "vitest";
import { startProvision } from "./provision-pipeline";
import { isReservedTenantSlug, RESERVED_TENANT_SUBDOMAINS } from "./slug";

const baseInput = {
  business_name: "Test Masjid",
  email: "owner@example.com",
  source_template_tenant_id: "11111111-2222-3333-4444-555555555555",
};

describe("reserved tenant slugs", () => {
  it("includes the platform hosts", () => {
    expect(RESERVED_TENANT_SUBDOMAINS.has("admin")).toBe(true);
    expect(RESERVED_TENANT_SUBDOMAINS.has("manage")).toBe(true);
    expect(RESERVED_TENANT_SUBDOMAINS.has("www")).toBe(true);
    expect(isReservedTenantSlug("Admin")).toBe(true);
    expect(isReservedTenantSlug("masjid-alnoor")).toBe(false);
  });

  it("startProvision rejects an explicit reserved slug before any side effects", async () => {
    await expect(
      startProvision({ ...baseInput, slug: "admin" }, "test-operator"),
    ).rejects.toThrow('Slug "admin" is a reserved platform subdomain');
  });

  it("startProvision rejects a business name that slugifies to a reserved subdomain", async () => {
    await expect(
      startProvision({ ...baseInput, business_name: "Manage" }, "test-operator"),
    ).rejects.toThrow('Slug "manage" is a reserved platform subdomain');
  });
});
