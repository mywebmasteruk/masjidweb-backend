import { getServiceSupabase } from "./supabase-server";

export type IsolationCheckStatus = "pass" | "fail";

export type IsolationCheckRun = {
  id: string;
  status: IsolationCheckStatus;
  durationMs: number | null;
  repository: string | null;
  branch: string | null;
  commitSha: string | null;
  workflowRunId: string | null;
  workflowRunUrl: string | null;
  workflowName: string | null;
  summary: string | null;
  failureOutput: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type IsolationCheckInsert = {
  status: IsolationCheckStatus;
  durationMs?: number | null;
  repository?: string | null;
  branch?: string | null;
  commitSha?: string | null;
  workflowRunId?: string | null;
  workflowRunUrl?: string | null;
  workflowName?: string | null;
  summary?: string | null;
  failureOutput?: string | null;
  details?: Record<string, unknown>;
};

type AuditRow = {
  id: string;
  status: string;
  duration_ms: number | null;
  repository: string | null;
  branch: string | null;
  commit_sha: string | null;
  workflow_run_id: string | null;
  workflow_run_url: string | null;
  workflow_name: string | null;
  summary: string | null;
  failure_output: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

function mapRow(row: AuditRow): IsolationCheckRun {
  return {
    id: row.id,
    status: row.status as IsolationCheckStatus,
    durationMs: row.duration_ms,
    repository: row.repository,
    branch: row.branch,
    commitSha: row.commit_sha,
    workflowRunId: row.workflow_run_id,
    workflowRunUrl: row.workflow_run_url,
    workflowName: row.workflow_name,
    summary: row.summary,
    failureOutput: row.failure_output,
    details: row.details ?? {},
    createdAt: row.created_at,
  };
}

const MAX_FAILURE_OUTPUT_CHARS = 120_000;

/** Truncate very large Vitest logs so inserts stay within Postgres limits. */
export function truncateFailureOutput(output: string | null | undefined): string | null {
  if (!output?.trim()) return null;
  const trimmed = output.trim();
  if (trimmed.length <= MAX_FAILURE_OUTPUT_CHARS) return trimmed;
  return (
    trimmed.slice(0, MAX_FAILURE_OUTPUT_CHARS) +
    "\n\n… (truncated — open the GitHub Actions run for full logs)"
  );
}

export function parseIsolationCheckPayload(body: Record<string, unknown>): {
  ok: true;
  entry: IsolationCheckInsert;
} | { ok: false; error: string } {
  const status = body.status;
  if (status !== "pass" && status !== "fail") {
    return { ok: false, error: "status must be pass or fail" };
  }

  const durationMs =
    typeof body.durationMs === "number" && Number.isFinite(body.durationMs)
      ? Math.max(0, Math.round(body.durationMs))
      : null;

  const str = (key: string): string | null => {
    const v = body[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  return {
    ok: true,
    entry: {
      status,
      durationMs,
      repository: str("repository"),
      branch: str("branch"),
      commitSha: str("commitSha"),
      workflowRunId: str("workflowRunId"),
      workflowRunUrl: str("workflowRunUrl"),
      workflowName: str("workflowName"),
      summary: str("summary"),
      failureOutput: truncateFailureOutput(str("failureOutput")),
      details:
        body.details && typeof body.details === "object" && !Array.isArray(body.details)
          ? (body.details as Record<string, unknown>)
          : {},
    },
  };
}

export async function insertIsolationCheckRun(
  entry: IsolationCheckInsert,
): Promise<IsolationCheckRun | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("tenant_isolation_check_log")
    .insert({
      status: entry.status,
      duration_ms: entry.durationMs ?? null,
      repository: entry.repository ?? null,
      branch: entry.branch ?? null,
      commit_sha: entry.commitSha ?? null,
      workflow_run_id: entry.workflowRunId ?? null,
      workflow_run_url: entry.workflowRunUrl ?? null,
      workflow_name: entry.workflowName ?? null,
      summary: entry.summary ?? null,
      failure_output: entry.failureOutput ?? null,
      details: entry.details ?? {},
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return mapRow(data as AuditRow);
}

export async function listIsolationCheckRuns(limit = 100): Promise<IsolationCheckRun[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("tenant_isolation_check_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];
  return (data as AuditRow[]).map(mapRow);
}
