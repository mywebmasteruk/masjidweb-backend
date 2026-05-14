import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { listRecentDeploys, publishDeploy } from "../../../lib/netlify-deploys";
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
    const deploys = await listRecentDeploys(token, siteId, 25);
    const current = deploys.find((d) => d.isCurrent);
    const target = deploys.find((d) => d.id === deployId);

    if (!target || target.state !== "ready") {
      return new Response(
        JSON.stringify({ ok: false, error: "Selected build is not a recent ready deploy." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (current?.branch && target.branch !== current.branch) {
      return new Response(
        JSON.stringify({ ok: false, error: "Selected build is not from the current production branch." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = await publishDeploy(token, siteId, deployId);
    return new Response(JSON.stringify({ ...result, restoredDeployId: target.id }), {
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
