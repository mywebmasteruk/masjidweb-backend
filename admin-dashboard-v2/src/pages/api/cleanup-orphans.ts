import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { getServiceSupabase } from "../../lib/supabase-server";
import { deleteAuthUsersForMissingTenants } from "../../lib/tenant-delete-data";

/**
 * GET /api/cleanup-orphans
 * Runs public.count_orphan_tenant_rows() — preview row counts per table (no deletes).
 */
export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("count_orphan_tenant_rows");

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const preview = data ?? [];
  const total = preview.reduce(
    (sum: number, row: { pending?: number }) => sum + (Number(row.pending) || 0),
    0,
  );

  const rawUnassigned = import.meta.env.AUTH_CLEANUP_DELETE_UNASSIGNED;
  const authCleanupUnassignedEnabled =
    rawUnassigned === "true" || rawUnassigned === "1" || String(rawUnassigned).toLowerCase() === "yes";

  return new Response(
    JSON.stringify({
      ok: true,
      preview,
      totalPending: total,
      authCleanupUnassignedEnabled,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

/**
 * POST /api/cleanup-orphans
 * Runs public.cleanup_orphan_tenant_rows() — removes YCode/CMS rows whose tenant_id
 * is not present in tenant_registry (and translations tied to orphan locales).
 */
export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("cleanup_orphan_tenant_rows");

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authWarnings: string[] = [];
  const rawUnassigned = import.meta.env.AUTH_CLEANUP_DELETE_UNASSIGNED;
  const deleteFullyUnassigned =
    rawUnassigned === "true" || rawUnassigned === "1" || String(rawUnassigned).toLowerCase() === "yes";
  const rawPreserve = String(import.meta.env.AUTH_CLEANUP_PRESERVE_AUTH_EMAILS ?? "");
  const preserveEmails = new Set<string>(
    rawPreserve
      .split(",")
      .map((e: string) => e.trim().toLowerCase())
      .filter((e): e is string => e.length > 0),
  );

  const auth = await deleteAuthUsersForMissingTenants(supabase, authWarnings, {
    deleteFullyUnassigned,
    preserveEmails,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      removed: data ?? [],
      authUsersRemoved: auth.removed,
      authUsersRepaired: auth.repaired,
      authUsersRemovedUnassigned: auth.removedUnassigned,
      authCleanupUnassignedEnabled: deleteFullyUnassigned,
      ...(authWarnings.length ? { warnings: authWarnings } : {}),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
