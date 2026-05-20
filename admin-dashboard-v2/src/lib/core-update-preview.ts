/**
 * Deploy-preview tenant selection for safe core updates (Maintenance UI).
 */
export const DEFAULT_CORE_UPDATE_PREVIEW_TENANT_SLUG = "masjidemo1" as const;

export const DEFAULT_CORE_UPDATE_PREVIEW_TENANT_LABEL = "MasjidDemo1";

export const CORE_UPDATE_PREVIEW_TENANT_STORAGE_KEY = "mw_core_update_preview_tenant_slug";

export type PreviewTenantContext = {
  slug: string;
  email?: string | null;
  businessName?: string | null;
};

export type CoreUpdatePreviewLinks = {
  tenantSlug: string;
  tenantLabel: string;
  deployPreviewRoot: string | null;
  builderOnPreview: string | null;
  publicSiteOnPreview: string | null;
  /** Live production host — still on `main`, not the PR branch. */
  productionBuilderUrl: string;
  productionPublicUrl: string;
  loginEmailHint: string;
};

function tenantDomainSuffix(): string {
  return (
    import.meta.env?.TENANT_DOMAIN_SUFFIX?.trim() ||
    (typeof process !== "undefined" ? process.env.TENANT_DOMAIN_SUFFIX?.trim() : undefined) ||
    "masjidweb.com"
  );
}

export function getCoreUpdatePreviewTenantSlug(): string {
  const fromEnv =
    import.meta.env?.PREVIEW_TENANT_SLUG?.trim() ||
    (typeof process !== "undefined" ? process.env.PREVIEW_TENANT_SLUG?.trim() : undefined);
  return fromEnv || DEFAULT_CORE_UPDATE_PREVIEW_TENANT_SLUG;
}

export function formatCoreUpdatePreviewTenantLabel(
  slug: string,
  businessName?: string | null,
): string {
  if (slug === DEFAULT_CORE_UPDATE_PREVIEW_TENANT_SLUG) {
    return DEFAULT_CORE_UPDATE_PREVIEW_TENANT_LABEL;
  }
  const name = businessName?.trim();
  return name ? `${name} (${slug})` : slug;
}

export function previewLoginEmailHint(
  slug: string,
  email?: string | null,
): string {
  const trimmed = email?.trim();
  if (trimmed) return trimmed;
  return `${slug}@${tenantDomainSuffix()}`;
}

export function buildCoreUpdatePreviewLinks(
  deployPreviewUrl: string | null,
  tenant?: PreviewTenantContext | null,
): CoreUpdatePreviewLinks {
  const tenantSlug = tenant?.slug?.trim() || getCoreUpdatePreviewTenantSlug();
  const tenantLabel = formatCoreUpdatePreviewTenantLabel(
    tenantSlug,
    tenant?.businessName,
  );
  const suffix = tenantDomainSuffix();
  const root = deployPreviewUrl?.replace(/\/$/, "") || null;

  return {
    tenantSlug,
    tenantLabel,
    deployPreviewRoot: root,
    builderOnPreview: root ? `${root}/ycode` : null,
    publicSiteOnPreview: root,
    productionBuilderUrl: `https://${tenantSlug}.${suffix}/ycode`,
    productionPublicUrl: `https://${tenantSlug}.${suffix}/`,
    loginEmailHint: previewLoginEmailHint(tenantSlug, tenant?.email),
  };
}
