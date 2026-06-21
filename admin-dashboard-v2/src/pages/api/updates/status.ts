import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import {
  compareVersions,
  fetchPackageJsonVersion,
  getReleaseSemverVsFork,
  getUpdateStatus,
  listSyncPRs,
  normalizeBuilderRepo,
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function fallbackOnError<T>(
  promise: Promise<T>,
  fallback: T,
  diagnostics?: string[],
  label?: string,
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (diagnostics && label) {
      diagnostics.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return fallback;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Vary: "Cookie, Authorization",
    },
  });
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
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const github = getGithubUpdatesConfig();
  if (!github) {
    return jsonResponse({ ok: false, error: "GITHUB_TOKEN or GITHUB_REPO not configured" }, 500);
  }

  const { token, repo } = github;

  try {
    const productionBranch = githubProductionBranch();
    const repoUsed = normalizeBuilderRepo(repo);
    const diagnostics: string[] = [];
    if (repoUsed !== repo) {
      diagnostics.push(`Normalized legacy GITHUB_REPO ${repo} to ${repoUsed}.`);
    }
    const requestedPreviewSlug = context.url.searchParams.get("previewTenantSlug");
    const [status, semver, syncPRs, previewTenant, previewTenantOptions, reversibleCheckpoint] =
      await Promise.all([
        fallbackOnError(
          withTimeout(getUpdateStatus(token, repoUsed), 8_000, "GitHub fork status"),
          { behindBy: 0, aheadBy: 0, upstreamRepo: "unknown", lastPush: null },
          diagnostics,
          "GitHub fork status",
        ),
        fallbackOnError(
          withTimeout(getReleaseSemverVsFork(token, repoUsed, productionBranch), 12_000, "GitHub release status"),
          {
            latestReleaseVersion: null,
            forkPackageVersion: null,
            forkPackageRepoUsed: repoUsed,
            packageJsonRefUsed: productionBranch,
            releaseAheadOfForkPackage: false,
            releaseUrl: null,
            diagnostics: ["GitHub release status failed before semver fallback completed."],
          },
          diagnostics,
          "GitHub release status",
        ),
        fallbackOnError(
          withTimeout(listSyncPRs(token, repoUsed, [productionBranch]), 8_000, "GitHub safe-update PR status"),
          [],
          diagnostics,
          "GitHub safe-update PR status",
        ),
        fallbackOnError(resolvePreviewTenantContext(requestedPreviewSlug), {
          slug: requestedPreviewSlug?.trim() || "masjidemo1",
        }),
        fallbackOnError(listActivePreviewTenantOptions(), []),
        fallbackOnError(getLatestReversibleCheckpoint(), null),
      ]);

    let deployedPackageVersion: string | null = null;
    let deployCommitRef: string | null = null;
    let deployBranch: string | null = null;
    let updateHistory: UpdateHistoryRow[] = [];

    const netlifyToken = readServerEnv("NETLIFY_AUTH_TOKEN");
    const nlSite = netlifyBuilderSiteId();
    if (netlifyToken && nlSite) {
      try {
        const deploys = await withTimeout(
          listRecentDeploys(netlifyToken, nlSite, 25),
          8_000,
          "Netlify current deploy status",
        );
        const cur = deploys.find((d) => d.isCurrent && d.state === "ready");
        if (cur?.commitRef) {
          deployCommitRef = cur.commitRef;
          deployBranch = cur.branch;
          deployedPackageVersion = await fallbackOnError(
            withTimeout(
              fetchPackageJsonVersion(token, repoUsed, cur.commitRef),
              2_000,
              "GitHub current package version lookup",
            ),
            null,
          );
        }

        const publishedDeploys = await withTimeout(
          listProductionBranchDeploys(netlifyToken, nlSite, productionBranch, { maxItems: 25 }),
          10_000,
          "Netlify deploy history",
        );
        const allHistoryRows = await Promise.all(
          publishedDeploys.map(async (d) => {
            let version: string | null = null;
            if (d.commitRef) {
              version = await fallbackOnError(
                withTimeout(
                  fetchPackageJsonVersion(token, repoUsed, d.commitRef),
                  2_000,
                  "GitHub package version lookup",
                ),
                null,
              );
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

    const safeUpdatePr = await withTimeout(
      pickActiveSafeUpdatePr(token, repoUsed, syncPRs, productionBranch),
      8_000,
      "GitHub active safe-update PR status",
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
          autopilotStatus: safeUpdatePr.autopilotStatus,
          autopilotRisk: safeUpdatePr.autopilotRisk,
          autopilotBlockedReason: safeUpdatePr.autopilotBlockedReason,
          deployPreviewUrl: safeUpdatePr.deployPreviewUrl,
        }
      : null;

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
      updateHistory,
      reversibleCheckpoint,
      diagnostics: [...diagnostics, ...semver.diagnostics],
    };

    const statusPayload = {
      ...payload,
      previewTenant,
      previewTenantOptions,
    };

    return jsonResponse({
      ...statusPayload,
      adminState: describeAdminUpdateState(statusPayload),
    });
  } catch (e) {
    return jsonResponse({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      diagnostics: ["GitHub update status failed closed before partial status could be built."],
    }, 500);
  }
};
