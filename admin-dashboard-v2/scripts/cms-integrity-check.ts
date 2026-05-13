import { getServiceSupabase } from "../src/lib/supabase-server";

type TenantRow = {
  id: string;
  slug: string;
  status: string | null;
  created_at: string | null;
};

type CollectionRow = {
  id: string;
  name: string | null;
  is_published: boolean;
};

type FieldRow = {
  id: string;
  collection_id: string;
  key: string | null;
  name: string | null;
  is_published: boolean;
};

type ItemRow = {
  id: string;
  collection_id: string;
  is_published: boolean;
};

type ValueRow = {
  id: string;
  item_id: string;
  field_id: string;
  value: unknown;
  is_published: boolean;
};

const NON_CONTENT_FIELD_KEYS = new Set([
  "id",
  "status",
  "tenant_id",
  "tenant_slug",
  "created",
  "created_at",
  "updated_at",
]);

function requireArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function selectAll<T>(
  table: string,
  columns: string,
  tenantId: string,
): Promise<T[]> {
  const supabase = getServiceSupabase();
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`${table} query failed: ${error.message}`);
    }

    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return text.length > 0 && text !== "-";
}

async function resolveTenant(slugArg: string | undefined): Promise<TenantRow> {
  const supabase = getServiceSupabase();

  if (slugArg) {
    const { data, error } = await supabase
      .from("tenant_registry")
      .select("id, slug, status, created_at")
      .eq("slug", slugArg)
      .single();

    if (error || !data) {
      throw new Error(`Tenant not found for slug ${slugArg}: ${error?.message ?? "no row"}`);
    }

    return data as TenantRow;
  }

  const { data, error } = await supabase
    .from("tenant_registry")
    .select("id, slug, status, created_at")
    .eq("tenant_kind", "client")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Latest client tenant lookup failed: ${error?.message ?? "no row"}`);
  }

  return data as TenantRow;
}

async function main(): Promise<void> {
  const tenant = await resolveTenant(requireArg("--slug"));
  const [collections, fields, items, values] = await Promise.all([
    selectAll<CollectionRow>("collections", "id, name, is_published", tenant.id),
    selectAll<FieldRow>("collection_fields", "id, collection_id, key, name, is_published", tenant.id),
    selectAll<ItemRow>("collection_items", "id, collection_id, is_published", tenant.id),
    selectAll<ValueRow>("collection_item_values", "id, item_id, field_id, value, is_published", tenant.id),
  ]);

  const collectionIds = new Set(collections.map((row) => row.id));
  const fieldIds = new Set(fields.map((row) => row.id));
  const itemIds = new Set(items.map((row) => row.id));
  const fieldsByCollection = new Map<string, FieldRow[]>();
  const valuesByItem = new Map<string, ValueRow[]>();
  const fieldById = new Map(fields.map((field) => [field.id, field]));

  for (const field of fields) {
    const list = fieldsByCollection.get(field.collection_id) ?? [];
    list.push(field);
    fieldsByCollection.set(field.collection_id, list);
  }

  for (const value of values) {
    const list = valuesByItem.get(value.item_id) ?? [];
    list.push(value);
    valuesByItem.set(value.item_id, list);
  }

  const invalidItems = items.filter((item) => !collectionIds.has(item.collection_id));
  const invalidFields = fields.filter((field) => !collectionIds.has(field.collection_id));
  const invalidValues = values.filter(
    (value) => !itemIds.has(value.item_id) || !fieldIds.has(value.field_id),
  );
  const emptyItems = items.filter((item) => {
    const itemValues = valuesByItem.get(item.id) ?? [];
    return !itemValues.some((value) => {
      const field = fieldById.get(value.field_id);
      if (!field?.key || NON_CONTENT_FIELD_KEYS.has(field.key)) return false;
      return hasMeaningfulValue(value.value);
    });
  });

  const collectionSummaries = collections
    .filter((collection) => !collection.is_published)
    .map((collection) => ({
      name: collection.name,
      fields: fieldsByCollection.get(collection.id)?.length ?? 0,
      items: items.filter((item) => item.collection_id === collection.id && !item.is_published).length,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const summary = {
    tenant,
    counts: {
      collections: collections.length,
      fields: fields.length,
      items: items.length,
      values: values.length,
    },
    issues: {
      invalidCollectionsOnFields: invalidFields.length,
      invalidCollectionsOnItems: invalidItems.length,
      invalidItemOrFieldOnValues: invalidValues.length,
      emptyItems: emptyItems.length,
    },
    draftCollections: collectionSummaries,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (
    invalidFields.length > 0 ||
    invalidItems.length > 0 ||
    invalidValues.length > 0 ||
    emptyItems.length > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
