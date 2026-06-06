import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import { formatCoreUpdateEmail, sendCoreUpdateEmail } from "../../../lib/core-update-email";
import { dispatchSafeUpdateWorkflow } from "../../../lib/github-safe-update";

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
  const { token, repo } = github;

  try {
    await dispatchSafeUpdateWorkflow(token, repo);
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
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Unable to start safe update preparation. Production has not changed.",
      }),
      { status: 500, headers: json },
    );
  }
};
