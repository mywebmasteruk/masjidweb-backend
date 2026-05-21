import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { insertCoreUpdateAudit } from "../../../lib/core-update-audit";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import {
  fetchBranchHeadSha,
  fetchPackageJsonVersion,
  listSyncPRs,
  markPullRequestReady,
  mergePR,
} from "../../../lib/github-updates";
import { listRecentDeploys } from "../../../lib/netlify-deploys";
import { netlifyBuilderSiteId } from "../../../lib/netlify-site-ids";
import { describeAdminUpdateState } from "../../../lib/update-admin-copy";
import { readServerEnv } from "../../../lib/server-env";
import { githubProductionBranch } from "../../../lib/updates-env";

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const github = getGithubUpdatesConfig();
  if (!github) {
    return new Response(
      JSON.stringify({ ok: false, error: "GITHUB_TOKEN or GITHUB_REPO not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const { token, repo } = github;

  try {
    const productionBranch = githubProductionBranch();
    const syncPRs = await listSyncPRs(token, repo, [productionBranch]);
    const safeUpdatePr =
      syncPRs
        .filter(
          (pr) =>
            pr.labels.includes("safe-ycode-update") ||
            pr.title.toLowerCase().includes("ycode") ||
            pr.title.toLowerCase().includes("safe update"),
        )
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;

    if (!safeUpdatePr) {
      return new Response(
        JSON.stringify({ ok: false, error: "No active safe update pull request found." }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const activeSafeUpdate = {
      number: safeUpdatePr.number,
      title: safeUpdatePr.title,
      url: safeUpdatePr.htmlUrl,
      isDraft: safeUpdatePr.isDraft,
      mergeable: safeUpdatePr.mergeable,
      mergeableState: safeUpdatePr.mergeableState,
      ciStatus: safeUpdatePr.ciStatus,
      labels: safeUpdatePr.labels,
      deployPreviewUrl: safeUpdatePr.deployPreviewUrl,
    };

    const adminState = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate,
    });

    if (!adminState.canApprove) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "This update is not ready to approve yet.",
          adminState,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    const beforeMainSha = await fetchBranchHeadSha(token, repo, productionBranch);
    let beforeDeployId: string | null = null;
    const netlifyToken = readServerEnv("NETLIFY_AUTH_TOKEN");
    const nlSite = netlifyBuilderSiteId();
    if (netlifyToken && nlSite) {
      try {
        const deploys = await listRecentDeploys(netlifyToken, nlSite, 5);
        const cur = deploys.find((d) => d.isCurrent && d.state === "ready");
        beforeDeployId = cur?.id ?? null;
      } catch {
        /* checkpoint still useful without deploy id */
      }
    }

    const beforePackageVersion = beforeMainSha
      ? await fetchPackageJsonVersion(token, repo, beforeMainSha)
      : null;

    if (safeUpdatePr.isDraft) {
      await markPullRequestReady(token, repo, safeUpdatePr.number);
    }

    const merged = await mergePR(token, repo, safeUpdatePr.number);
    if (!merged.merged) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: merged.message || "Merge failed.",
          adminState,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const afterMainSha = merged.sha ?? (await fetchBranchHeadSha(token, repo, productionBranch));
    const afterPackageVersion = afterMainSha
      ? await fetchPackageJsonVersion(token, repo, afterMainSha)
      : null;

    const safetyLevel = safeUpdatePr.labels.includes("auto-update-conflict")
      ? "blocked"
      : safeUpdatePr.labels.includes("tenant-sensitive-update")
        ? "high"
        : "safe";

    let checkpointId: string | null = null;
    try {
      const checkpoint = await insertCoreUpdateAudit({
        action: "approve_merge",
        prNumber: safeUpdatePr.number,
        beforeMainSha,
        afterMainSha,
        beforeDeployId,
        afterDeployId: null,
        beforePackageVersion,
        afterPackageVersion,
        upstreamRef: safeUpdatePr.title,
        safetyLevel,
        details: {
          prUrl: safeUpdatePr.htmlUrl,
          mergeCommitSha: merged.sha ?? null,
        },
      });
      checkpointId = checkpoint?.id ?? null;
    } catch {
      /* merge succeeded; audit is best-effort */
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Safe update PR #${safeUpdatePr.number} merged. Production will deploy from ${productionBranch} when the build finishes.`,
        prNumber: safeUpdatePr.number,
        prUrl: safeUpdatePr.htmlUrl,
        checkpointId,
        beforeMainSha,
        afterMainSha,
        beforeDeployId,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
