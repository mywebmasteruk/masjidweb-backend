import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { listSyncPRs, markPullRequestReady, mergePR } from "../../../lib/github-updates";
import { describeAdminUpdateState } from "../../../lib/update-admin-copy";
import { githubProductionBranch } from "../../../lib/updates-env";

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = import.meta.env.GITHUB_TOKEN;
  const repo = import.meta.env.GITHUB_REPO;
  if (!token || !repo) {
    return new Response(
      JSON.stringify({ ok: false, error: "GITHUB_TOKEN or GITHUB_REPO not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

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

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Safe update PR #${safeUpdatePr.number} merged. Production will deploy from ${productionBranch} when the build finishes.`,
        prNumber: safeUpdatePr.number,
        prUrl: safeUpdatePr.htmlUrl,
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
