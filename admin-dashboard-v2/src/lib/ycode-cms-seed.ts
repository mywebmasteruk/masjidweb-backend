/**
 * Seed YCode CMS collections with per-tenant data and clone template content.
 *
 * YCode stores content in Supabase with a versioning model:
 *   collections → collection_fields → collection_items → collection_item_values
 *
 * Every row has an `is_published` flag. To make content visible on the live
 * site, we insert two copies of each item / value row: one draft (false) and
 * one published (true).
 *
 * Template content = any collection item with no `tenant_id` value. During
 * provisioning, these items are cloned for each new tenant with their
 * `tenant_id` and `tenant_slug` stamped on each copy.
 */

import { getServiceSupabase } from "./supabase-server";
import { getTemplateTenantId } from "./master-tenant-constants";
import { resolveSourceTemplateIdForClientTenant } from "./provision-template-source";
import { rebuildIdMapForTenant, type IdMap } from "./ycode-template-clone";

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
}

// ── Seed the Tenants collection ─────────────────────────────────────────────

async function seedTenantsCollection(
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

/** Prefer draft rows; fall back to published if the template has no drafts. */
async function selectTemplateFieldsByKey(
  supabase: ReturnType<typeof getServiceSupabase>,
  key: string,
  sourceTemplateId: string,
): Promise<{ id: string; collection_id: string }[]> {
  const draft = await supabase
    .from("collection_fields")
    .select("id, collection_id")
    .eq("key", key)
    .eq("tenant_id", sourceTemplateId)
    .eq("is_published", false)
    .is("deleted_at", null);
  if (draft.error) throw new Error(draft.error.message);
  if (draft.data?.length) {
    return draft.data as { id: string; collection_id: string }[];
  }
  const pub = await supabase
    .from("collection_fields")
    .select("id, collection_id")
    .eq("key", key)
    .eq("tenant_id", sourceTemplateId)
    .eq("is_published", true)
    .is("deleted_at", null);
  if (pub.error) throw new Error(pub.error.message);
  return (pub.data ?? []) as { id: string; collection_id: string }[];
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

  const templateTidFields = await selectTemplateFieldsByKey(
    supabase,
    "tenant_id",
    src,
  );
  if (!templateTidFields.length) return;

  const templateSlugFields = await selectTemplateFieldsByKey(
    supabase,
    "tenant_slug",
    src,
  );

  const slugFieldByTemplateCollection = Object.fromEntries(
    templateSlugFields.map((f) => [f.collection_id, f.id]),
  );

  const seenCollections = new Set<string>();

  for (const tidField of templateTidFields) {
    const templateCollectionId = tidField.collection_id;

    if (templateCollectionId === sourceTenantsCollId) continue;
    if (seenCollections.has(templateCollectionId)) continue;
    seenCollections.add(templateCollectionId);

    const fetchItems = async (published: boolean) =>
      (
        await supabase
          .from("collection_items")
          .select("id")
          .eq("collection_id", templateCollectionId)
          .eq("tenant_id", src)
          .eq("is_published", published)
          .is("deleted_at", null)
      ).data;

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

    for (const sourceItemId of templateItemIds) {
      await cloneItemForTenant(
        sourceItemId,
        newCollectionId,
        tenantId,
        tenantSlug,
        newTidFieldId,
        newSlugFieldId,
        idMap,
        templateItemsPublished,
      );
    }
  }
}

async function cloneItemForTenant(
  sourceItemId: string,
  collectionId: string,
  tenantId: string,
  tenantSlug: string,
  tenantIdFieldId: string,
  tenantSlugFieldId?: string,
  idMap?: IdMap,
  /** Template item rows were read from published-only snapshots */
  templateSourcePublished = false,
): Promise<void> {
  const supabase = getServiceSupabase();
  const newItemId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: itemErr } = await supabase.from("collection_items").insert({
    id: newItemId,
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
      `Failed to clone collection item (${collectionId}): ${itemErr.message}`,
    );
  }

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

  // Template rows may already include tenant_id / tenant_slug; we stamp those below.
  // Keeping both copies violates idx_collection_item_values_unique (item_id, field_id, is_published).
  const stampedFieldIds = new Set<string>([tenantIdFieldId]);
  if (tenantSlugFieldId) stampedFieldIds.add(tenantSlugFieldId);

  const dedupedByMappedField = new Map<
    string,
    { field_id: string; value: string }
  >();
  for (const v of sourceValues ?? []) {
    const mappedFieldId = mapId(v.field_id, idMap);
    if (stampedFieldIds.has(mappedFieldId)) continue;
    dedupedByMappedField.set(mappedFieldId, v);
  }

  const clonedRows = [...dedupedByMappedField.values()].map((v) => ({
    id: crypto.randomUUID(),
    item_id: newItemId,
    field_id: mapId(v.field_id, idMap),
    value: v.value,
    is_published: false,
    created_at: now,
    updated_at: now,
    tenant_id: tenantId,
  }));

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

  if (clonedRows.length) {
    const { error: valErr } = await supabase
      .from("collection_item_values")
      .insert(clonedRows);

    if (valErr) {
      throw new Error(
        `Failed to clone values for item ${sourceItemId} (collection ${collectionId}): ${valErr.message}`,
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
