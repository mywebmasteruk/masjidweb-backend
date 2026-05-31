import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import {
  compareVersions,
  fetchPackageJsonVersion,
  getReleaseSemverVsFork,
  getUpdateStatus,
  listSyncPRs,
  pickActiveSafeUpdatePr,
} from "../../../lib/github-updates";
import {
  listProductionBranchDeploys,
  listRecentDeploys,
} from "../../../lib/netlify-deploys";
import { netlifyBuilderSiteId } from "../../../lib/netlify-site-ids";
import { describeAdminUpdateState } from "../../../lib/update-admin-copy";
import {
  listActivePreviewTenantOptions,
  resolvePreviewTenantContext,
} from "../../../lib/resolve-preview-tenant";
import { getLatestReversibleCheckpoint } from "../../../lib/core-update-audit";
import { pickCoreVersionUpgradeDeploys } from "../../../lib/core-version-history";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import {
  describeAiRepairRun,
  getActiveAiRepairRun,
} from "../../../lib/github-safe-update";
import { readServerEnv } from "../../../lib/server-env";
import { githubProductionBranch } from "../../../lib/updates-env";

type UpdateHistoryRow = {
  id: string;
  date: string | null;
  originalDeployDate: string | null;
  version: string | null;
  status: "live" | "previous";
  branch: string | null;
  commitRef: string | null;
  deployUrl: string;
  title: string | null;
  changelog: string[];
  republished: boolean;
};

function wasRepublished(createdAt: string | null, publishedAt: string | null): boolean {
  if (!createdAt || !publishedAt) return false;
  const created = new Date(createdAt).getTime();
  const published = new Date(publishedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(published)) return false;
  return published - created > 5 * 60 * 1000;
}

function plainEnglishChangelog(title: string | null, republished: boolean): string[] {
  const firstLine = title?.split("\n").map((line) => line.trim()).find(Boolean) ?? null;
  const normalized = firstLine
    ?.replace(/^(feat|fix|chore|docs|refactor|test|build|ci|perf)(\([^)]+\))?:\s*/i, "")
    .replace(/^Merge\s+/i, "Merged ");

  const items: string[] = [];
  if (normalized) {
    items.push(normalized.charAt(0).toUpperCase() + normalized.slice(1));
  } else {
    items.push("This build updated the builder code.");
  }

  if (republished) {
    items.push("This build was restored or republished after it was originally created.");
  }

  return items;
}

export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const github = getGithubUpdatesConfig();
  if (!github) {
    return new Response(
      JSON.stringify({ error: "GITHUB_TOKEN or GITHUB_REPO not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const { token, repo } = github;

  try {
    const productionBranch = githubProductionBranch();
    const requestedPreviewSlug = context.url.searchParams.get("previewTenantSlug");
    const [status, semver, syncPRs, previewTenant, previewTenantOptions, reversibleCheckpoint] =
      await Promise.all([
      getUpdateStatus(token, repo),
      getReleaseSemverVsFork(token, repo, productionBranch),
      listSyncPRs(token, repo, [productionBranch]),
      resolvePreviewTenantContext(requestedPreviewSlug),
      listActivePreviewTenantOptions(),
      getLatestReversibleCheckpoint().catch(() => null),
    ]);

    let deployedPackageVersion: string | null = null;
    let deployCommitRef: string | null = null;
    let deployBranch: string | null = null;
    let updateHistory: UpdateHistoryRow[] = [];

    const netlifyToken = readServerEnv("NETLIFY_AUTH_TOKEN");
    const nlSite = netlifyBuilderSiteId();
    if (netlifyToken && nlSite) {
      try {
        const deploys = await listRecentDeploys(netlifyToken, nlSite, 25);
        const cur = deploys.find((d) => d.isCurrent && d.state === "ready");
        if (cur?.commitRef) {
          deployCommitRef = cur.commitRef;
          deployBranch = cur.branch;
          deployedPackageVersion = await fetchPackageJsonVersion(
            token,
            repo,
            cur.commitRef,
          );
        }

        const publishedDeploys = await listProductionBranchDeploys(
          netlifyToken,
          nlSite,
          productionBranch,
          { maxItems: 100 },
        );
        const allHistoryRows = await Promise.all(
          publishedDeploys.map(async (d) => {
            let version: string | null = null;
            if (d.commitRef) {
              try {
                version = await fetchPackageJsonVersion(token, repo, d.commitRef);
              } catch {
                version = null;
              }
            }
            const republished = wasRepublished(d.createdAt ?? null, d.publishedAt ?? null);
            return {
              id: d.id,
              date: d.publishedAt ?? d.createdAt ?? null,
              originalDeployDate: d.createdAt ?? null,
              version,
              status: d.isCurrent ? ("live" as const) : ("previous" as const),
              branch: d.branch,
              commitRef: d.commitRef,
              deployUrl: d.deployUrl,
              title: d.title,
              changelog: plainEnglishChangelog(d.title, republished),
              republished,
            };
          }),
        );
        updateHistory = pickCoreVersionUpgradeDeploys(allHistoryRows);
      } catch {
        /* ignore — fall back to git-branch semver only */
      }
    }

    /** Upstream GitHub release vs fork main package.json (not live deploy — avoids false "update available" after merge). */
    const releaseAheadOfForkPackage = semver.releaseAheadOfForkPackage;

    const gitAheadOfDeployed = Boolean(
      semver.forkPackageVersion &&
        deployedPackageVersion &&
        compareVersions(semver.forkPackageVersion, deployedPackageVersion) > 0,
    );

    const safeUpdatePr = await pickActiveSafeUpdatePr(
      token,
      repo,
      syncPRs,
      productionBranch,
    );

    const activeSafeUpdate = safeUpdatePr
      ? {
          number: safeUpdatePr.number,
          title: safeUpdatePr.title,
          url: safeUpdatePr.htmlUrl,
          isDraft: safeUpdatePr.isDraft,
          mergeable: safeUpdatePr.mergeable,
          mergeableState: safeUpdatePr.mergeableState,
          ciStatus: safeUpdatePr.ciStatus,
          labels: safeUpdatePr.labels,
          deployPreviewUrl: safeUpdatePr.deployPreviewUrl,
        }
      : null;

    let aiRepairRun = null;
    if (activeSafeUpdate) {
      try {
        aiRepairRun = await getActiveAiRepairRun(token, repo);
      } catch {
        aiRepairRun = null;
      }
    }
    const aiRepairSummary = describeAiRepairRun(aiRepairRun);

    const payload = {
      ok: true,
      ...status,
      ...semver,
      releaseAheadOfForkPackage,
      deployedPackageVersion,
      deployCommitRef,
      deployBranch,
      productionBranch,
      gitAheadOfDeployed,
      activeSafeUpdate,
      aiRepairRun,
      aiRepairSummary,
      updateHistory,
      reversibleCheckpoint,
    };

    const statusPayload = {
      ...payload,
      previewTenant,
      previewTenantOptions,
    };

    return new Response(
      JSON.stringify({
        ...statusPayload,
        adminState: describeAdminUpdateState(statusPayload),
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
