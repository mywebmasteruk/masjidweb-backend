import type { SupabaseClient } from "@supabase/supabase-js";
import { getTemplateTenantId } from "./master-tenant-constants";
import { fetchTemplateVersionRows } from "./ycode-template-clone";

async function countTenantRows(
  supabase: SupabaseClient,
  table: string,
  tenantId: string,
  isPublished: boolean,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_published", isPublished)
    .is("deleted_at", null);

  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

/** After auto-publish, confirm collection items have a published snapshot. */
export async function appendPublishedCollectionDemoWarning(
  supabase: SupabaseClient,
  tenantId: string,
  warnings: string[],
): Promise<void> {
  const ciNew = await countTenantRows(
    supabase,
    "collection_items",
    tenantId,
    false,
  );
  const pubNew = await countTenantRows(
    supabase,
    "collection_items",
    tenantId,
    true,
  );
  if (pubNew === 0 && ciNew > 0) {
    warnings.push(
      "Demo check — No published collection items yet; run Publish in the builder or confirm auto-publish succeeded.",
    );
  }
}

/**
 * Compare cloned site + CMS seed against the template tenant.
 * Appends human-readable gaps to `warnings` (non-fatal).
 */
export async function verifyTenantDemoData(
  supabase: SupabaseClient,
  tenantId: string,
  warnings: string[],
  templateTenantId?: string,
  options?: { skipPublishedCollectionCheck?: boolean },
): Promise<void> {
  const tpl = templateTenantId ?? getTemplateTenantId();

  const mergedTplCollections = await fetchTemplateVersionRows(
    supabase,
    "collections",
    tpl,
  );
  const nCollDraft = await countTenantRows(supabase, "collections", tenantId, false);
  if (mergedTplCollections.length > 0 && nCollDraft !== mergedTplCollections.length) {
    warnings.push(
      `Demo check — Draft collections: merged template has ${mergedTplCollections.length}, new tenant has ${nCollDraft} (expected equal; partial clone or old provisioner).`,
    );
  }

  const mergedTplFields = await fetchTemplateVersionRows(
    supabase,
    "collection_fields",
    tpl,
  );
  const nFieldDraft = await countTenantRows(
    supabase,
    "collection_fields",
    tenantId,
    false,
  );
  if (mergedTplFields.length > 0 && nFieldDraft !== mergedTplFields.length) {
    warnings.push(
      `Demo check — Draft collection fields: merged template has ${mergedTplFields.length}, new tenant has ${nFieldDraft} (expected equal).`,
    );
  }

  const pairs: [string, string][] = [
    ["pages", "Draft pages"],
    ["page_layers", "Draft page layers"],
    ["components", "Draft components"],
    ["collections", "Draft collections"],
    ["assets", "Draft assets"],
    ["layer_styles", "Draft layer styles"],
    ["locales", "Draft locales"],
    ["fonts", "Draft fonts"],
  ];

  await Promise.all(
    pairs.map(async ([table, label]) => {
      const [t, n] = await Promise.all([
        countTenantRows(supabase, table, tpl, false),
        countTenantRows(supabase, table, tenantId, false),
      ]);
      if (t > 0 && n !== t) {
        warnings.push(
          `Demo check — ${label}: template has ${t}, new tenant has ${n} (expected ${t}).`,
        );
      }
    }),
  );

  const [ciTpl, ciNew] = await Promise.all([
    countTenantRows(supabase, "collection_items", tpl, false),
    countTenantRows(supabase, "collection_items", tenantId, false),
  ]);

  if (ciNew < 4) {
    warnings.push(
      `Demo check — CMS: only ${ciNew} draft collection items (expected several across Blog, Homepage, Navigation, Tenants).`,
    );
  } else if (ciTpl > 0 && ciNew < Math.min(ciTpl, 8)) {
    warnings.push(
      `Demo check — CMS draft items: template has ${ciTpl}, new tenant has ${ciNew} (may be OK if template was edited).`,
    );
  }

  // Registry-driven catch-all (Phase 1, fail-closed clone coverage): flag any table
  // classified 'clone' in public.mw_table_policy that the template has data in but the
  // new tenant has NONE. This covers tables the explicit checks above miss
  // (color_variables, page_folders, asset_folders, settings, translations,
  // global_variables, …) AND any NEW table a future Ycode core update adds. Read-only;
  // any RPC failure degrades to a warning so it never blocks provisioning.
  try {
    const { data: gaps, error: gapErr } = await supabase.rpc("mw_tenant_clone_gaps", {
      p_source: tpl,
      p_target: tenantId,
    });
    if (gapErr) {
      warnings.push(`Clone coverage check unavailable (non-fatal): ${gapErr.message}`);
    } else if (Array.isArray(gaps) && gaps.length > 0) {
      const list = (gaps as { table_name: string; source_rows: number }[])
        .map((g) => `${g.table_name} (template ${g.source_rows})`)
        .join(", ");
      warnings.push(
        `Clone coverage — these tables hold template data but were NOT cloned to the new tenant: ${list}. ` +
          `Extend the clone engine (ycode-template-clone.ts / clone_cms_for_tenant) before relying on this tenant.`,
      );
    }
  } catch (e) {
    warnings.push(
      `Clone coverage check error (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!options?.skipPublishedCollectionCheck) {
    await appendPublishedCollectionDemoWarning(supabase, tenantId, warnings);
  }
}
