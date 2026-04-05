import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { listRecentDeploys } from "../../../lib/netlify-deploys";
import { netlifyBuilderSiteId } from "../../../lib/netlify-site-ids";

export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = import.meta.env.NETLIFY_AUTH_TOKEN;
  const siteId = netlifyBuilderSiteId();
  if (!token || !siteId) {
    return new Response(
      JSON.stringify({
        error:
          "NETLIFY_AUTH_TOKEN or builder site id not configured (NETLIFY_SITE_ID or NETLIFY_UPDATES_DEPLOY_SITE_ID)",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const deploys = await listRecentDeploys(token, siteId);
    return new Response(JSON.stringify({ ok: true, deploys }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
