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

function parseRowTime(iso: unknown): number {
  if (typeof iso !== "string") return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * When both draft and published rows exist for the same `id`, pick the snapshot
 * that was updated most recently. Tie-break: published (matches the live demo site).
 */
export function pickNewerTemplateRow(
  d: Record<string, unknown> | undefined,
  p: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (d && p) {
    const dU = parseRowTime(d.updated_at);
    const pU = parseRowTime(p.updated_at);
    if (pU > dU) return p;
    if (dU > pU) return d;
    return Boolean(p.is_published) && !Boolean(d.is_published) ? p : d;
  }
  return d ?? p;
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
  const [draft, published] = await Promise.all([
    sb
      .from(table)
      .select("*")
      .eq("tenant_id", templateTenantId)
      .eq("is_published", false)
      .is("deleted_at", null),
    sb
      .from(table)
      .select("*")
      .eq("tenant_id", templateTenantId)
      .eq("is_published", true)
      .is("deleted_at", null),
  ]);

  if (draft.error) {
    throw new Error(`Failed to read ${table} (draft): ${draft.error.message}`);
  }
  if (published.error) {
    throw new Error(
      `Failed to read ${table} (published): ${published.error.message}`,
    );
  }

  const draftById = new Map(
    (draft.data ?? []).map((r: { id: string }) => [r.id, r]),
  );
  const pubById = new Map(
    (published.data ?? []).map((r: { id: string }) => [r.id, r]),
  );
  const ids = new Set([...draftById.keys(), ...pubById.keys()]);
  return [...ids].map((id) => {
    const chosen = pickNewerTemplateRow(draftById.get(id), pubById.get(id));
    if (!chosen) {
      throw new Error(`fetchTemplateVersionRows: missing row for id ${id}`);
    }
    return chosen;
  });
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

async function fetchTemplatePageFoldersRows(
  sb: ReturnType<typeof getServiceSupabase>,
  templateTenantId: string,
): Promise<Record<string, unknown>[]> {
  const rows = await fetchTemplateVersionRows(
    sb,
    "page_folders",
    templateTenantId,
  );
  return [...rows].sort((a, b) => Number(a.depth) - Number(b.depth));
}

/**
 * Map template structure IDs → target tenant IDs (locales, folders, pages, components)
 * so translation clone and other post-seed steps can remap `source_id`.
 */
async function extendStructureIdMapForTenant(
  sb: ReturnType<typeof getServiceSupabase>,
  targetTenantId: string,
  templateTenantId: string,
  idMap: IdMap,
): Promise<void> {
  const tplLocales = await fetchTemplateVersionRows(
    sb,
    "locales",
    templateTenantId,
  );
  const { data: tgtLocales, error: le } = await sb
    .from("locales")
    .select("id, code")
    .eq("tenant_id", targetTenantId)
    .eq("is_published", false)
    .is("deleted_at", null);
  if (le) throw new Error(le.message);
  const tgtLocByCode = new Map(
    (tgtLocales ?? []).map((l) => [l.code as string, l.id as string]),
  );
  for (const l of tplLocales) {
    const nid = tgtLocByCode.get(l.code as string);
    if (nid) idMap.set(l.id as string, nid);
  }

  const tplComps = await fetchTemplateVersionRows(
    sb,
    "components",
    templateTenantId,
  );
  const { data: tgtComps, error: ce } = await sb
    .from("components")
    .select("id, name")
    .eq("tenant_id", targetTenantId)
    .eq("is_published", false)
    .is("deleted_at", null);
  if (ce) throw new Error(ce.message);
  const tgtCompByName = new Map(
    (tgtComps ?? []).map((c) => [c.name as string, c.id as string]),
  );
  for (const c of tplComps) {
    const nid = tgtCompByName.get(c.name as string);
    if (nid) idMap.set(c.id as string, nid);
  }

  const tplFolders = await fetchTemplatePageFoldersRows(sb, templateTenantId);
  const { data: tgtFolders, error: fe } = await sb
    .from("page_folders")
    .select("id, name, slug, page_folder_id, depth")
    .eq("tenant_id", targetTenantId)
    .eq("is_published", false)
    .is("deleted_at", null);
  if (fe) throw new Error(fe.message);
  const tf = tgtFolders ?? [];

  const folderMap = new Map<string, string>();
  for (const f of tplFolders) {
    const parentTpl = (f.page_folder_id as string | null) ?? null;
    const expectedParent = parentTpl ? folderMap.get(parentTpl) : null;
    if (parentTpl && expectedParent === undefined) continue;

    const match = tf.find(
      (x) =>
        x.slug === f.slug &&
        x.name === f.name &&
        (x.page_folder_id ?? null) === (expectedParent ?? null),
    );
    if (match) {
      folderMap.set(f.id as string, match.id as string);
      idMap.set(f.id as string, match.id as string);
    }
  }

  const tplPages = await fetchTemplateVersionRows(sb, "pages", templateTenantId);
  const { data: tgtPages, error: pe } = await sb
    .from("pages")
    .select(
      "id, name, slug, page_folder_id, is_index, is_dynamic, error_page",
    )
    .eq("tenant_id", targetTenantId)
    .eq("is_published", false)
    .is("deleted_at", null);
  if (pe) throw new Error(pe.message);
  const tp = tgtPages ?? [];

  for (const p of tplPages) {
    const pf = (p.page_folder_id as string | null) ?? null;
    if (pf && !idMap.has(pf)) continue;
    const mappedFolder = pf ? idMap.get(pf) ?? null : null;

    const match = tp.find(
      (x) =>
        x.slug === p.slug &&
        x.name === p.name &&
        Boolean(x.is_index) === Boolean(p.is_index) &&
        Boolean(x.is_dynamic) === Boolean(p.is_dynamic) &&
        (x.error_page ?? null) === (p.error_page ?? null) &&
        (x.page_folder_id ?? null) === (mappedFolder ?? null),
    );
    if (match) idMap.set(p.id as string, match.id as string);
  }
}

/**
 * Copy template translations into the target tenant (draft only). Skips if the
 * tenant already has draft translations (safe on provision retries).
 * Call after `seedTenantCmsContent` so `idMap` includes cloned collection_item ids.
 */
export async function cloneTranslationsForTenant(
  sb: ReturnType<typeof getServiceSupabase>,
  targetTenantId: string,
  idMap: IdMap,
  templateTenantId: string,
): Promise<void> {
  const { count, error: cErr } = await sb
    .from("translations")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", targetTenantId)
    .eq("is_published", false)
    .is("deleted_at", null);
  if (cErr) throw new Error(`translations count: ${cErr.message}`);
  if ((count ?? 0) > 0) return;

  const rows = await fetchTemplateVersionRows(
    sb,
    "translations",
    templateTenantId,
  );
  if (!rows.length) return;

  const now = new Date().toISOString();
  for (const raw of rows) {
    const localeId = mapFk(raw.locale_id, idMap);
    if (!localeId) continue;

    const sid = String(raw.source_id ?? "");
    const mappedSource = idMap.get(sid) ?? sid;

    const contentKeyRemapped = remapIds(raw.content_key, idMap);
    const contentValRemapped = remapIds(raw.content_value, idMap);
    const toDbText = (v: unknown): string =>
      typeof v === "string" ? v : JSON.stringify(v ?? "");

    const row = {
      id: newUuid(),
      locale_id: localeId,
      source_type: raw.source_type,
      source_id: mappedSource,
      content_key: toDbText(contentKeyRemapped),
      content_type: raw.content_type,
      content_value: toDbText(contentValRemapped),
      is_completed: Boolean(raw.is_completed),
      is_published: false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      tenant_id: targetTenantId,
    };

    const { error: insertErr } = await sb.from("translations").insert(row);
    if (insertErr) {
      throw new Error(
        `Failed to clone translation (${raw.id}): ${insertErr.message}`,
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

  await extendStructureIdMapForTenant(
    sb,
    targetTenantId,
    templateTenantId,
    idMap,
  );

  return idMap;
}
