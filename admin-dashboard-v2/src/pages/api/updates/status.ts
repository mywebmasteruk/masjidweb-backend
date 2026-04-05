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
