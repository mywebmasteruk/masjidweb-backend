import { describe, expect, it } from "vitest";
import {
  buildCoreUpdatePreviewLinks,
  DEFAULT_CORE_UPDATE_PREVIEW_TENANT_SLUG,
  formatCoreUpdatePreviewTenantLabel,
  getCoreUpdatePreviewTenantSlug,
  previewLoginEmailHint,
} from "./core-update-preview";

describe("core-update-preview", () => {
  it("defaults preview tenant to masjidemo1", () => {
    expect(getCoreUpdatePreviewTenantSlug()).toBe(DEFAULT_CORE_UPDATE_PREVIEW_TENANT_SLUG);
  });

  it("builds MasjidDemo1 preview and production URLs", () => {
    const links = buildCoreUpdatePreviewLinks(
      "https://deploy-preview-2--masjidweb-tenants.netlify.app/",
    );

    expect(links.tenantSlug).toBe("masjidemo1");
    expect(links.tenantLabel).toBe("MasjidDemo1");
    expect(links.builderOnPreview).toBe(
      "https://deploy-preview-2--masjidweb-tenants.netlify.app/ycode",
    );
    expect(links.productionBuilderUrl).toBe("https://masjidemo1.masjidweb.com/ycode");
    expect(links.loginEmailHint).toBe("masjidemo1@masjidweb.com");
  });

  it("uses registry email and business name for a custom tenant", () => {
    const links = buildCoreUpdatePreviewLinks(
      "https://deploy-preview-2--masjidweb-tenants.netlify.app",
      {
        slug: "acme-masjid",
        email: "admin@acmemasjid.org",
        businessName: "Acme Masjid",
      },
    );

    expect(links.tenantSlug).toBe("acme-masjid");
    expect(links.tenantLabel).toBe("Acme Masjid (acme-masjid)");
    expect(links.loginEmailHint).toBe("admin@acmemasjid.org");
    expect(links.productionBuilderUrl).toBe("https://acme-masjid.masjidweb.com/ycode");
  });

  it("formats labels and login hints", () => {
    expect(formatCoreUpdatePreviewTenantLabel("masjidemo1")).toBe("MasjidDemo1");
    expect(formatCoreUpdatePreviewTenantLabel("other", "Other Org")).toBe(
      "Other Org (other)",
    );
    expect(previewLoginEmailHint("other")).toBe("other@masjidweb.com");
    expect(previewLoginEmailHint("other", "x@y.com")).toBe("x@y.com");
  });
});
