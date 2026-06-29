import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getMarketingUpdatesConfig } from "../../../lib/github-env";
import { syncForkFromUpstream } from "../../../lib/github-updates";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Sync the marketing-site fork (mw-web) with the latest Ycode upstream.
 * Uses GitHub's `merge-upstream` API to merge upstream into the fork's default
 * branch (`main`); Netlify then auto-redeploys mw-web. A 409 (merge conflict —
 * possible because of the 2 local hardening commits) is a normal, expected
 * outcome and is returned with `merged: false` + a `compareUrl` so the UI can
 * link the user to resolve it on GitHub, not a server error.
 */
export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const cfg = getMarketingUpdatesConfig();
  if (!cfg) {
    return json({ error: "GITHUB_TOKEN not configured" }, 500);
  }
  const { token, repo } = cfg;

  try {
    const result = await syncForkFromUpstream(token, repo);
    return json({ ok: result.merged, repo, ...result });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
};
