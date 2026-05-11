import type { SupabaseClient } from "@supabase/supabase-js";
import { DRAFT_PUBLISHED_PATCH_TABLES } from "./tenant-clone-manifest";

/**
 * After server-side publish, some `is_published = true` snapshots may have
 * `tenant_id` null (JWT default not applied). Copy `tenant_id` from the draft
 * sibling (`is_published = false`) for the same primary `id`.
 *
 * Table list: `DRAFT_PUBLISHED_PATCH_TABLES` in `tenant-clone-manifest.ts`.
 */
export async function patchNullTenantIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<void> {
  for (const table of DRAFT_PUBLISHED_PATCH_TABLES) {
    await patchTablePublishedFromDraft(supabase, table, tenantId);
  }
}

/**
 * After clone + CMS seed (all draft), create published snapshots by reading
 * each table's draft rows and inserting `is_published = true` copies.
 *
 * Processed one table at a time so peak Lambda memory stays manageable.
 * Idempotent: skips tables that already have published rows for this tenant.
 *
 * Tables with special handling:
 *   - `collections` → `uuid` column must be globally unique (new uuid per published copy)
 *   - `collection_item_values` / `translations` → `id` must be unique per row
 */
export async function publishDraftRowsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<void> {
  for (const table of DRAFT_PUBLISHED_PATCH_TABLES) {
    await copyDraftToPublishedForTable(supabase, table, tenantId);
  }
}

const TABLES_NEEDING_NEW_UUID_COL = new Set(["collections"]);
const TABLES_NEEDING_NEW_ROW_ID = new Set([
  "collection_item_values",
  "translations",
]);
const CHUNK = 200;

async function copyDraftToPublishedForTable(
  supabase: SupabaseClient,
  table: string,
  tenantId: string,
): Promise<void> {
  const { count, error: cntErr } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_published", true);
  if (cntErr) return;
  if ((count ?? 0) > 0) return;

  const { count: draftCount } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_published", false);
  if (!draftCount) return;

  let offset = 0;
  while (true) {
    const { data: drafts, error: readErr } = await supabase
      .from(table)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_published", false)
      .range(offset, offset + CHUNK - 1);

    if (readErr) throw new Error(`publishDraft read ${table}: ${readErr.message}`);
    if (!drafts?.length) break;

    const published = drafts.map((row: Record<string, unknown>) => {
      const copy: Record<string, unknown> = { ...row, is_published: true };
      delete copy.content_hash;
      if (TABLES_NEEDING_NEW_UUID_COL.has(table) && "uuid" in copy) {
        copy.uuid = crypto.randomUUID();
      }
      if (TABLES_NEEDING_NEW_ROW_ID.has(table)) {
        copy.id = crypto.randomUUID();
      }
      return copy;
    });

    const { error: insErr } = await supabase.from(table).insert(published);
    if (insErr) throw new Error(`publishDraft insert ${table}: ${insErr.message}`);

    if (drafts.length < CHUNK) break;
    offset += CHUNK;
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
