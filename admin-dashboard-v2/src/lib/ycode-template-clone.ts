/**
 * Deep-clone all YCode table data from a template tenant to a new tenant.
 * Uses the service role key (bypasses RLS).
 *
 * Tables cloned: asset_folders, assets, collections, collection_fields,
 * pages, page_layers, components, layer_styles, settings, fonts, locales.
 *
 * collection_items / collection_item_values are handled by ycode-cms-seed.ts.
 *
 * Full tenant table inventory, exclusions, and post-publish patch list:
 * `tenant-clone-manifest.ts`.
 *
 * JSONB blobs have old UUIDs replaced with new ones so cross-references work.
 */

import { getServiceSupabase } from "./supabase-server";
import { getTemplateTenantId } from "./master-tenant-constants";

export type IdMap = Map<string, string>;

function newUuid(): string {
  return crypto.randomUUID();
}

function remapIds(value: unknown, idMap: IdMap): unknown {
  if (!value || idMap.size === 0) return value;
  let text = JSON.stringify(value);
  for (const [oldId, newId] of idMap) {
    text = text.replaceAll(oldId, newId);
  }
  return JSON.parse(text);
}

function mapFk(oldId: unknown, idMap: IdMap): string | null {
  if (oldId == null || oldId === "") return null;
  const s = String(oldId);
  return idMap.get(s) ?? s;
}

export async function cloneTemplateForTenant(
  targetTenantId: string,
  sourceTemplateTenantId?: string,
): Promise<IdMap> {
  const idMap: IdMap = new Map();
  const sb = getServiceSupabase();
  const templateId = sourceTemplateTenantId ?? getTemplateTenantId();

  await cloneDraftPublished(sb, "asset_folders", targetTenantId, idMap, templateId, (row) => ({
    ...row,
    asset_folder_id: mapFk(row.asset_folder_id, idMap),
  }));

  await cloneDraftPublished(sb, "assets", targetTenantId, idMap, templateId, (row) => ({
    ...row,
    asset_folder_id: mapFk(row.asset_folder_id, idMap),
  }));

  // `uuid` is globally unique — cannot reuse the template tenant's uuids.
  await cloneDraftPublished(sb, "collections", targetTenantId, idMap, templateId, (row) => ({
    ...row,
    uuid: newUuid(),
  }));

  await cloneDraftPublished(sb, "collection_fields", targetTenantId, idMap, templateId, (row) => ({
    ...row,
    collection_id: mapFk(row.collection_id, idMap),
    reference_collection_id: mapFk(row.reference_collection_id, idMap),
  }));

  await cloneDraftPublished(sb, "pages", targetTenantId, idMap, templateId, (row) => ({
    ...row,
    page_folder_id: mapFk(row.page_folder_id, idMap),
    settings: remapIds(row.settings, idMap),
  }));

  await cloneDraftPublished(sb, "page_layers", targetTenantId, idMap, templateId, (row) => ({
    ...row,
    page_id: mapFk(row.page_id, idMap),
    layers: remapIds(row.layers, idMap),
  }));

  await cloneDraftPublished(sb, "components", targetTenantId, idMap, templateId, (row) => ({
    ...row,
    layers: remapIds(row.layers, idMap),
    variables: remapIds(row.variables, idMap),
  }));

  await cloneDraftPublished(sb, "layer_styles", targetTenantId, idMap, templateId, (row) => ({
    ...row,
    design: remapIds(row.design, idMap),
  }));

  await cloneDraftPublished(sb, "fonts", targetTenantId, idMap, templateId);
  await cloneDraftPublished(sb, "locales", targetTenantId, idMap, templateId);

  await cloneSettings(sb, targetTenantId, idMap, templateId);

  return idMap;
}

/**
 * Prefer draft template rows; if the template only has published snapshots (common
 * after editing/publishing in the builder), fall back to published rows so new
 * tenants still receive full demo content.
 *
 * Exported for `rebuildIdMapForTenant` — it must use the **same** source rows as
 * `cloneTemplateForTenant` or collection/field ids won't match and CMS seed hits
 * FK errors (inserting items against non-existent cloned collection ids).
 */
export async function fetchTemplateVersionRows(
  sb: ReturnType<typeof getServiceSupabase>,
  table: string,
  templateTenantId: string,
): Promise<Record<string, unknown>[]> {
  const draft = await sb
    .from(table)
    .select("*")
    .eq("tenant_id", templateTenantId)
    .eq("is_published", false)
    .is("deleted_at", null);

  if (draft.error) {
    throw new Error(`Failed to read ${table}: ${draft.error.message}`);
  }
  if (draft.data?.length) {
    return draft.data as Record<string, unknown>[];
  }

  const published = await sb
    .from(table)
    .select("*")
    .eq("tenant_id", templateTenantId)
    .eq("is_published", true)
    .is("deleted_at", null);

  if (published.error) {
    throw new Error(`Failed to read ${table} (published): ${published.error.message}`);
  }
  return (published.data ?? []) as Record<string, unknown>[];
}

/**
 * Generic cloner for tables that use the (id, is_published) versioning model.
 * Reads draft rows from the template tenant (or published rows if no drafts exist),
 * generates new IDs, then inserts **draft** (`is_published: false`) only.
 *
 * `collections.uuid` is unique globally — inserting draft+published with the same uuid
 * would violate the constraint. Published snapshots are created by the post-provision
 * `publishAll` call (same as the editor Publish button).
 */
async function cloneDraftPublished(
  sb: ReturnType<typeof getServiceSupabase>,
  table: string,
  targetTenantId: string,
  idMap: IdMap,
  templateTenantId: string,
  transform?: (row: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const data = await fetchTemplateVersionRows(sb, table, templateTenantId);
  if (!data?.length) return;

  const now = new Date().toISOString();

  for (const raw of data as Record<string, unknown>[]) {
    const nid = newUuid();
    idMap.set(raw.id as string, nid);

    const base = transform ? transform(raw) : { ...raw };

    for (const pub of [false] as const) {
      const row = {
        ...base,
        id: nid,
        is_published: pub,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        tenant_id: targetTenantId,
      };
      delete (row as Record<string, unknown>).content_hash;

      const { error: insertErr } = await sb.from(table).insert(row);
      if (insertErr) {
        throw new Error(
          `Failed to clone ${table} row ${raw.id}: ${insertErr.message}`,
        );
      }
    }
  }
}

/**
 * Settings table doesn't use the draft/published model -- each row is unique
 * by (key). Clone all settings rows for the new tenant.
 */
async function cloneSettings(
  sb: ReturnType<typeof getServiceSupabase>,
  targetTenantId: string,
  idMap: IdMap,
  templateTenantId: string,
): Promise<void> {
  const { data, error } = await sb
    .from("settings")
    .select("*")
    .eq("tenant_id", templateTenantId);

  if (error) throw new Error(`Failed to read settings: ${error.message}`);
  if (!data?.length) return;

  const now = new Date().toISOString();
  for (const raw of data) {
    const { error: insertErr } = await sb.from("settings").insert({
      id: newUuid(),
      key: raw.key,
      value: raw.value,
      created_at: now,
      updated_at: now,
      tenant_id: targetTenantId,
    });
    if (insertErr) {
      throw new Error(
        `Failed to clone setting "${raw.key}": ${insertErr.message}`,
      );
    }
  }
}

/**
 * Rebuild old→new ID mapping by pairing template vs target tenant rows
 * (same `name` on collections; same `key` or `(name, order)` on fields).
 * Used when re-seeding CMS for tenants provisioned before idMap was persisted.
 */
export async function rebuildIdMapForTenant(
  sb: ReturnType<typeof getServiceSupabase>,
  targetTenantId: string,
  templateTenantId: string = getTemplateTenantId(),
): Promise<IdMap> {
  const idMap: IdMap = new Map();

  const tplCollRows = await fetchTemplateVersionRows(
    sb,
    "collections",
    templateTenantId,
  );
  const tplColls = tplCollRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }));

  const { data: tgtColls, error: e2 } = await sb
    .from("collections")
    .select("id, name")
    .eq("tenant_id", targetTenantId)
    .eq("is_published", false)
    .is("deleted_at", null);

  if (e2) throw new Error(e2.message);

  const tgtByName = new Map((tgtColls ?? []).map((c) => [c.name, c.id]));
  for (const tc of tplColls) {
    const nid = tgtByName.get(tc.name);
    if (nid) idMap.set(tc.id, nid as string);
  }

  const tplFieldRows = await fetchTemplateVersionRows(
    sb,
    "collection_fields",
    templateTenantId,
  );
  const tplFields = tplFieldRows.map((r) => ({
    id: r.id as string,
    collection_id: r.collection_id as string,
    key: r.key as string | null,
    name: r.name as string | null,
    order: r.order as number | null,
  }));

  const { data: tgtFields, error: e4 } = await sb
    .from("collection_fields")
    .select("id, collection_id, key, name, order")
    .eq("tenant_id", targetTenantId)
    .eq("is_published", false)
    .is("deleted_at", null);

  if (e4) throw new Error(e4.message);

  const tgtFieldLookup = new Map<string, string>();
  for (const f of tgtFields ?? []) {
    const k =
      f.key != null && f.key !== ""
        ? `${f.collection_id}|k:${f.key}`
        : `${f.collection_id}|n:${f.name}|o:${f.order}`;
    tgtFieldLookup.set(k, f.id as string);
  }

  for (const f of tplFields) {
    const mappedColl = idMap.get(f.collection_id);
    if (!mappedColl) continue;
    const lookupKey =
      f.key != null && f.key !== ""
        ? `${mappedColl}|k:${f.key}`
        : `${mappedColl}|n:${f.name}|o:${f.order}`;
    const nid = tgtFieldLookup.get(lookupKey);
    if (nid) idMap.set(f.id, nid);
  }

  return idMap;
}
