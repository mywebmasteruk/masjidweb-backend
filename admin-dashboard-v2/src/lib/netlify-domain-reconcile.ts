import type { SupabaseClient } from "@supabase/supabase-js";
import { listDomainAliases, removeDomainAliases } from "./netlify-domains";
import { RESERVED_TENANT_SUBDOMAINS } from "./slug";

export interface DomainAliasReconcileInput {
  aliases: string[];
  tenantSlugs: string[];
  domainSuffix: string;
}

export interface DomainAliasReconcileResult {
  orphanAliases: string[];
  ownedAliases: string[];
  ignoredAliases: string[];
}

export interface DomainAliasCleanupPreview extends DomainAliasReconcileResult {
  tenantSlugs: string[];
  domainSuffix: string;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map(normalizeHostname).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function tenantSubdomainForAlias(alias: string, domainSuffix: string): string | null {
  const suffix = normalizeHostname(domainSuffix);
  const normalizedAlias = normalizeHostname(alias);
  const suffixWithDot = `.${suffix}`;

  if (!normalizedAlias.endsWith(suffixWithDot)) return null;

  const subdomain = normalizedAlias.slice(0, -suffixWithDot.length);
  if (!subdomain || subdomain.includes(".")) return null;
  return subdomain;
}

export function findOrphanTenantDomainAliases(
  input: DomainAliasReconcileInput,
): DomainAliasReconcileResult {
  const tenantSlugs = new Set(input.tenantSlugs.map(normalizeHostname));
  const orphanAliases: string[] = [];
  const ownedAliases: string[] = [];
  const ignoredAliases: string[] = [];

  for (const alias of uniqueSorted(input.aliases)) {
    const subdomain = tenantSubdomainForAlias(alias, input.domainSuffix);

    if (!subdomain || RESERVED_TENANT_SUBDOMAINS.has(subdomain)) {
      ignoredAliases.push(alias);
      continue;
    }

    if (tenantSlugs.has(subdomain)) {
      ownedAliases.push(alias);
    } else {
      orphanAliases.push(alias);
    }
  }

  return { orphanAliases, ownedAliases, ignoredAliases };
}

async function listTenantSlugs(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("tenant_registry")
    .select("slug")
    .not("slug", "is", null);

  if (error) {
    throw new Error(`Failed to list tenant slugs: ${error.message}`);
  }

  return uniqueSorted(
    (data ?? [])
      .map((row: { slug?: unknown }) => (typeof row.slug === "string" ? row.slug : ""))
      .filter(Boolean),
  );
}

export async function previewOrphanDomainAliases(args: {
  supabase: SupabaseClient;
  netlifyToken: string;
  siteId: string;
  domainSuffix: string;
}): Promise<DomainAliasCleanupPreview> {
  const [aliases, tenantSlugs] = await Promise.all([
    listDomainAliases(args.netlifyToken, args.siteId),
    listTenantSlugs(args.supabase),
  ]);

  return {
    ...findOrphanTenantDomainAliases({
      aliases,
      tenantSlugs,
      domainSuffix: args.domainSuffix,
    }),
    tenantSlugs,
    domainSuffix: normalizeHostname(args.domainSuffix),
  };
}

export async function cleanupOrphanDomainAliases(args: {
  supabase: SupabaseClient;
  netlifyToken: string;
  siteId: string;
  domainSuffix: string;
  aliases?: string[];
}): Promise<DomainAliasCleanupPreview & { removedAliases: string[]; skippedAliases: string[] }> {
  const preview = await previewOrphanDomainAliases(args);
  const allowed = new Set(preview.orphanAliases);
  const requested = args.aliases ? uniqueSorted(args.aliases) : preview.orphanAliases;
  const aliasesToRemove = requested.filter((alias) => allowed.has(alias));
  const skippedAliases = requested.filter((alias) => !allowed.has(alias));
  const removedAliases = await removeDomainAliases(args.netlifyToken, args.siteId, aliasesToRemove);

  return {
    ...preview,
    removedAliases: uniqueSorted(removedAliases),
    skippedAliases,
  };
}
