import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { publishDeploy } from "../../../lib/netlify-deploys";
import { netlifyBuilderSiteId } from "../../../lib/netlify-site-ids";

export const POST: APIRoute = async (context) => {
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

  let deployId: string;
  try {
    const body = (await context.request.json()) as { deployId?: string };
    if (!body.deployId) throw new Error("deployId is required");
    deployId = body.deployId;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid body — expected { deployId: string }" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const result = await publishDeploy(token, siteId, deployId);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
