/**
 * Canonical **primary** demo template tenant UUID (MasjidDemo1 / `masjidemo1.*`).
 * Netlify env `TEMPLATE_TENANT_ID` should match this UUID for provisioning and template editing.
 *
 * Additional demos: set `tenant_kind = 'template'` on other `tenant_registry` rows
 * and pick one when provisioning a **client** (`tenant_kind = 'client'`).
 */

export const DEFAULT_TEMPLATE_TENANT_ID =
  "2fff887d-a78e-4256-9116-6e02fe38c614" as const;

export function getTemplateTenantId(): string {
  return (
    import.meta.env?.TEMPLATE_TENANT_ID ??
    (typeof process !== "undefined" ? process.env.TEMPLATE_TENANT_ID : undefined) ??
    DEFAULT_TEMPLATE_TENANT_ID
  );
}
