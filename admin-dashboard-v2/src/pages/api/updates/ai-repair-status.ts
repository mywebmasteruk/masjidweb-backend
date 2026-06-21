import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import {
  describeAiRepairRun,
  getActiveAiRepairRun,
} from "../../../lib/github-safe-update";

const json = { "Content-Type": "application/json" } as const;

export const GET: APIRoute = async (context) => {
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

  const url = new URL(context.request.url);
  const rawPrNumber = url.searchParams.get("prNumber");
  const prNumber = rawPrNumber ? Number.parseInt(rawPrNumber, 10) : null;

  try {
    const aiRepairRun = await getActiveAiRepairRun(github.workflowToken, github.repo);
    return new Response(
      JSON.stringify({
        ok: true,
        prNumber: Number.isFinite(prNumber) ? prNumber : null,
        workflowUrl: aiRepairRun?.htmlUrl ?? null,
        aiRepairRun,
        aiRepairSummary: describeAiRepairRun(aiRepairRun),
      }),
      { headers: json },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not read AI repair status";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 502,
      headers: json,
    });
  }
};
