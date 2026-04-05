import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import {
  findPreviousReadyDeploy,
  listRecentDeploys,
  publishDeploy,
} from "../../../lib/netlify-deploys";
import { netlifyBuilderSiteId } from "../../../lib/netlify-site-ids";

const json = { "Content-Type": "application/json" } as const;

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: json,
    });
  }

  const token = import.meta.env.NETLIFY_AUTH_TOKEN;
  const siteId = netlifyBuilderSiteId();
  if (!token || !siteId) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "NETLIFY_AUTH_TOKEN or builder site id not configured (NETLIFY_SITE_ID or NETLIFY_UPDATES_DEPLOY_SITE_ID)",
      }),
      { status: 500, headers: json },
    );
  }

  try {
    const deploys = await listRecentDeploys(token, siteId, 25);
    const previous = findPreviousReadyDeploy(deploys);
    if (!previous) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "No older ready deploy found in the recent list. Use Rollback on a specific row below, or wait until another production deploy completes.",
        }),
        { status: 400, headers: json },
      );
    }

    const current = deploys.find((d) => d.isCurrent);
    const result = await publishDeploy(token, siteId, previous.id);
    return new Response(
      JSON.stringify({
        ...result,
        previousDeployId: previous.id,
        previousTitle: previous.title ?? previous.commitRef?.slice(0, 7) ?? previous.id,
        hadBeenLive: current
          ? {
              id: current.id,
              title: current.title ?? current.commitRef?.slice(0, 7) ?? current.id,
            }
          : undefined,
      }),
      { status: result.ok ? 200 : 500, headers: json },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: json },
    );
  }
};
