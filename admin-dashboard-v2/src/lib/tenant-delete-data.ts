import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * YCode / CMS tables keyed by tenant_id. Keep aligned with
 * `public.delete_tenant_scoped_data` and `tenant-clone-manifest.ts`.
 * Order respects typical FK direction (children / dependents first).
 */
export const TENANT_SCOPED_CONTENT_TABLES = [
  "webhook_deliveries",
  "webhooks",
  "versions",
  "collection_imports",
  "api_keys",
  "mcp_tokens",
  "app_settings",
  "form_submissions",
  "collection_item_values",
  "collection_items",
  "page_layers",
  "collection_fields",
  "pages",
  "page_folders",
  "collections",
  "components",
  "layer_styles",
  "color_variables",
  "assets",
  "asset_folders",
  "fonts",
  "translations",
  "locales",
  "settings",
  "tenant_homepage_content",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUuid(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  return UUID_RE.test(s) ? s : null;
}

export function effectiveAuthUserMetadataForCleanup(
  user: Pick<User, "app_metadata" | "user_metadata"> & {
    raw_app_meta_data?: Record<string, unknown>;
    raw_user_meta_data?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const legacyUser = user.raw_user_meta_data ?? {};
  const legacyApp = user.raw_app_meta_data ?? {};
  const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  return { ...legacyUser, ...userMeta, ...legacyApp, ...appMeta };
}

function tenantIdFromEffective(meta: Record<string, unknown>): string | null {
  return normalizeUuid(meta.tenant_id);
}

function tenantSlugFromEffective(meta: Record<string, unknown>): string | null {
  const raw = meta.tenant_slug;
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  return s || null;
}

function hasInviteMarker(meta: Record<string, unknown>): boolean {
  return meta.invited_at != null && meta.invited_at !== "";
}

async function listAllAuthUsers(
  supabase: SupabaseClient,
  warnings: string[],
): Promise<User[]> {
  const out: User[] = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      warnings.push(`listUsers (page ${page}): ${error.message}`);
      break;
    }
    const batch = data?.users ?? [];
    out.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return out;
}

/**
 * Delete Supabase Auth users whose `user_metadata.tenant_id` equals the given tenant.
 * Collects all users first so pagination stays stable while deleting.
 */
async function deleteAuthUsersForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  warnings: string[],
): Promise<void> {
  const want = normalizeUuid(tenantId);
  if (!want) return;

  const users = await listAllAuthUsers(supabase, warnings);
  for (const u of users) {
    const meta = effectiveAuthUserMetadataForCleanup(u);
    const tid = tenantIdFromEffective(meta);
    if (tid !== want) continue;
    const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
    if (delErr) {
      warnings.push(`Failed to delete auth user ${u.email ?? u.id}: ${delErr.message}`);
    }
  }
}

export type AuthOrphanCleanupResult = {
  removed: number;
  repaired: number;
  /** Subset of `removed`: users deleted only because they had no tenant_id and no tenant_slug. */
  removedUnassigned: number;
};

export type AuthCleanupOptions = {
  /**
   * Delete Auth users with no tenant UUID and no tenant_slug in metadata (stray signups / tests).
   * Dangerous unless `preserveEmails` includes operator accounts. Default off.
   */
  deleteFullyUnassigned: boolean;
  /** Lowercased emails never deleted when `deleteFullyUnassigned` is true. */
  preserveEmails: Set<string>;
};

function isPreservedEmail(email: string | undefined, preserve: Set<string>): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e.length > 0 && preserve.has(e);
}

/**
 * Align Auth users with `tenant_registry`:
 * - Remove users whose tenant_id (any metadata source) is not a current tenant (case-normalized).
 * - Remove users whose tenant_slug does not match any tenant when they have no valid tenant_id.
 * - Remove users invited via generic builder invite (invited_at) with no tenant_id and no tenant_slug.
 * - Repair users who have a valid slug but missing/wrong tenant_id by setting user_metadata.tenant_id.
 * - Optional (`deleteFullyUnassigned`): remove users with neither tenant_id nor tenant_slug (not preserved).
 */
export async function deleteAuthUsersForMissingTenants(
  supabase: SupabaseClient,
  warnings: string[],
  options?: AuthCleanupOptions,
): Promise<AuthOrphanCleanupResult> {
  const { data: tenants, error } = await supabase.from("tenant_registry").select("id, slug");
  if (error) {
    warnings.push(`tenant_registry load for auth cleanup: ${error.message}`);
    return { removed: 0, repaired: 0, removedUnassigned: 0 };
  }

  const rows = tenants ?? [];
  const validIds = new Set(rows.map((r) => String(r.id).trim().toLowerCase()));
  const slugToId = new Map<string, string>();
  for (const r of rows) {
    if (r.slug) slugToId.set(String(r.slug).trim(), String(r.id).trim().toLowerCase());
  }

  const users = await listAllAuthUsers(supabase, warnings);
  let removed = 0;
  let repaired = 0;
  let removedUnassigned = 0;
  const deleteUnassigned = options?.deleteFullyUnassigned === true;
  const preserve = options?.preserveEmails ?? new Set<string>();

  for (const u of users) {
    const meta = effectiveAuthUserMetadataForCleanup(u);
    const tid = tenantIdFromEffective(meta);
    const slug = tenantSlugFromEffective(meta);

    if (tid && validIds.has(tid)) {
      continue;
    }

    if (tid && !validIds.has(tid)) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) {
        warnings.push(`Failed to delete orphan auth user ${u.email ?? u.id}: ${delErr.message}`);
      } else {
        removed += 1;
      }
      continue;
    }

    if (!tid && slug) {
      const canonicalId = slugToId.get(slug);
      if (canonicalId) {
        const { error: upErr } = await supabase.auth.admin.updateUserById(u.id, {
          user_metadata: {
            ...(u.user_metadata as Record<string, unknown>),
            tenant_id: canonicalId,
            tenant_slug: slug,
          },
        });
        if (upErr) {
          warnings.push(`Failed to repair auth user ${u.email ?? u.id}: ${upErr.message}`);
        } else {
          repaired += 1;
        }
        continue;
      }
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) {
        warnings.push(`Failed to delete slug-orphan user ${u.email ?? u.id}: ${delErr.message}`);
      } else {
        removed += 1;
      }
      continue;
    }

    if (!tid && !slug && hasInviteMarker(meta)) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) {
        warnings.push(`Failed to delete unassigned invite user ${u.email ?? u.id}: ${delErr.message}`);
      } else {
        removed += 1;
      }
      continue;
    }

    if (!tid && !slug && deleteUnassigned && !isPreservedEmail(u.email, preserve)) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) {
        warnings.push(`Failed to delete fully unassigned auth user ${u.email ?? u.id}: ${delErr.message}`);
      } else {
        removed += 1;
        removedUnassigned += 1;
      }
    }
  }

  return { removed, repaired, removedUnassigned };
}

/**
 * Delete all CMS/YCode rows for a tenant and remove Supabase auth users tagged with that tenant_id.
 */
export async function deleteTenantScopedData(
  supabase: SupabaseClient,
  tenantId: string,
  warnings: string[],
): Promise<void> {
  for (const table of TENANT_SCOPED_CONTENT_TABLES) {
    const { error } = await supabase.from(table).delete().eq("tenant_id", tenantId);
    if (error && !error.message.includes("does not exist")) {
      warnings.push(`Failed to clean ${table}: ${error.message}`);
    }
  }

  try {
    await deleteAuthUsersForTenant(supabase, tenantId, warnings);
  } catch (e) {
    warnings.push(`Auth user cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }
}
