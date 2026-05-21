import { getServiceSupabase } from "./supabase-server";

export type CoreUpdateAuditAction = "approve_merge" | "rollback_deploy" | "rollback_full";

export type CoreUpdateCheckpoint = {
  id: string;
  action: CoreUpdateAuditAction;
  prNumber: number | null;
  beforeMainSha: string | null;
  afterMainSha: string | null;
  beforeDeployId: string | null;
  afterDeployId: string | null;
  beforePackageVersion: string | null;
  afterPackageVersion: string | null;
  upstreamRef: string | null;
  safetyLevel: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

type AuditRow = {
  id: string;
  action: string;
  pr_number: number | null;
  before_main_sha: string | null;
  after_main_sha: string | null;
  before_deploy_id: string | null;
  after_deploy_id: string | null;
  before_package_version: string | null;
  after_package_version: string | null;
  upstream_ref: string | null;
  safety_level: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

function mapRow(row: AuditRow): CoreUpdateCheckpoint {
  return {
    id: row.id,
    action: row.action as CoreUpdateAuditAction,
    prNumber: row.pr_number,
    beforeMainSha: row.before_main_sha,
    afterMainSha: row.after_main_sha,
    beforeDeployId: row.before_deploy_id,
    afterDeployId: row.after_deploy_id,
    beforePackageVersion: row.before_package_version,
    afterPackageVersion: row.after_package_version,
    upstreamRef: row.upstream_ref,
    safetyLevel: row.safety_level,
    details: row.details ?? {},
    createdAt: row.created_at,
  };
}

/** Pure selection: latest approve_merge not superseded by a later rollback_full. */
export function pickLatestReversibleCheckpoint(
  rows: CoreUpdateCheckpoint[],
): CoreUpdateCheckpoint | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const lastFullRollback = sorted.find((r) => r.action === "rollback_full");
  const lastApprove = sorted.find((r) => r.action === "approve_merge");
  if (!lastApprove) return null;
  if (lastFullRollback && lastFullRollback.createdAt >= lastApprove.createdAt) {
    return null;
  }
  return lastApprove;
}

export async function insertCoreUpdateAudit(
  entry: Omit<CoreUpdateCheckpoint, "id" | "createdAt">,
): Promise<CoreUpdateCheckpoint | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("core_update_audit_log")
    .insert({
      action: entry.action,
      pr_number: entry.prNumber,
      before_main_sha: entry.beforeMainSha,
      after_main_sha: entry.afterMainSha,
      before_deploy_id: entry.beforeDeployId,
      after_deploy_id: entry.afterDeployId,
      before_package_version: entry.beforePackageVersion,
      after_package_version: entry.afterPackageVersion,
      upstream_ref: entry.upstreamRef,
      safety_level: entry.safetyLevel,
      details: entry.details,
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return mapRow(data as AuditRow);
}

/** Latest approve_merge not followed by rollback_full (still reversible via full rollback). */
export async function getLatestReversibleCheckpoint(): Promise<CoreUpdateCheckpoint | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("core_update_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data?.length) return null;

  const rows = (data as AuditRow[]).map(mapRow);
  return pickLatestReversibleCheckpoint(rows);
}
