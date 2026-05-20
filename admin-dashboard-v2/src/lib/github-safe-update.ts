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

export async function dispatchAiRepairWorkflow(
  token: string,
  repo: string,
  prNumber: number,
): Promise<{ workflowUrl: string }> {
  if (!Number.isFinite(prNumber) || prNumber < 1) {
    throw new Error("Invalid pull request number");
  }

  const res = await fetch(
    `${GH}/repos/${repo}/actions/workflows/ai-repair-safe-update.yml/dispatches`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        ref: "main",
        inputs: { pr_number: String(prNumber) },
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
