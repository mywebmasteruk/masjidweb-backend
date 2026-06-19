const GH = "https://api.github.com";

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

export async function dispatchSafeUpdateWorkflow(token: string, repo: string): Promise<void> {
  const res = await fetch(
    `${GH}/repos/${repo}/actions/workflows/sync-upstream.yml/dispatches`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ ref: "main" }),
    },
  );

  if (!res.ok) {
    throw new Error(`GitHub workflow dispatch failed: ${res.status}`);
  }
}

export function githubActionsWorkflowUrl(repo: string, workflowFile: string): string {
  return `https://github.com/${repo}/actions/workflows/${workflowFile}`;
}

export type AiRepairWorkflowRun = {
  id: number;
  status: "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required" | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  currentStep: string | null;
};

type GithubWorkflowRun = {
  id: number;
  status: AiRepairWorkflowRun["status"];
  conclusion: AiRepairWorkflowRun["conclusion"];
  html_url: string;
  created_at: string;
  updated_at: string;
};

type GithubJobStep = {
  name: string;
  status: string;
  conclusion: string | null;
};

async function ghFetch<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${url}`);
  }
  return (await res.json()) as T;
}

async function workflowRunCurrentStep(
  token: string,
  repo: string,
  runId: number,
): Promise<string | null> {
  const data = await ghFetch<{ jobs?: Array<{ steps?: GithubJobStep[] }> }>(
    token,
    `${GH}/repos/${repo}/actions/runs/${runId}/jobs?per_page=5`,
  );
  const steps = data.jobs?.[0]?.steps;
  if (!Array.isArray(steps)) return null;
  const active = steps.find((step) => step.status === "in_progress");
  if (active) return active.name;
  const pending = steps.find((step) => step.status === "pending" && step.conclusion == null);
  return pending?.name ?? null;
}

function mapWorkflowRun(run: GithubWorkflowRun, currentStep: string | null): AiRepairWorkflowRun {
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    currentStep,
  };
}

/** Latest AI repair workflow run if still active or finished within the last 20 minutes. */
export async function getActiveAiRepairRun(
  token: string,
  repo: string,
): Promise<AiRepairWorkflowRun | null> {
  const data = await ghFetch<{ workflow_runs?: GithubWorkflowRun[] }>(
    token,
    `${GH}/repos/${repo}/actions/workflows/ai-repair-safe-update.yml/runs?per_page=5`,
  );
  const runs = data.workflow_runs ?? [];
  if (runs.length === 0) return null;

  const now = Date.now();
  const recentMs = 20 * 60 * 1000;

  for (const run of runs) {
    if (run.status === "queued" || run.status === "in_progress" || run.status === "pending") {
      const currentStep = await workflowRunCurrentStep(token, repo, run.id);
      return mapWorkflowRun(run, currentStep);
    }
  }

  const latest = runs[0];
  const updated = new Date(latest.updated_at).getTime();
  if (Number.isNaN(updated) || now - updated > recentMs) {
    return null;
  }

  const currentStep =
    latest.status === "completed" ? null : await workflowRunCurrentStep(token, repo, latest.id);
  return mapWorkflowRun(latest, currentStep);
}

export function describeAiRepairRun(run: AiRepairWorkflowRun | null | undefined): string | null {
  if (!run) return null;
  if (run.status === "queued" || run.status === "pending") {
    return "Automated repair is queued on GitHub…";
  }
  if (run.status === "in_progress") {
    return run.currentStep
      ? `Automated repair running: ${run.currentStep}…`
      : "Automated repair running on GitHub…";
  }
  if (run.conclusion === "success") {
    return "Automated repair finished successfully. Refreshing pull request status…";
  }
  if (run.conclusion === "failure") {
    return "Autopilot blocked or failed this update. If tenant-sensitive conflicts remain, a developer is required — check your email.";
  }
  if (run.conclusion === "cancelled") {
    return "Automated repair was cancelled on GitHub.";
  }
  return "Automated repair workflow completed. Refresh status to see whether the pull request is ready.";
}

export type CopilotEscalationMode = "none" | "comment" | "issue" | "assign";
export type AiRepairMode = "autopilot" | "premium_ai";

export async function dispatchAiRepairWorkflow(
  token: string,
  repo: string,
  prNumber: number,
  opts?: {
    copilotEscalationMode?: CopilotEscalationMode;
    repairMode?: AiRepairMode;
    openrouterModel?: string | null;
  },
): Promise<{ workflowUrl: string }> {
  if (!Number.isFinite(prNumber) || prNumber < 1) {
    throw new Error("Invalid pull request number");
  }

  const copilotEscalationMode = opts?.copilotEscalationMode ?? "none";
  const repairMode = opts?.repairMode ?? "autopilot";
  const openrouterModel = opts?.openrouterModel?.trim() ?? "";

  const res = await fetch(
    `${GH}/repos/${repo}/actions/workflows/ai-repair-safe-update.yml/dispatches`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        ref: "main",
        inputs: {
          pr_number: String(prNumber),
          mechanical_only: repairMode === "premium_ai" ? false : true,
          repair_mode: repairMode,
          openrouter_model: openrouterModel,
          copilot_escalation_mode: copilotEscalationMode,
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`GitHub AI repair workflow dispatch failed: ${res.status}`);
  }

  return {
    workflowUrl: githubActionsWorkflowUrl(repo, "ai-repair-safe-update.yml"),
  };
}
