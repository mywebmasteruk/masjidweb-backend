/**
 * Admin-editable mapping of tenant provisioning form fields onto CMS collection
 * fields (the "org" collection by default). Stored in provision_org_field_mappings;
 * consumed by seedOrgCollectionContent (ycode-cms-seed.ts) at provision/reseed time.
 *
 * Matching semantics: a mapping's target_field matches a CMS field when it equals
 * the field's `key` OR its display `name` (both case-insensitive). One mapping may
 * match several fields (e.g. "name" hits the system Name key and a custom "name"
 * field) — the source value is written to every match.
 */

import { z } from "zod";
import { getServiceSupabase } from "./supabase-server";

export const ORG_MAPPING_SOURCE_FIELDS = [
  "business_name",
  "slug",
  "address",
  "phone",
  "email",
  "description",
  "domain",
] as const;

export type OrgMappingSourceField = (typeof ORG_MAPPING_SOURCE_FIELDS)[number];

export interface OrgFieldMapping {
  id: string;
  collection_name: string;
  source_field: OrgMappingSourceField;
  target_field: string;
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/** Mirrors the migration's seed rows — used only when the table cannot be read. */
export const DEFAULT_ORG_FIELD_MAPPINGS: Pick<
  OrgFieldMapping,
  "collection_name" | "source_field" | "target_field" | "enabled"
>[] = [
  { collection_name: "org", source_field: "business_name", target_field: "name", enabled: true },
  { collection_name: "org", source_field: "slug", target_field: "slug", enabled: true },
  { collection_name: "org", source_field: "address", target_field: "addresss", enabled: true },
  { collection_name: "org", source_field: "phone", target_field: "tel", enabled: true },
  { collection_name: "org", source_field: "email", target_field: "email", enabled: true },
  { collection_name: "org", source_field: "description", target_field: "description", enabled: true },
];

const mappingInputSchema = z.object({
  collection_name: z.string().trim().min(1).max(100).default("org"),
  source_field: z.enum(ORG_MAPPING_SOURCE_FIELDS),
  target_field: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(true),
});

export type OrgFieldMappingInput = z.infer<typeof mappingInputSchema>;

export function normalizeOrgFieldMappingInput(raw: unknown): OrgFieldMappingInput {
  return mappingInputSchema.parse(raw);
}

const mappingPatchSchema = mappingInputSchema.partial();

export type OrgFieldMappingPatch = z.infer<typeof mappingPatchSchema>;

export function normalizeOrgFieldMappingPatch(raw: unknown): OrgFieldMappingPatch {
  const patch = mappingPatchSchema.parse(raw);
  if (Object.keys(patch).length === 0) {
    throw new Error("Nothing to update — provide at least one field.");
  }
  return patch;
}

export interface OrgFieldMappingsResult {
  mappings: OrgFieldMapping[];
  /** "database" when the table was read; "defaults" when it was unreachable. */
  source: "database" | "defaults";
}

export async function listOrgFieldMappings(): Promise<OrgFieldMappingsResult> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("provision_org_field_mappings")
    .select("id, collection_name, source_field, target_field, enabled, created_at, updated_at")
    .order("collection_name")
    .order("source_field");
  if (error) {
    return {
      mappings: DEFAULT_ORG_FIELD_MAPPINGS.map((m, i) => ({
        id: `default-${i}`,
        created_at: null,
        updated_at: null,
        ...m,
      })),
      source: "defaults",
    };
  }
  return { mappings: (data ?? []) as OrgFieldMapping[], source: "database" };
}

export async function createOrgFieldMapping(raw: unknown): Promise<OrgFieldMapping> {
  const input = normalizeOrgFieldMappingInput(raw);
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("provision_org_field_mappings")
    .insert(input)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(
        `A mapping for collection "${input.collection_name}" → field "${input.target_field}" already exists. Edit that row instead.`,
      );
    }
    throw new Error(error.message);
  }
  return data as OrgFieldMapping;
}

export async function updateOrgFieldMapping(id: string, raw: unknown): Promise<OrgFieldMapping> {
  const patch = normalizeOrgFieldMappingPatch(raw);
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("provision_org_field_mappings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      throw new Error("Another mapping already targets that collection field.");
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error("Mapping not found.");
  return data as OrgFieldMapping;
}

export async function deleteOrgFieldMapping(id: string): Promise<void> {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("provision_org_field_mappings")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Template-collection field names/keys for the admin UI's target-field
 * suggestions. Returns draft fields of the template tenant's collections
 * matching the given names.
 */
export async function listTemplateCollectionFields(
  templateTenantId: string,
  collectionNames: string[],
): Promise<Record<string, { key: string | null; name: string | null }[]>> {
  const supabase = getServiceSupabase();
  const out: Record<string, { key: string | null; name: string | null }[]> = {};
  if (!collectionNames.length) return out;

  const { data: colls } = await supabase
    .from("collections")
    .select("id, name")
    .eq("tenant_id", templateTenantId)
    .eq("is_published", false)
    .is("deleted_at", null)
    .in("name", collectionNames);
  for (const coll of colls ?? []) {
    const { data: fields } = await supabase
      .from("collection_fields")
      .select("key, name")
      .eq("collection_id", String(coll.id))
      .eq("tenant_id", templateTenantId)
      .eq("is_published", false)
      .is("deleted_at", null);
    out[String(coll.name)] = (fields ?? []).map((f) => ({
      key: f.key == null ? null : String(f.key),
      name: f.name == null ? null : String(f.name),
    }));
  }
  return out;
}
