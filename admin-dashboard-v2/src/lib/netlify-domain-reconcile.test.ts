import { describe, expect, it } from "vitest";
import { findOrphanTenantDomainAliases } from "./netlify-domain-reconcile";

describe("findOrphanTenantDomainAliases", () => {
  it("flags tenant-suffix aliases with no matching tenant slug", () => {
    const result = findOrphanTenantDomainAliases({
      aliases: [
        "masjidweb-admin-v2.netlify.app",
        "admin.masjidweb.com",
        "masjidemo1.masjidweb.com",
        "deletedtenant.masjidweb.com",
        "Example.COM",
      ],
      tenantSlugs: ["masjidemo1"],
      domainSuffix: "masjidweb.com",
    });

    expect(result.orphanAliases).toEqual(["deletedtenant.masjidweb.com"]);
    expect(result.ownedAliases).toEqual(["masjidemo1.masjidweb.com"]);
  });

  it("keeps aliases for all existing tenants regardless of status or kind", () => {
    const result = findOrphanTenantDomainAliases({
      aliases: [
        "active.masjidweb.com",
        "deactivated.masjidweb.com",
        "failed.masjidweb.com",
        "template.masjidweb.com",
      ],
      tenantSlugs: ["active", "deactivated", "failed", "template"],
      domainSuffix: "masjidweb.com",
    });

    expect(result.orphanAliases).toEqual([]);
    expect(result.ownedAliases).toEqual([
      "active.masjidweb.com",
      "deactivated.masjidweb.com",
      "failed.masjidweb.com",
      "template.masjidweb.com",
    ]);
  });

  it("ignores reserved and non-tenant aliases", () => {
    const result = findOrphanTenantDomainAliases({
      aliases: [
        "admin.masjidweb.com",
        "www.masjidweb.com",
        "api.masjidweb.com",
        "mail.masjidweb.com",
        "ftp.masjidweb.com",
        "tenants.masjidweb.com",
        "client.otherdomain.com",
      ],
      tenantSlugs: [],
      domainSuffix: "masjidweb.com",
    });

    expect(result.orphanAliases).toEqual([]);
    expect(result.ignoredAliases.sort()).toEqual([
      "admin.masjidweb.com",
      "api.masjidweb.com",
      "client.otherdomain.com",
      "ftp.masjidweb.com",
      "mail.masjidweb.com",
      "tenants.masjidweb.com",
      "www.masjidweb.com",
    ]);
  });

  it("deduplicates case-insensitively and returns aliases sorted", () => {
    const result = findOrphanTenantDomainAliases({
      aliases: [
        "zeta.masjidweb.com",
        "Alpha.masjidweb.com",
        "alpha.masjidweb.com",
      ],
      tenantSlugs: [],
      domainSuffix: "MasjidWeb.com",
    });

    expect(result.orphanAliases).toEqual([
      "alpha.masjidweb.com",
      "zeta.masjidweb.com",
    ]);
  });
});
