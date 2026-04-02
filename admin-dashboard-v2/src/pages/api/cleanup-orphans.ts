import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { getServiceSupabase } from "../../lib/supabase-server";

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

  return new Response(
    JSON.stringify({
      ok: true,
      preview,
      totalPending: total,
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

  return new Response(
    JSON.stringify({
      ok: true,
      removed: data ?? [],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
