import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import {
  closePullRequest,
  listSyncPRs,
  normalizeBuilderRepo,
  pickActiveSafeUpdatePr,
} from "../../../lib/github-updates";
import { dispatchSafeUpdateWorkflow } from "../../../lib/github-safe-update";
import { githubProductionBranch } from "../../../lib/updates-env";

const json = { "Content-Type": "application/json" } as const;

/**
 * POST /api/updates/regenerate-safe-update
 *
 * One-click recovery for a STALE safe-update PR (prepared before production
 * main advanced, or before a newer upstream release): closes the active PR
 * with an explanatory comment, then dispatches the sync-upstream workflow so
 * a fresh PR is prepared from current production code. Production unchanged.
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
    const repoUsed = normalizeBuilderRepo(repo);
    const productionBranch = githubProductionBranch();
    const syncPRs = await listSyncPRs(token, repoUsed, [productionBranch]);
    const active = await pickActiveSafeUpdatePr(token, repoUsed, syncPRs, productionBranch);

    let closedPr: number | null = null;
    if (active) {
      await closePullRequest(
        token,
        repoUsed,
        active.number,
        "Closed from the admin dashboard: this update PR became stale " +
          "(production advanced past its base and/or a newer upstream release exists). " +
          "A fresh safe-update PR is being prepared from current production code.",
      );
      closedPr = active.number;
    }

    await dispatchSafeUpdateWorkflow(workflowToken, repo);

    return new Response(
      JSON.stringify({
        ok: true,
        closedPr,
        message:
          (closedPr ? `Stale PR #${closedPr} closed. ` : "") +
          "A fresh safe update is being prepared from current production code. " +
          "This page follows along automatically; production is unchanged.",
      }),
      { headers: json },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: json },
    );
  }
};
