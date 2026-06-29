import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import {
  getMarketingUpdatesConfig,
  MASJIDWEB_MARKETING_SITE_URL,
} from "../../../lib/github-env";
import { fetchPackageJsonVersion, getUpdateStatus } from "../../../lib/github-updates";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Lightweight status for the marketing-site (mw-web) update card. */
export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const cfg = getMarketingUpdatesConfig();
  if (!cfg) {
    return json({ error: "GITHUB_TOKEN not configured" }, 500);
  }
  const { token, repo } = cfg;

  try {
    const [status, currentVersion] = await Promise.all([
      getUpdateStatus(token, repo),
      fetchPackageJsonVersion(token, repo, "main").catch(() => null),
    ]);

    return json({
      ok: true,
      repo,
      siteUrl: MASJIDWEB_MARKETING_SITE_URL,
      behindBy: status.behindBy,
      aheadBy: status.aheadBy,
      upstreamRepo: status.upstreamRepo,
      lastPush: status.lastPush,
      currentVersion,
      updateAvailable: status.behindBy > 0,
    });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
};
