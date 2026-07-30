import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import {
  GithubWorkflowDispatchError,
  githubActionsWorkflowUrl,
  startFreshSafeUpdate,
} from "../../../lib/github-safe-update";
import { githubProductionBranch } from "../../../lib/updates-env";

const json = { "Content-Type": "application/json" } as const;

/**
 * POST /api/updates/regenerate-safe-update
 *
 * One-click recovery for a STALE safe-update PR (prepared before production
 * main advanced, or before a newer upstream release): closes every open
 * safe-update PR that would block sync-upstream, then dispatches so a fresh
 * PR is prepared from current production code. Live production unchanged.
 */
export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: json });
  }

  const github = getGithubUpdatesConfig();
  if (!github) {
    return new Response(
      JSON.stringify({ ok: false, error: "GITHUB_TOKEN or GITHUB_REPO not configured" }),
      { status: 500, headers: json },
    );
  }
  const { token, workflowToken, repo } = github;

  try {
    const result = await startFreshSafeUpdate({
      token,
      workflowToken,
      repo,
      productionBranch: githubProductionBranch(),
      reason: "regenerate",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        closedPr: result.closedPrs[0] ?? null,
        closedPrs: result.closedPrs,
        message: result.message,
      }),
      { headers: json },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const workflowUrl = githubActionsWorkflowUrl(repo, "sync-upstream.yml");
    let hint = "";
    let configIssue: string | undefined;
    if (e instanceof GithubWorkflowDispatchError && e.status === 401) {
      configIssue = "github_workflow_token_unauthorized";
      hint =
        " Configure GITHUB_WORKFLOW_TOKEN or GITHUB_TOKEN with Actions workflow write access for the builder repo.";
    } else if (e instanceof GithubWorkflowDispatchError && e.status === 403) {
      configIssue = "github_workflow_token_forbidden";
      hint =
        " The GitHub token cannot dispatch workflows. Grant Actions write for the builder repo.";
    } else if (/Failed to close PR #\d+:/.test(message)) {
      configIssue = "github_token_cannot_close_prs";
      hint =
        " GITHUB_TOKEN needs Pull requests: Read and write on the builder repo. Or close the open safe-ycode-update PR on GitHub, then click Regenerate again.";
    }
    return new Response(
      JSON.stringify({
        ok: false,
        error: message + hint,
        message: "Could not regenerate the update. Live production was not changed." + hint,
        workflowUrl,
        configIssue,
      }),
      { status: 500, headers: json },
    );
  }
};
