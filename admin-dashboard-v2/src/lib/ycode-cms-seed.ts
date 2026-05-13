/**
 * Seed YCode CMS collections with per-tenant data and clone template content.
 *
 * Tenant-wide clone inventory and exclusions: `tenant-clone-manifest.ts`.
 *
 * YCode stores content in Supabase with a versioning model:
 *   collections → collection_fields → collection_items → collection_item_values
 *
 * Every row has an `is_published` flag. Provisioning inserts draft CMS rows
 * (`is_published: false`); the builder publish step creates published snapshots.
 *
 * Template demo rows are identified by `collection_items.tenant_id` matching the
 * template tenant UUID, or (legacy) `tenant_id` null on collections that belong
 * to the template. Cloning stamps the new tenant on item rows and on optional
 * `tenant_id` / `tenant_slug` CMS fields when those fields exist on the target.
 */

import { getServiceSupabase } from "./supabase-server";
import { getTemplateTenantId } from "./master-tenant-constants";
import { resolveSourceTemplateIdForClientTenant } from "./provision-template-source";
import {
  cloneTranslationsForTenant,
  pickNewerTemplateRow,
  rebuildIdMapForTenant,
  type IdMap,
} from "./ycode-template-clone";

const ORIG_TENANTS_COLLECTION_ID = "7e76e362-3d69-4820-8e9d-7fac282a577a";

const ORIG_TENANT_FIELDS = {
  name: "e69392a8-31de-4bcc-b48f-e26d573e0167",
  slug: "018128f9-0045-4e09-b18d-ad6ac991a612",
  domain: "740755a6-bd50-4aa3-9b1b-15436ebf8bc8",
  address: "d9fad17f-5163-4501-950c-32d5eab82e0f",
  phone: "d23a9699-dfc4-4f12-b100-6a1e9df576b6",
  email: "17064471-a5cf-493d-873d-7287965a734e",
  description: "f04e94ac-ac2b-462e-88a4-1d1b93c0d2fc",
  tenant_id: "3e729e8f-5fbb-4a78-aaf3-60bc54014be7",
  tenant_slug: "fcbc3ca1-270f-4b32-87aa-2b9b8ff5e2cb",
} as const;

function mapId(origId: string, idMap?: IdMap): string {
  return idMap?.get(origId) ?? origId;
}

/** Remap reference / multi_reference values after all peer items are in `itemIdMap`. */
function remapCmsReferenceValue(
  raw: string,
  fieldType: string | undefined,
  itemIdMap: IdMap,
): string {
  if (!itemIdMap.size) return raw;
  if (fieldType === "reference") {
    const t = raw.trim();
    if (/^[0-9a-f-]{36}$/i.test(t) && itemIdMap.has(t)) {
      return itemIdMap.get(t)!;
    }
    return raw;
  }
  if (fieldType === "multi_reference") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return raw;
      const next = parsed.map((x: unknown) =>
        typeof x === "string" && itemIdMap.has(x)
          ? itemIdMap.get(x)!
          : x,
      );
      return JSON.stringify(next);
    } catch {
      return raw;
    }
  }
  return raw;
}

const NON_CONTENT_CMS_FIELD_KEYS = new Set([
  "id",
  "status",
  "tenant_id",
  "tenant_slug",
  "created",
  "created_at",
  "updated_at",
]);

function isMeaningfulCmsValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return text.length > 0 && text !== "-";
}

export function filterCmsSourceItemsWithContent<T extends { id: string }>(
  items: T[],
  valuesByItem: Map<string, { field_id: string; value: unknown }[]>,
  fieldKeyById: Map<string, string>,
): T[] {
  return items.filter((item) => {
    const values = valuesByItem.get(item.id) ?? [];
    return values.some((value) => {
      const key = fieldKeyById.get(value.field_id);
      if (!key || NON_CONTENT_CMS_FIELD_KEYS.has(key)) return false;
      return isMeaningfulCmsValue(value.value);
    });
  });
}

export function filterTemplateFieldsToMappedCollections<T extends { collection_id: string }>(
  fields: T[],
  idMap?: IdMap,
): T[] {
  return idMap ? fields.filter((field) => idMap.has(field.collection_id)) : fields;
}

/** Tenants CMS collection id on the source template (draft, else published). */
async function resolveTenantsCollectionIdForTemplate(
  supabase: ReturnType<typeof getServiceSupabase>,
  sourceTemplateId: string,
): Promise<string | null> {
  for (const pub of [false, true] as const) {
    const { data } = await supabase
      .from("collections")
      .select("id")
      .eq("tenant_id", sourceTemplateId)
      .eq("name", "Tenants")
      .eq("is_published", pub)
      .is("deleted_at", null)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

export interface TenantCmsContent {
  slug: string;
  business_name: string;
  address?: string;
  phone?: string;
  email?: string;
  domain?: string;
  description?: string;
}

/**
 * Seed the "Tenants" collection item for this tenant and clone all
 * template content (items with no tenant_id) across every collection.
 *
 * @param idMap - ID mapping from cloneTemplateForTenant (old→new IDs)
 * @param sourceTemplateId - Demo template tenant UUID (CMS field/collection source)
 */
export async function seedTenantCmsContent(
  tenantId: string,
  tenantSlug: string,
  tenant: TenantCmsContent,
  idMap?: IdMap,
  sourceTemplateId?: string,
): Promise<void> {
  const src = sourceTemplateId ?? getTemplateTenantId();
  await seedTenantsCollection(tenantId, tenantSlug, tenant, idMap, src);
  await copyTemplateContentToTenant(tenantId, tenantSlug, idMap, src);
}

/**
 * Re-run CMS demo seed for an existing tenant (reconstructs idMap from DB).
 */
export async function reseedTenantCmsDemo(
  tenantId: string,
  tenantSlug: string,
  tenant: TenantCmsContent,
): Promise<void> {
  const supabase = getServiceSupabase();
  const sourceTpl = await resolveSourceTemplateIdForClientTenant(
    supabase,
    tenantId,
  );
  const idMap = await rebuildIdMapForTenant(supabase, tenantId, sourceTpl);
  await seedTenantCmsContent(tenantId, tenantSlug, tenant, idMap, sourceTpl);
  await cloneTranslationsForTenant(supabase, tenantId, idMap, sourceTpl);
}

// ── Seed the Tenants collection ─────────────────────────────────────────────

export async function seedTenantsCollection(
  tenantId: string,
  tenantSlug: string,
  t: TenantCmsContent,
  idMap?: IdMap,
  sourceTemplateId?: string,
): Promise<void> {
  const supabase = getServiceSupabase();
  const src = sourceTemplateId ?? getTemplateTenantId();

  const resolvedTenantsColl = await resolveTenantsCollectionIdForTemplate(
    supabase,
    src,
  );
  const sourceCollCandidates = [
    resolvedTenantsColl,
    ORIG_TENANTS_COLLECTION_ID,
  ].filter(Boolean) as string[];

  let sourceTenantsCollectionId: string | null = null;
  for (const c of sourceCollCandidates) {
    if (idMap?.has(c)) {
      sourceTenantsCollectionId = c;
      break;
    }
  }
  if (!sourceTenantsCollectionId) return;

  const tenantsCollectionId = mapId(sourceTenantsCollectionId, idMap);

  const TF = {
    name: mapId(ORIG_TENANT_FIELDS.name, idMap),
    slug: mapId(ORIG_TENANT_FIELDS.slug, idMap),
    domain: mapId(ORIG_TENANT_FIELDS.domain, idMap),
    address: mapId(ORIG_TENANT_FIELDS.address, idMap),
    phone: mapId(ORIG_TENANT_FIELDS.phone, idMap),
    email: mapId(ORIG_TENANT_FIELDS.email, idMap),
    description: mapId(ORIG_TENANT_FIELDS.description, idMap),
    tenant_id: mapId(ORIG_TENANT_FIELDS.tenant_id, idMap),
    tenant_slug: mapId(ORIG_TENANT_FIELDS.tenant_slug, idMap),
  };

  const { data: existing } = await supabase
    .from("collection_item_values")
    .select("item_id")
    .eq("field_id", TF.tenant_id)
    .eq("value", tenantId)
    .eq("is_published", true)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  const pairs: [string, string][] = [
    [TF.name, t.business_name],
    [TF.slug, t.slug],
    [TF.tenant_id, tenantId],
    [TF.tenant_slug, tenantSlug],
  ];
  if (t.domain) pairs.push([TF.domain, t.domain]);
  if (t.address) pairs.push([TF.address, t.address]);
  if (t.phone) pairs.push([TF.phone, t.phone]);
  if (t.email) pairs.push([TF.email, t.email]);
  if (t.description) pairs.push([TF.description, t.description]);

  await insertCollectionItem(tenantsCollectionId, pairs, tenantId);
}

// ── Clone template content ──────────────────────────────────────────────────

/**
 * One row per collection for this field key. Merge draft + published like
 * `fetchTemplateVersionRows`: if the template has any draft fields we must still
 * include collections that only have a published `tenant_id` / `tenant_slug`
 * field (otherwise demo CMS items for those collections are never cloned).
 */
async function selectTemplateFieldsByKey(
  supabase: ReturnType<typeof getServiceSupabase>,
  key: string,
  sourceTemplateId: string,
): Promise<{ id: string; collection_id: string }[]> {
  const [draft, pub] = await Promise.all([
    supabase
      .from("collection_fields")
      .select("id, collection_id, updated_at, is_published")
      .eq("key", key)
      .eq("tenant_id", sourceTemplateId)
      .eq("is_published", false)
      .is("deleted_at", null),
    supabase
      .from("collection_fields")
      .select("id, collection_id, updated_at, is_published")
      .eq("key", key)
      .eq("tenant_id", sourceTemplateId)
      .eq("is_published", true)
      .is("deleted_at", null),
  ]);
  if (draft.error) throw new Error(draft.error.message);
  if (pub.error) throw new Error(pub.error.message);

  const draftByColl = new Map<string, Record<string, unknown>>();
  for (const row of draft.data ?? []) {
    draftByColl.set(row.collection_id as string, row as Record<string, unknown>);
  }
  const pubByColl = new Map<string, Record<string, unknown>>();
  for (const row of pub.data ?? []) {
    pubByColl.set(row.collection_id as string, row as Record<string, unknown>);
  }
  const collectionIds = new Set([
    ...draftByColl.keys(),
    ...pubByColl.keys(),
  ]);
  const out: { id: string; collection_id: string }[] = [];
  for (const collectionId of collectionIds) {
    const chosen = pickNewerTemplateRow(
      draftByColl.get(collectionId),
      pubByColl.get(collectionId),
    );
    if (chosen?.id && chosen.collection_id) {
      out.push({
        id: String(chosen.id),
        collection_id: String(chosen.collection_id),
      });
    }
  }
  return out;
}

async function selectTargetFieldIdByKey(
  supabase: ReturnType<typeof getServiceSupabase>,
  collectionId: string,
  tenantUuid: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("collection_fields")
    .select("id")
    .eq("collection_id", collectionId)
    .eq("tenant_id", tenantUuid)
    .eq("key", key)
    .eq("is_published", false)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

/**
 * Read template items (from the TEMPLATE tenant) and clone them into
 * the new tenant's collections using the ID map for remapping.
 */
async function copyTemplateContentToTenant(
  tenantId: string,
  tenantSlug: string,
  idMap?: IdMap,
  sourceTemplateId?: string,
): Promise<void> {
  const supabase = getServiceSupabase();
  const src = sourceTemplateId ?? getTemplateTenantId();

  const sourceTenantsCollId =
    (await resolveTenantsCollectionIdForTemplate(supabase, src)) ??
    ORIG_TENANTS_COLLECTION_ID;

  const [templateTidFieldsRaw, templateSlugFieldsRaw] = await Promise.all([
    selectTemplateFieldsByKey(supabase, "tenant_id", src),
    selectTemplateFieldsByKey(supabase, "tenant_slug", src),
  ]);
  const templateTidFields = filterTemplateFieldsToMappedCollections(
    templateTidFieldsRaw,
    idMap,
  );
  const templateSlugFields = filterTemplateFieldsToMappedCollections(
    templateSlugFieldsRaw,
    idMap,
  );

  const slugFieldByTemplateCollection = Object.fromEntries(
    templateSlugFields.map((f) => [f.collection_id, f.id]),
  );

  const seenCollections = new Set<string>();

  const { data: tplCollRows, error: tplCollErr } = await supabase
    .from("collections")
    .select("id")
    .eq("tenant_id", src)
    .eq("is_published", false)
    .is("deleted_at", null);
  if (tplCollErr) throw new Error(tplCollErr.message);
  const templateDraftCollectionIds = new Set(
    (tplCollRows ?? []).map((c) => c.id as string),
  );

  type CmsCloneBatch = {
    newCollectionId: string;
    templateItemIds: string[];
    newTidFieldId: string | null;
    newSlugFieldId?: string;
    templateItemsPublished: boolean;
    fieldTypeById: Map<string, string>;
    fieldKeyById: Map<string, string>;
  };

  const batches: CmsCloneBatch[] = [];

  for (const tidField of templateTidFields) {
    const templateCollectionId = tidField.collection_id;

    if (templateCollectionId === sourceTenantsCollId) continue;
    if (seenCollections.has(templateCollectionId)) continue;
    seenCollections.add(templateCollectionId);

    const fetchItems = async (published: boolean) => {
      const ids = new Set<string>();
      const { data: owned } = await supabase
        .from("collection_items")
        .select("id")
        .eq("collection_id", templateCollectionId)
        .eq("tenant_id", src)
        .eq("is_published", published)
        .is("deleted_at", null);
      for (const row of owned ?? []) ids.add(row.id as string);
      if (templateDraftCollectionIds.has(templateCollectionId)) {
        const { data: loose } = await supabase
          .from("collection_items")
          .select("id")
          .eq("collection_id", templateCollectionId)
          .is("tenant_id", null)
          .eq("is_published", published)
          .is("deleted_at", null);
        for (const row of loose ?? []) ids.add(row.id as string);
      }
      return [...ids].map((id) => ({ id }));
    };

    let templateItemsPublished = false;
    let allItems = await fetchItems(false);

    if (!allItems?.length) {
      templateItemsPublished = true;
      allItems = await fetchItems(true);
    }

    if (!allItems?.length) continue;

    const computeUnownedTemplateIds = async (
      itemIds: string[],
      publishedFlag: boolean,
    ): Promise<string[]> => {
      const { data: ownedValues } = await supabase
        .from("collection_item_values")
        .select("item_id")
        .eq("field_id", tidField.id)
        .eq("is_published", publishedFlag)
        .neq("value", "")
        .in("item_id", itemIds);

      const ownedItemIds = new Set(
        (ownedValues ?? []).map((v) => v.item_id),
      );
      return itemIds.filter((id) => !ownedItemIds.has(id));
    };

    let allItemIds = allItems.map((i) => i.id);
    let templateItemIds = await computeUnownedTemplateIds(
      allItemIds,
      templateItemsPublished,
    );

    // Draft rows exist but all have tenant_id set; published may still hold "global" demo rows.
    if (!templateItemIds.length && !templateItemsPublished) {
      const pubItems = await fetchItems(true);
      if (pubItems?.length) {
        templateItemsPublished = true;
        allItems = pubItems;
        allItemIds = allItems.map((i) => i.id);
        templateItemIds = await computeUnownedTemplateIds(
          allItemIds,
          true,
        );
      }
    }

    // Template tenant has every item "owned" (tenant_id field filled) — still clone all as demo.
    if (!templateItemIds.length && allItemIds.length) {
      templateItemIds = allItemIds;
    }

    if (!templateItemIds.length) continue;

    const newCollectionId = mapId(templateCollectionId, idMap);
    const newTidFieldId = mapId(tidField.id, idMap);
    const templateSlugFieldId = slugFieldByTemplateCollection[templateCollectionId];
    const newSlugFieldId = templateSlugFieldId
      ? mapId(templateSlugFieldId, idMap)
      : undefined;

    const { data: collFieldMeta, error: fMetaErr } = await supabase
      .from("collection_fields")
      .select("id, key, type")
      .eq("collection_id", newCollectionId)
      .eq("tenant_id", tenantId)
      .eq("is_published", false)
      .is("deleted_at", null);
    if (fMetaErr) throw new Error(fMetaErr.message);
    const fieldTypeById = new Map(
      (collFieldMeta ?? []).map((f) => [String(f.id), String(f.type)]),
    );
    const fieldKeyById = new Map(
      (collFieldMeta ?? []).map((f) => [String(f.id), String(f.key)]),
    );

    batches.push({
      newCollectionId,
      templateItemIds,
      newTidFieldId,
      newSlugFieldId,
      templateItemsPublished,
      fieldTypeById,
      fieldKeyById,
    });
  }

  const { data: itemRowsSrc, error: itemRowsErr } = await supabase
    .from("collection_items")
    .select("collection_id")
    .eq("tenant_id", src)
    .is("deleted_at", null);
  if (itemRowsErr) throw new Error(itemRowsErr.message);

  const supplementalCollIds = new Set<string>();
  for (const r of itemRowsSrc ?? []) {
    const collectionId = r.collection_id as string;
    if (!idMap || idMap.has(collectionId)) {
      supplementalCollIds.add(collectionId);
    }
  }
  if (templateDraftCollectionIds.size > 0) {
    const collList = [...templateDraftCollectionIds];
    for (let i = 0; i < collList.length; i += 100) {
      const chunk = collList.slice(i, i + 100);
      const { data: nullRows, error: nullErr } = await supabase
        .from("collection_items")
        .select("collection_id")
        .is("tenant_id", null)
        .is("deleted_at", null)
        .in("collection_id", chunk);
      if (nullErr) throw new Error(nullErr.message);
      for (const r of nullRows ?? []) {
        supplementalCollIds.add(r.collection_id as string);
      }
    }
  }

  const listDemoItemIdsForSupplemental = async (
    templateCollectionId: string,
  ): Promise<{ ids: string[]; templateItemsPublished: boolean }> => {
    const tryPublished = async (published: boolean) => {
      const ids = new Set<string>();
      const { data: owned } = await supabase
        .from("collection_items")
        .select("id")
        .eq("collection_id", templateCollectionId)
        .eq("tenant_id", src)
        .eq("is_published", published)
        .is("deleted_at", null);
      for (const row of owned ?? []) ids.add(row.id as string);
      if (templateDraftCollectionIds.has(templateCollectionId)) {
        const { data: loose } = await supabase
          .from("collection_items")
          .select("id")
          .eq("collection_id", templateCollectionId)
          .is("tenant_id", null)
          .eq("is_published", published)
          .is("deleted_at", null);
        for (const row of loose ?? []) ids.add(row.id as string);
      }
      const arr = [...ids];
      return arr.length ? { ids: arr, published } : null;
    };
    let r = await tryPublished(false);
    if (r) return { ids: r.ids, templateItemsPublished: r.published };
    r = await tryPublished(true);
    if (r) return { ids: r.ids, templateItemsPublished: r.published };
    return { ids: [], templateItemsPublished: false };
  };

  for (const templateCollectionId of supplementalCollIds) {
    if (seenCollections.has(templateCollectionId)) continue;
    if (templateCollectionId === sourceTenantsCollId) continue;
    if (!idMap?.has(templateCollectionId)) continue;

    const { ids: templateItemIds, templateItemsPublished } =
      await listDemoItemIdsForSupplemental(templateCollectionId);
    if (!templateItemIds.length) continue;

    const newCollectionId = mapId(templateCollectionId, idMap);
    const newTidFieldId = await selectTargetFieldIdByKey(
      supabase,
      newCollectionId,
      tenantId,
      "tenant_id",
    );
    const slugResolved = await selectTargetFieldIdByKey(
      supabase,
      newCollectionId,
      tenantId,
      "tenant_slug",
    );
    const newSlugFieldId = slugResolved ?? undefined;

    const { data: collFieldMeta2, error: fMetaErr2 } = await supabase
      .from("collection_fields")
      .select("id, key, type")
      .eq("collection_id", newCollectionId)
      .eq("tenant_id", tenantId)
      .eq("is_published", false)
      .is("deleted_at", null);
    if (fMetaErr2) throw new Error(fMetaErr2.message);
    const fieldTypeById2 = new Map(
      (collFieldMeta2 ?? []).map((f) => [String(f.id), String(f.type)]),
    );
    const fieldKeyById2 = new Map(
      (collFieldMeta2 ?? []).map((f) => [String(f.id), String(f.key)]),
    );

    batches.push({
      newCollectionId,
      templateItemIds,
      newTidFieldId,
      newSlugFieldId,
      templateItemsPublished,
      fieldTypeById: fieldTypeById2,
      fieldKeyById: fieldKeyById2,
    });
  }

  const itemIdMap = idMap ?? new Map<string, string>();
  const now = new Date().toISOString();

  const CHUNK_SIZE = 200;

  const allSourceItemIds = batches.flatMap((b) => b.templateItemIds);
  const allSourceValues: { item_id: string; field_id: string; value: unknown }[] = [];

  for (let i = 0; i < allSourceItemIds.length; i += CHUNK_SIZE) {
    const chunk = allSourceItemIds.slice(i, i + CHUNK_SIZE);
    const { data: chunkVals } = await supabase
      .from("collection_item_values")
      .select("item_id, field_id, value")
      .in("item_id", chunk)
      .is("deleted_at", null);
    if (chunkVals) allSourceValues.push(...chunkVals);
  }

  const sourceValuesByItem = new Map<string, { field_id: string; value: unknown }[]>();
  for (const v of allSourceValues) {
    const key = String(v.item_id);
    if (!sourceValuesByItem.has(key)) sourceValuesByItem.set(key, []);
    sourceValuesByItem.get(key)!.push({ field_id: String(v.field_id), value: v.value });
  }

  for (const b of batches) {
    b.templateItemIds = filterCmsSourceItemsWithContent(
      b.templateItemIds.map((id) => ({ id })),
      sourceValuesByItem,
      new Map(
        [...b.fieldKeyById].flatMap(([targetFieldId, key]) => {
          const sourceFieldIds = [...(idMap ?? new Map<string, string>()).entries()]
            .filter(([, mappedId]) => mappedId === targetFieldId)
            .map(([sourceId]) => sourceId);
          return [[targetFieldId, key], ...sourceFieldIds.map((sourceId) => [sourceId, key] as [string, string])];
        }),
      ),
    ).map((item) => item.id);
  }

  const allNewItemRows: {
    id: string;
    collection_id: string;
    manual_order: number;
    is_publishable: boolean;
    is_published: boolean;
    created_at: string;
    updated_at: string;
    tenant_id: string;
  }[] = [];

  for (const b of batches) {
    for (const sourceItemId of b.templateItemIds) {
      const newItemId = crypto.randomUUID();
      itemIdMap.set(sourceItemId, newItemId);
      allNewItemRows.push({
        id: newItemId,
        collection_id: b.newCollectionId,
        manual_order: 0,
        is_publishable: true,
        is_published: false,
        created_at: now,
        updated_at: now,
        tenant_id: tenantId,
      });
    }
  }

  if (allNewItemRows.length) {
    for (let i = 0; i < allNewItemRows.length; i += CHUNK_SIZE) {
      const chunk = allNewItemRows.slice(i, i + CHUNK_SIZE);
      const { error: itemBulkErr } = await supabase
        .from("collection_items")
        .upsert(chunk, { onConflict: "id,is_published", ignoreDuplicates: true });
      if (itemBulkErr) {
        throw new Error(`Failed to bulk-insert collection_items: ${itemBulkErr.message}`);
      }
    }
  }

  // Build all target rows in memory.
  const allValueRows: {
    id: string;
    item_id: string;
    field_id: string;
    value: unknown;
    is_published: boolean;
    created_at: string;
    updated_at: string;
    tenant_id: string;
  }[] = [];

  for (const b of batches) {
    const reservedTenantFieldIds = new Set(
      [b.newTidFieldId, b.newSlugFieldId].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    );

    for (const sourceItemId of b.templateItemIds) {
      const newItemId = itemIdMap.get(sourceItemId);
      if (!newItemId) continue;

      const sourceVals = sourceValuesByItem.get(sourceItemId) ?? [];

      const dedupedByMappedField = new Map<string, { field_id: string; value: unknown }>();
      for (const v of sourceVals) {
        const mappedFieldId = mapId(v.field_id, idMap);
        if (reservedTenantFieldIds.has(mappedFieldId)) continue;
        dedupedByMappedField.set(mappedFieldId, v);
      }

      for (const [mappedFieldId, v] of dedupedByMappedField) {
        const ft = b.fieldTypeById.get(mappedFieldId);
        const valueRemapped = remapCmsReferenceValue(v.value as string, ft, itemIdMap);
        allValueRows.push({
          id: crypto.randomUUID(),
          item_id: newItemId,
          field_id: mappedFieldId,
          value: valueRemapped,
          is_published: false,
          created_at: now,
          updated_at: now,
          tenant_id: tenantId,
        });
      }

      if (b.newTidFieldId) {
        allValueRows.push({
          id: crypto.randomUUID(),
          item_id: newItemId,
          field_id: b.newTidFieldId,
          value: tenantId,
          is_published: false,
          created_at: now,
          updated_at: now,
          tenant_id: tenantId,
        });
      }
      if (b.newSlugFieldId) {
        allValueRows.push({
          id: crypto.randomUUID(),
          item_id: newItemId,
          field_id: b.newSlugFieldId,
          value: tenantSlug,
          is_published: false,
          created_at: now,
          updated_at: now,
          tenant_id: tenantId,
        });
      }
    }
  }

  // Deduplicate by (item_id, field_id) to prevent unique-constraint violations.
  const dedupedValueRows = [...new Map(
    allValueRows.map((r) => [`${r.item_id}:${r.field_id}`, r]),
  ).values()];

  // Bulk-upsert in chunks; ignoreDuplicates makes retries safe after a partial insert.
  for (let i = 0; i < dedupedValueRows.length; i += CHUNK_SIZE) {
    const chunk = dedupedValueRows.slice(i, i + CHUNK_SIZE);
    const { error: valBulkErr } = await supabase
      .from("collection_item_values")
      .upsert(chunk, { ignoreDuplicates: true });
    if (valBulkErr) {
      throw new Error(`Failed to bulk-insert collection_item_values: ${valBulkErr.message}`);
    }
  }
}

async function cloneCollectionItemValuesForTenant(
  sourceItemId: string,
  newItemId: string,
  tenantId: string,
  tenantSlug: string,
  /** When null, skip CMS value rows for tenant_id (row-level tenant is still set on collection_items). */
  tenantIdFieldId: string | null,
  tenantSlugFieldId: string | undefined,
  fieldTypeById: Map<string, string>,
  itemIdMap: IdMap,
  structureIdMap: IdMap | undefined,
  /** Template item rows were read from published-only snapshots */
  templateSourcePublished: boolean,
): Promise<void> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();

  let readPublished = templateSourcePublished;
  let { data: sourceValues } = await supabase
    .from("collection_item_values")
    .select("field_id, value")
    .eq("item_id", sourceItemId)
    .eq("is_published", readPublished)
    .is("deleted_at", null);

  if (!sourceValues?.length) {
    readPublished = !readPublished;
    const fb = await supabase
      .from("collection_item_values")
      .select("field_id, value")
      .eq("item_id", sourceItemId)
      .eq("is_published", readPublished)
      .is("deleted_at", null);
    sourceValues = fb.data;
  }

  // Drop template tenant_id / tenant_slug value rows; we stamp fresh rows below.
  // Dedupe by mapped field_id so duplicates cannot violate idx_collection_item_values_unique.
  const reservedTenantFieldIds = new Set(
    [tenantIdFieldId, tenantSlugFieldId].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    ),
  );

  const dedupedByMappedField = new Map<
    string,
    { field_id: string; value: string }
  >();
  for (const v of sourceValues ?? []) {
    const mappedFieldId = mapId(v.field_id, structureIdMap);
    if (reservedTenantFieldIds.has(mappedFieldId)) continue;
    dedupedByMappedField.set(mappedFieldId, v);
  }

  const clonedRows = [...dedupedByMappedField.values()].map((v) => {
    const mappedFieldId = mapId(v.field_id, structureIdMap);
    const ft = fieldTypeById.get(mappedFieldId);
    const valueRemapped = remapCmsReferenceValue(
      v.value as string,
      ft,
      itemIdMap,
    );
    return {
      id: crypto.randomUUID(),
      item_id: newItemId,
      field_id: mappedFieldId,
      value: valueRemapped,
      is_published: false,
      created_at: now,
      updated_at: now,
      tenant_id: tenantId,
    };
  });

  if (tenantIdFieldId) {
    clonedRows.push({
      id: crypto.randomUUID(),
      item_id: newItemId,
      field_id: tenantIdFieldId,
      value: tenantId,
      is_published: false,
      created_at: now,
      updated_at: now,
      tenant_id: tenantId,
    });
  }

  if (tenantSlugFieldId) {
    clonedRows.push({
      id: crypto.randomUUID(),
      item_id: newItemId,
      field_id: tenantSlugFieldId,
      value: tenantSlug,
      is_published: false,
      created_at: now,
      updated_at: now,
      tenant_id: tenantId,
    });
  }

  // One row per field_id — template data can repeat the same logical field (e.g. draft +
  // published field ids both mapping here, or legacy duplicates). DB enforces uniqueness.
  const byFieldId = new Map<string, (typeof clonedRows)[number]>();
  for (const row of clonedRows) {
    byFieldId.set(row.field_id, row);
  }
  const rowsToInsert = [...byFieldId.values()];

  if (rowsToInsert.length) {
    const { error: valErr } = await supabase
      .from("collection_item_values")
      .insert(rowsToInsert);

    if (valErr) {
      throw new Error(
        `Failed to clone values for item ${sourceItemId} → ${newItemId}: ${valErr.message}`,
      );
    }
  }
}

// ── Low-level helper ────────────────────────────────────────────────────────

async function insertCollectionItem(
  collectionId: string,
  fieldValues: [fieldId: string, value: string][],
  tenantId: string,
): Promise<void> {
  const supabase = getServiceSupabase();
  const itemId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: itemErr } = await supabase.from("collection_items").insert({
    id: itemId,
    collection_id: collectionId,
    manual_order: 0,
    is_publishable: true,
    is_published: false,
    created_at: now,
    updated_at: now,
    tenant_id: tenantId,
  });
  if (itemErr) {
    throw new Error(
      `Failed to create collection item (${collectionId}): ${itemErr.message}`,
    );
  }

  const rows = fieldValues.map(([fieldId, value]) => ({
    id: crypto.randomUUID(),
    item_id: itemId,
    field_id: fieldId,
    value,
    is_published: false,
    created_at: now,
    updated_at: now,
    tenant_id: tenantId,
  }));

  const { error: valErr } = await supabase
    .from("collection_item_values")
    .insert(rows);
  if (valErr) {
    throw new Error(
      `Failed to seed collection values (${collectionId}): ${valErr.message}`,
    );
  }
}
