import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import {
  compareVersions,
  fetchPackageJsonVersion,
  getReleaseSemverVsFork,
  getUpdateStatus,
} from "../../../lib/github-updates";
import { listRecentDeploys } from "../../../lib/netlify-deploys";
import { netlifyBuilderSiteId } from "../../../lib/netlify-site-ids";
import { githubProductionBranch } from "../../../lib/updates-env";

type UpdateHistoryRow = {
  date: string | null;
  originalDeployDate: string | null;
  version: string | null;
  status: "live" | "previous";
  branch: string | null;
  commitRef: string | null;
  deployUrl: string;
  republished: boolean;
};

function wasRepublished(createdAt: string | null, publishedAt: string | null): boolean {
  if (!createdAt || !publishedAt) return false;
  const created = new Date(createdAt).getTime();
  const published = new Date(publishedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(published)) return false;
  return published - created > 5 * 60 * 1000;
}

export const GET: APIRoute = async (context) => {
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
      JSON.stringify({ error: "GITHUB_TOKEN or GITHUB_REPO not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const [status, semver] = await Promise.all([
      getUpdateStatus(token, repo),
      getReleaseSemverVsFork(token, repo, githubProductionBranch()),
    ]);

    let deployedPackageVersion: string | null = null;
    let deployCommitRef: string | null = null;
    let deployBranch: string | null = null;
    let updateHistory: UpdateHistoryRow[] = [];

    const netlifyToken = import.meta.env.NETLIFY_AUTH_TOKEN;
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

        const publishedDeploys = deploys
          .filter((d) => d.state === "ready")
          .slice(0, 8);
        updateHistory = await Promise.all(
          publishedDeploys.map(async (d) => {
            let version: string | null = null;
            if (d.commitRef) {
              try {
                version = await fetchPackageJsonVersion(token, repo, d.commitRef);
              } catch {
                version = null;
              }
            }
            return {
              date: d.publishedAt ?? d.createdAt ?? null,
              originalDeployDate: d.createdAt ?? null,
              version,
              status: d.isCurrent ? "live" : "previous",
              branch: d.branch,
              commitRef: d.commitRef,
              deployUrl: d.deployUrl,
              republished: wasRepublished(d.createdAt ?? null, d.publishedAt ?? null),
            };
          }),
        );
      } catch {
        /* ignore — fall back to git-branch semver only */
      }
    }

    /** Same boolean the tenant builder uses: latest ycode/ycode release vs baked package.json at published deploy. */
    let releaseAheadOfForkPackage = semver.releaseAheadOfForkPackage;
    if (semver.latestReleaseVersion) {
      if (deployedPackageVersion) {
        releaseAheadOfForkPackage =
          compareVersions(semver.latestReleaseVersion, deployedPackageVersion) >
          0;
      }
    }

    const gitAheadOfDeployed = Boolean(
      semver.forkPackageVersion &&
        deployedPackageVersion &&
        compareVersions(semver.forkPackageVersion, deployedPackageVersion) > 0,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        ...status,
        ...semver,
        releaseAheadOfForkPackage,
        deployedPackageVersion,
        deployCommitRef,
        deployBranch,
        gitAheadOfDeployed,
        updateHistory,
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
