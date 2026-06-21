const GH = "https://api.github.com";
const AI_REPAIR_WORKFLOW_FILE = "ai-repair-safe-update.yml";

export class GithubWorkflowDispatchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GithubWorkflowDispatchError";
  }
}
const AI_REPAIR_STAGE_NAMES = [
  "Dispatching workflow",
  "Deterministic Autopilot repair",
  "Premium AI repairing files one by one",
  "Running tenant safety checks",
  "Build/type-check",
  "Commit/push repairs",
  "Completed / failed",
] as const;

type AiRepairStageName = (typeof AI_REPAIR_STAGE_NAMES)[number];

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
    throw new GithubWorkflowDispatchError(`GitHub workflow dispatch failed: ${res.status}`, res.status);
  }
}

export function githubActionsWorkflowUrl(repo: string, workflowFile: string): string {
  return `https://github.com/${repo}/actions/workflows/${workflowFile}`;
}

export type AiRepairWorkflowStep = {
  name: string;
  status: string;
  conclusion: string | null;
  number?: number;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type AiRepairWorkflowJob = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: AiRepairWorkflowStep[];
};

export type AiRepairWorkflowArtifact = {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
  createdAt: string;
  updatedAt: string;
  downloadUrl: string;
};

export type AiRepairWorkflowStage = {
  name: AiRepairStageName;
  status: "done" | "current" | "pending" | "failed" | "skipped";
  detail: string | null;
};

export type AiRepairWorkflowRun = {
  id: number;
  status: "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required" | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  currentStep: string | null;
  currentJob: string | null;
  jobs: AiRepairWorkflowJob[];
  stages: AiRepairWorkflowStage[];
  artifacts: AiRepairWorkflowArtifact[];
  failureSummary: string | null;
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
  number?: number;
  started_at?: string | null;
  completed_at?: string | null;
};

type GithubJob = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  steps?: GithubJobStep[];
};

type GithubArtifact = {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  created_at: string;
  updated_at: string;
  archive_download_url: string;
};

async function ghFetch<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${url}`);
  }
  return (await res.json()) as T;
}

function mapStep(step: GithubJobStep): AiRepairWorkflowStep {
  return {
    name: step.name,
    status: step.status,
    conclusion: step.conclusion,
    number: step.number,
    startedAt: step.started_at ?? null,
    completedAt: step.completed_at ?? null,
  };
}

function mapJob(job: GithubJob): AiRepairWorkflowJob {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    htmlUrl: job.html_url ?? null,
    startedAt: job.started_at ?? null,
    completedAt: job.completed_at ?? null,
    steps: Array.isArray(job.steps) ? job.steps.map(mapStep) : [],
  };
}

function stepMatches(stepName: string, needles: string[]): boolean {
  const normalized = stepName.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function stageStatusFromSteps(
  steps: AiRepairWorkflowStep[],
  needles: string[],
): AiRepairWorkflowStage["status"] | null {
  const matching = steps.filter((step) => stepMatches(step.name, needles));
  if (matching.length === 0) return null;
  if (matching.some((step) => step.status === "in_progress" || step.status === "queued")) {
    return "current";
  }
  if (matching.some((step) => step.conclusion === "failure" || step.conclusion === "timed_out")) {
    return "failed";
  }
  if (matching.every((step) => step.conclusion === "success")) return "done";
  if (matching.every((step) => step.conclusion === "skipped")) return "skipped";
  return "pending";
}

function stageDetailFromSteps(steps: AiRepairWorkflowStep[], needles: string[]): string | null {
  const active = steps.find(
    (step) => stepMatches(step.name, needles) && (step.status === "in_progress" || step.status === "queued"),
  );
  if (active) return active.name;
  const failed = steps.find(
    (step) => stepMatches(step.name, needles) && (step.conclusion === "failure" || step.conclusion === "timed_out"),
  );
  if (failed) return failed.name;
  const latest = steps.findLast((step) => stepMatches(step.name, needles));
  return latest?.name ?? null;
}

function buildStages(
  run: GithubWorkflowRun,
  jobs: AiRepairWorkflowJob[],
  currentStep: string | null,
): AiRepairWorkflowStage[] {
  const steps = jobs.flatMap((job) => job.steps);
  const definitions: Array<{ name: AiRepairStageName; needles: string[] }> = [
    { name: "Dispatching workflow", needles: ["check out repository", "resolve pr head", "checkout pr branch"] },
    { name: "Deterministic Autopilot repair", needles: ["deterministic autopilot", "autopilot repair"] },
    { name: "Premium AI repairing files one by one", needles: ["premium ai", "ai conflict repair"] },
    { name: "Running tenant safety checks", needles: ["tenant safety", "tenant isolation", "autopilot tenant guard", "safety tests"] },
    { name: "Build/type-check", needles: ["type-check", "production build", "verify production build", "install dependencies"] },
    { name: "Commit/push repairs", needles: ["commit and push", "mark pr ready", "re-run update safety"] },
  ];

  const stages = definitions.map<AiRepairWorkflowStage>((definition) => {
    const status = stageStatusFromSteps(steps, definition.needles);
    return {
      name: definition.name,
      status: status ?? "pending",
      detail: stageDetailFromSteps(steps, definition.needles),
    };
  });

  if (run.status === "queued" || run.status === "pending" || run.status === "requested") {
    stages[0] = { ...stages[0], status: "current", detail: currentStep };
  } else if (run.status === "in_progress" && !stages.some((stage) => stage.status === "current")) {
    const firstPending = stages.findIndex((stage) => stage.status === "pending");
    const index = firstPending >= 0 ? firstPending : stages.length - 1;
    stages[index] = { ...stages[index], status: "current", detail: currentStep };
  }

  stages.push({
    name: "Completed / failed",
    status:
      run.status === "completed"
        ? run.conclusion === "success"
          ? "done"
          : "failed"
        : "pending",
    detail: run.status === "completed" ? run.conclusion ?? "completed" : null,
  });

  return stages;
}

function buildFailureSummary(run: GithubWorkflowRun, jobs: AiRepairWorkflowJob[]): string | null {
  if (run.status !== "completed" || run.conclusion === "success" || run.conclusion == null) {
    return null;
  }
  const failedParts = jobs.flatMap((job) => {
    const failedSteps = job.steps.filter(
      (step) => step.conclusion === "failure" || step.conclusion === "timed_out",
    );
    if (failedSteps.length > 0) {
      return failedSteps.map((step) => `${job.name}: ${step.name} ${step.conclusion ?? "failed"}`);
    }
    if (job.conclusion === "failure" || job.conclusion === "timed_out") {
      return [`${job.name}: ${job.conclusion}`];
    }
    return [];
  });
  if (failedParts.length === 0) {
    return `Workflow finished with conclusion: ${run.conclusion}. Open the GitHub run for logs.`;
  }
  return failedParts.slice(0, 5).join("\n");
}

async function workflowRunJobs(
  token: string,
  repo: string,
  runId: number,
): Promise<AiRepairWorkflowJob[]> {
  const data = await ghFetch<{ jobs?: GithubJob[] }>(
    token,
    `${GH}/repos/${repo}/actions/runs/${runId}/jobs?per_page=50`,
  );
  return (data.jobs ?? []).map(mapJob);
}

async function workflowRunArtifacts(
  token: string,
  repo: string,
  runId: number,
): Promise<AiRepairWorkflowArtifact[]> {
  const data = await ghFetch<{ artifacts?: GithubArtifact[] }>(
    token,
    `${GH}/repos/${repo}/actions/runs/${runId}/artifacts?per_page=20`,
  );
  return (data.artifacts ?? [])
    .filter((artifact) => artifact.name.includes("repair") || artifact.name.includes("guard"))
    .map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      sizeInBytes: artifact.size_in_bytes,
      expired: artifact.expired,
      createdAt: artifact.created_at,
      updatedAt: artifact.updated_at,
      downloadUrl: artifact.archive_download_url,
    }));
}

function getCurrentJobAndStep(jobs: AiRepairWorkflowJob[]): {
  currentJob: string | null;
  currentStep: string | null;
} {
  const activeJob = jobs.find((job) => job.status === "in_progress" || job.status === "queued");
  const activeStep = activeJob?.steps.find(
    (step) => step.status === "in_progress" || step.status === "queued" || step.status === "pending",
  );
  if (activeStep || activeJob) {
    return { currentJob: activeJob?.name ?? null, currentStep: activeStep?.name ?? null };
  }

  const latestJob = jobs.findLast((job) => job.status === "completed");
  const latestStep = latestJob?.steps.findLast((step) => step.status === "completed");
  return { currentJob: latestJob?.name ?? null, currentStep: latestStep?.name ?? null };
}

async function mapWorkflowRun(
  token: string,
  repo: string,
  run: GithubWorkflowRun,
): Promise<AiRepairWorkflowRun> {
  const jobs = await workflowRunJobs(token, repo, run.id);
  const artifacts = await workflowRunArtifacts(token, repo, run.id);
  const { currentJob, currentStep } = getCurrentJobAndStep(jobs);
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    currentStep,
    currentJob,
    jobs,
    stages: buildStages(run, jobs, currentStep),
    artifacts,
    failureSummary: buildFailureSummary(run, jobs),
  };
}

/** Latest AI repair workflow run if still active or finished within the last 20 minutes. */
export async function getActiveAiRepairRun(
  token: string,
  repo: string,
): Promise<AiRepairWorkflowRun | null> {
  const data = await ghFetch<{ workflow_runs?: GithubWorkflowRun[] }>(
    token,
    `${GH}/repos/${repo}/actions/workflows/${AI_REPAIR_WORKFLOW_FILE}/runs?per_page=10`,
  );
  const runs = data.workflow_runs ?? [];
  if (runs.length === 0) return null;

  const now = Date.now();
  const recentMs = 20 * 60 * 1000;

  for (const run of runs) {
    if (run.status === "queued" || run.status === "in_progress" || run.status === "pending") {
      return mapWorkflowRun(token, repo, run);
    }
  }

  const latest = runs[0];
  const updated = new Date(latest.updated_at).getTime();
  if (Number.isNaN(updated) || now - updated > recentMs) {
    return null;
  }

  return mapWorkflowRun(token, repo, latest);
}

export async function getLatestAiRepairRunAfter(
  token: string,
  repo: string,
  startedAt: Date,
): Promise<AiRepairWorkflowRun | null> {
  const data = await ghFetch<{ workflow_runs?: GithubWorkflowRun[] }>(
    token,
    `${GH}/repos/${repo}/actions/workflows/${AI_REPAIR_WORKFLOW_FILE}/runs?per_page=10&event=workflow_dispatch`,
  );
  const startedAtMs = startedAt.getTime() - 30_000;
  const run = (data.workflow_runs ?? []).find((candidate) => {
    const createdAt = new Date(candidate.created_at).getTime();
    return !Number.isNaN(createdAt) && createdAt >= startedAtMs;
  });
  return run ? mapWorkflowRun(token, repo, run) : null;
}

export function describeAiRepairRun(run: AiRepairWorkflowRun | null | undefined): string | null {
  if (!run) return null;
  if (run.status === "queued" || run.status === "pending" || run.status === "requested") {
    return "Premium AI repair is queued on GitHub.";
  }
  if (run.status === "in_progress") {
    const current = run.currentStep || run.currentJob;
    return current
      ? `Premium AI repair running: ${current}.`
      : "Premium AI repair is running on GitHub.";
  }
  if (run.conclusion === "success") {
    return "Premium AI repair completed successfully. Refreshing pull request status.";
  }
  if (run.conclusion === "failure") {
    return run.failureSummary
      ? `Premium AI repair failed:\n${run.failureSummary}`
      : "Premium AI repair failed. Open the GitHub run for logs and repair artifacts.";
  }
  if (run.conclusion === "cancelled") {
    return "Premium AI repair was cancelled on GitHub.";
  }
  return "Premium AI repair workflow completed. Refresh status to see whether the pull request is ready.";
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
  const repairMode = opts?.repairMode ?? "premium_ai";
  const openrouterModel = opts?.openrouterModel?.trim() ?? "";

  const res = await fetch(
    `${GH}/repos/${repo}/actions/workflows/${AI_REPAIR_WORKFLOW_FILE}/dispatches`,
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
    throw new GithubWorkflowDispatchError(
      `GitHub AI repair workflow dispatch failed: ${res.status}`,
      res.status,
    );
  }

  return {
    workflowUrl: githubActionsWorkflowUrl(repo, AI_REPAIR_WORKFLOW_FILE),
  };
}
