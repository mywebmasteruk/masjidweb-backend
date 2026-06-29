import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { getServiceSupabase } from "../../lib/supabase-server";

/**
 * GET /api/schema-drift
 *
 * Tenant-isolation tripwire (Phase 2). Runs public.mw_unclassified_tables() on the
 * production DB: returns any public table that is NOT classified in
 * public.mw_table_policy (i.e. arrived via a Ycode core update) or whose
 * tenant_id presence disagrees with its classification.
 *
 * clean === true (empty result) means every table is classified and consistent.
 * A non-empty result means a new/changed table must be classified (and isolated +
 * added to cloning if it holds tenant data) BEFORE the next core update ships.
 *
 * Read-only. Uses the dashboard's service-role client — the same pattern as
 * /api/cleanup-orphans. The function is granted to service_role only.
 */

type DriftRow = {
  table_name: string;
  has_tenant_id: boolean;
  issue: string;
};

export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceSupabase();

  const { data: driftData, error: driftError } = await supabase.rpc("mw_unclassified_tables");
  if (driftError) {
    return new Response(JSON.stringify({ ok: false, error: driftError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tables = (driftData ?? []) as DriftRow[];

  // Policy summary for the "N tables classified" reassurance line. Best-effort:
  // a failure here must not mask the drift result, so it degrades to null.
  const policyCounts: Record<string, number> = {};
  let totalClassified: number | null = null;
  const { data: policyData, error: policyError } = await supabase
    .from("mw_table_policy")
    .select("policy");
  if (!policyError && policyData) {
    totalClassified = policyData.length;
    for (const row of policyData as { policy: string }[]) {
      policyCounts[row.policy] = (policyCounts[row.policy] ?? 0) + 1;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      clean: tables.length === 0,
      count: tables.length,
      tables,
      totalClassified,
      policyCounts,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
