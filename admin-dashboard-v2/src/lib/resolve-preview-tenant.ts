import {
  DEFAULT_CORE_UPDATE_PREVIEW_TENANT_SLUG,
  getCoreUpdatePreviewTenantSlug,
  type PreviewTenantContext,
} from "./core-update-preview";
import { getServiceSupabase } from "./supabase-server";

export type PreviewTenantOption = PreviewTenantContext & {
  status: string;
};

export async function resolvePreviewTenantContext(
  requestedSlug?: string | null,
): Promise<PreviewTenantContext> {
  const slug = requestedSlug?.trim() || getCoreUpdatePreviewTenantSlug();
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("tenant_registry")
    .select("slug, email, business_name")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data?.slug) {
    return { slug };
  }

  return {
    slug: data.slug,
    email: data.email,
    businessName: data.business_name,
  };
}

export async function listActivePreviewTenantOptions(): Promise<PreviewTenantOption[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("tenant_registry")
    .select("slug, email, business_name, status")
    .eq("status", "active")
    .order("slug", { ascending: true });

  if (error || !data) return [];

  const rows = data.filter((row) => typeof row.slug === "string" && row.slug.length > 0);
  rows.sort((a, b) => {
    if (a.slug === DEFAULT_CORE_UPDATE_PREVIEW_TENANT_SLUG) return -1;
    if (b.slug === DEFAULT_CORE_UPDATE_PREVIEW_TENANT_SLUG) return 1;
    const an = (a.business_name || a.slug).toLowerCase();
    const bn = (b.business_name || b.slug).toLowerCase();
    return an.localeCompare(bn);
  });

  return rows.map((row) => ({
    slug: row.slug,
    email: row.email,
    businessName: row.business_name,
    status: row.status,
  }));
}
