/**
 * Subdomains that must never become tenant slugs: they collide with platform
 * hosts (admin dashboard, master builder) or standard service names.
 * Also consumed by netlify-domain-reconcile.ts (alias cleanup skips these).
 */
export const RESERVED_TENANT_SUBDOMAINS = new Set([
  "admin",
  "api",
  "ftp",
  "mail",
  "manage",
  "tenants",
  "www",
]);

export function isReservedTenantSlug(slug: string): boolean {
  return RESERVED_TENANT_SUBDOMAINS.has(slug.toLowerCase());
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
