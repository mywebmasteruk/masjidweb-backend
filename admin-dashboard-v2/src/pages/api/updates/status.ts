import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getUpdateStatus, getReleaseSemverVsFork } from "../../../lib/github-updates";

/** Branch whose `package.json` matches Netlify production (tenant builder). */
function productionPackageJsonRef(): string {
  const explicit = import.meta.env.GITHUB_PRODUCTION_BRANCH?.trim();
  if (explicit) return explicit;
  const bases = import.meta.env.GITHUB_SYNC_PR_BASES?.trim();
  if (bases) {
    const first = bases.split(",")[0]?.trim();
    if (first) return first;
  }
  return "tenant-multi";
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
      getReleaseSemverVsFork(token, repo, productionPackageJsonRef()),
    ]);
    return new Response(JSON.stringify({ ok: true, ...status, ...semver }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
