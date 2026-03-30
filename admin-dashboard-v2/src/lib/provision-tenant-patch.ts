import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After server-side publish, some `is_published = true` snapshots may have
 * `tenant_id` null (JWT default not applied). Copy `tenant_id` from the draft
 * sibling (`is_published = false`) for the same primary `id`.
 */
export async function patchNullTenantIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<void> {
  const tables = [
    "collection_items",
    "collection_item_values",
    "collections",
    "collection_fields",
    "pages",
    "page_layers",
    "components",
    "layer_styles",
    "locales",
    "fonts",
    "assets",
    "asset_folders",
  ] as const;

  for (const table of tables) {
    await patchTablePublishedFromDraft(supabase, table, tenantId);
  }
}

async function patchTablePublishedFromDraft(
  supabase: SupabaseClient,
  table: string,
  tenantId: string,
): Promise<void> {
  const { data: draftIds, error: selErr } = await supabase
    .from(table)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_published", false);

  if (selErr || !draftIds?.length) return;

  const ids = draftIds.map((r) => r.id as string);
  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    await supabase
      .from(table)
      .update({ tenant_id: tenantId })
      .eq("is_published", true)
      .is("tenant_id", null)
      .in("id", slice);
  }
}
