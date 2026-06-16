import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import {
  dispatchAiRepairWorkflow,
  githubActionsWorkflowUrl,
} from "../../../lib/github-safe-update";

const json = { "Content-Type": "application/json" } as const;

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
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
      }),
      { status: 500, headers: json },
    );
  }

  let prNumber = 0;
  try {
    const body = (await context.request.json()) as { prNumber?: number };
    prNumber = typeof body.prNumber === "number" ? body.prNumber : 0;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: json,
    });
  }

  if (!Number.isFinite(prNumber) || prNumber < 1) {
    return new Response(
      JSON.stringify({ ok: false, error: "prNumber is required (active safe-update PR)" }),
      { status: 400, headers: json },
    );
  }

  const { token, repo } = github;

  try {
    const { workflowUrl } = await dispatchAiRepairWorkflow(token, repo, prNumber);
    return new Response(
      JSON.stringify({
        ok: true,
        prNumber,
        workflowUrl,
        message:
          "Autopilot deterministic repair started on GitHub. Refresh status in a few minutes.",
        disclaimer:
          "Autopilot v2.1 regenerates known mechanical conflicts such as package-lock.json, then runs the tenant guard. Tenant-sensitive conflicts stay blocked with an invariant report until a developer resolves them.",
      }),
      { headers: json },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to start AI repair workflow";
    const workflowUrl = githubActionsWorkflowUrl(repo, "ai-repair-safe-update.yml");
    const hint =
      message.includes("404") ?
        " Ensure ai-repair-safe-update.yml is merged to main on the builder repository."
      : "";
    return new Response(
      JSON.stringify({ ok: false, error: message + hint, workflowUrl }),
      { status: 502, headers: json },
    );
  }
};
