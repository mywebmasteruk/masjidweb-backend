import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import { formatCoreUpdateEmail, sendCoreUpdateEmail } from "../../../lib/core-update-email";
import {
  GithubWorkflowDispatchError,
  dispatchSafeUpdateWorkflow,
  githubActionsWorkflowUrl,
} from "../../../lib/github-safe-update";

const json = { "Content-Type": "application/json" } as const;

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: json,
    });
  }

  const github = getGithubUpdatesConfig();
  if (!github) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "GITHUB_TOKEN or GITHUB_REPO not configured",
        message: "Update setup is incomplete. Production has not changed.",
      }),
      { status: 500, headers: json },
    );
  }
  const { workflowToken, repo } = github;

  try {
    await dispatchSafeUpdateWorkflow(workflowToken, repo);
    void sendCoreUpdateEmail(
      formatCoreUpdateEmail("update_started", {
        message:
          "You started a core update (or the daily schedule triggered). The CTO bot will email again when a PR is ready.",
      }),
    );
    return new Response(
      JSON.stringify({
        ok: true,
        message:
          "Safe update preparation has started. Production has not changed; the update will be reviewed before it can go live.",
      }),
      { status: 200, headers: json },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start safe update workflow";
    const workflowUrl = githubActionsWorkflowUrl(repo, "sync-upstream.yml");
    let hint = "";
    let configIssue: string | undefined;
    if (error instanceof GithubWorkflowDispatchError && error.status === 401) {
      configIssue = "github_workflow_token_unauthorized";
      hint =
        " Configure GITHUB_WORKFLOW_TOKEN or GITHUB_TOKEN in the admin Netlify runtime with a GitHub token that can access this repository and dispatch Actions workflows. Fine-grained tokens need Actions: Read and write plus repository contents/metadata access for the builder repo; classic tokens need repo and workflow scope.";
    } else if (error instanceof GithubWorkflowDispatchError && error.status === 403) {
      configIssue = "github_workflow_token_forbidden";
      hint =
        " The configured GitHub token can reach GitHub but is not allowed to dispatch this workflow. Grant Actions workflow write permission for the builder repo, or replace GITHUB_WORKFLOW_TOKEN/GITHUB_TOKEN with an authorized token.";
    } else if (error instanceof GithubWorkflowDispatchError && error.status === 404) {
      configIssue = "github_workflow_not_found_or_repo_access";
      hint =
        " Ensure sync-upstream.yml is merged to main on the builder repository and the GitHub token has access to the configured GITHUB_REPO.";
    }
    return new Response(
      JSON.stringify({
        ok: false,
        error: message + hint,
        message: "Unable to start safe update preparation. Production has not changed." + hint,
        workflowUrl,
        configIssue,
      }),
      { status: 502, headers: json },
    );
  }
};
