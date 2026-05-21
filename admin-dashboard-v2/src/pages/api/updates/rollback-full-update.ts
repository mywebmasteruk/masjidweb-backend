import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import {
  getLatestReversibleCheckpoint,
  insertCoreUpdateAudit,
} from "../../../lib/core-update-audit";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import {
  createRevertPullRequest,
  fetchBranchHeadSha,
  fetchPackageJsonVersion,
  mergePR,
} from "../../../lib/github-updates";
import { listRecentDeploys, publishDeploy } from "../../../lib/netlify-deploys";
import { netlifyBuilderSiteId } from "../../../lib/netlify-site-ids";
import { readServerEnv } from "../../../lib/server-env";
import { githubProductionBranch } from "../../../lib/updates-env";

const json = { "Content-Type": "application/json" } as const;

/**
 * Full rollback: revert the merged safe-update PR on main AND restore the
 * exact Netlify production deploy recorded at approve time.
 */
export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: json,
    });
  }

  const github = getGithubUpdatesConfig();
  const netlifyToken = readServerEnv("NETLIFY_AUTH_TOKEN");
  const nlSite = netlifyBuilderSiteId();
  if (!github) {
    return new Response(
      JSON.stringify({ ok: false, error: "GITHUB_TOKEN or GITHUB_REPO not configured" }),
      { status: 500, headers: json },
    );
  }
  if (!netlifyToken || !nlSite) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "NETLIFY_AUTH_TOKEN or builder site id not configured",
      }),
      { status: 500, headers: json },
    );
  }

  const { token, repo } = github;

  try {
    const checkpoint = await getLatestReversibleCheckpoint();
    if (!checkpoint?.prNumber) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "No reversible update checkpoint found. Approve a safe update first (records pre-update git + deploy ids).",
        }),
        { status: 404, headers: json },
      );
    }

    if (!checkpoint.beforeDeployId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "Checkpoint is missing the pre-update Netlify deploy id. Use Restore previous live build, or revert the merge manually on GitHub.",
        }),
        { status: 409, headers: json },
      );
    }

    const productionBranch = githubProductionBranch();
    const beforeRollbackMainSha = await fetchBranchHeadSha(token, repo, productionBranch);

    const revertPr = await createRevertPullRequest(token, repo, checkpoint.prNumber);
    const reverted = await mergePR(token, repo, revertPr.number);
    if (!reverted.merged) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: reverted.message || "Revert PR merge failed.",
          revertPrUrl: revertPr.htmlUrl,
        }),
        { status: 502, headers: json },
      );
    }

    const netlifyResult = await publishDeploy(netlifyToken, nlSite, checkpoint.beforeDeployId);
    if (!netlifyResult.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            netlifyResult.message ||
            "Git revert succeeded but Netlify restore failed. Fix production manually.",
          revertPrUrl: revertPr.htmlUrl,
          revertMergeSha: reverted.sha ?? null,
        }),
        { status: 502, headers: json },
      );
    }

    const afterRollbackMainSha =
      reverted.sha ?? (await fetchBranchHeadSha(token, repo, productionBranch));
    const afterPackageVersion = afterRollbackMainSha
      ? await fetchPackageJsonVersion(token, repo, afterRollbackMainSha)
      : null;

    let currentDeployId: string | null = null;
    try {
      const deploys = await listRecentDeploys(netlifyToken, nlSite, 5);
      currentDeployId = deploys.find((d) => d.isCurrent)?.id ?? null;
    } catch {
      /* ignore */
    }

    await insertCoreUpdateAudit({
      action: "rollback_full",
      prNumber: checkpoint.prNumber,
      beforeMainSha: beforeRollbackMainSha,
      afterMainSha: afterRollbackMainSha,
      beforeDeployId: currentDeployId,
      afterDeployId: checkpoint.beforeDeployId,
      beforePackageVersion: checkpoint.afterPackageVersion,
      afterPackageVersion,
      upstreamRef: checkpoint.upstreamRef,
      safetyLevel: checkpoint.safetyLevel,
      details: {
        revertPrNumber: revertPr.number,
        revertPrUrl: revertPr.htmlUrl,
        restoredDeployId: checkpoint.beforeDeployId,
        originalCheckpointId: checkpoint.id,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Full rollback complete: reverted PR #${checkpoint.prNumber} and restored Netlify deploy ${checkpoint.beforeDeployId.slice(0, 8)}.`,
        revertPrUrl: revertPr.htmlUrl,
        restoredDeployId: checkpoint.beforeDeployId,
        beforeMainSha: checkpoint.beforeMainSha,
        afterMainSha: afterRollbackMainSha,
        caveats: [
          "Database migrations from the update are not automatically reversed.",
          "Tenant CMS/page data in Supabase is unchanged (not part of git rollback).",
        ],
      }),
      { headers: json },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: json },
    );
  }
};
