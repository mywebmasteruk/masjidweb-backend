import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { insertCoreUpdateAudit } from "../../../lib/core-update-audit";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import {
  commitsBranchAheadOf,
  fetchBranchHeadSha,
  fetchPackageJsonVersion,
  listSyncPRs,
  markPullRequestReady,
  mergePR,
  pickActiveSafeUpdatePr,
} from "../../../lib/github-updates";
import { listRecentDeploys } from "../../../lib/netlify-deploys";
import { netlifyBuilderSiteId } from "../../../lib/netlify-site-ids";
import { formatCoreUpdateEmail, sendCoreUpdateEmail } from "../../../lib/core-update-email";
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
    const safeUpdatePr = await pickActiveSafeUpdatePr(
      token,
      repo,
      syncPRs,
      productionBranch,
    );

    if (!safeUpdatePr) {
      return new Response(
        JSON.stringify({ ok: false, error: "No active safe update pull request found." }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Identity binding: the client says WHICH PR (and which head commit) the
    // admin actually reviewed. If the active PR moved underneath the page
    // (regenerated, new commits pushed), refuse instead of silently merging
    // something the admin never looked at.
    const body = (await context.request.json().catch(() => ({}))) as {
      prNumber?: number;
      expectedHeadSha?: string;
    };
    if (typeof body.prNumber === "number" && body.prNumber !== safeUpdatePr.number) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "pr-changed",
          error: `The page showed PR #${body.prNumber}, but the active update is now PR #${safeUpdatePr.number}. Nothing was merged — review the current update and approve again.`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }
    if (
      typeof body.expectedHeadSha === "string" &&
      body.expectedHeadSha.length > 0 &&
      safeUpdatePr.headSha &&
      body.expectedHeadSha !== safeUpdatePr.headSha
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "pr-moved",
          error: `PR #${safeUpdatePr.number} changed since the page loaded (new commits were pushed). Nothing was merged — review the latest state and approve again.`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Click-time staleness check (server-authoritative): never merge a PR
    // prepared before production advanced — its checks and deploy preview
    // validated a snapshot that no longer matches what would go live.
    if (safeUpdatePr.headSha) {
      const behindMainBy = await commitsBranchAheadOf(
        token,
        repo,
        safeUpdatePr.headSha,
        productionBranch,
      );
      if (typeof behindMainBy === "number" && behindMainBy > 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            code: "stale",
            error: `PR #${safeUpdatePr.number} was prepared before ${productionBranch} advanced (${behindMainBy} newer commit${behindMainBy === 1 ? "" : "s"}) — its checks and preview no longer reflect what would go live. Nothing was merged — regenerate the update PR instead.`,
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
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

    void sendCoreUpdateEmail(
      formatCoreUpdateEmail("update_approved", {
        message: `You approved core update PR #${safeUpdatePr.number}. Production will deploy when the build finishes.`,
        prNumber: safeUpdatePr.number,
        prUrl: safeUpdatePr.htmlUrl,
        previewUrl: safeUpdatePr.deployPreviewUrl,
      }),
    );

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
