import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import {
  mergeHeadIntoBase,
  syncForkFromUpstream,
} from "../../../lib/github-updates";
import { triggerProductionBuild } from "../../../lib/netlify-deploys";
import { netlifyBuilderSiteId } from "../../../lib/netlify-site-ids";
import { githubProductionBranch } from "../../../lib/updates-env";

const json = { "Content-Type": "application/json" } as const;

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: json,
    });
  }

  const token = import.meta.env.GITHUB_TOKEN;
  const repo = import.meta.env.GITHUB_REPO;
  if (!token || !repo) {
    return new Response(
      JSON.stringify({ ok: false, error: "GITHUB_TOKEN or GITHUB_REPO not configured" }),
      { status: 500, headers: json },
    );
  }

  let clearNetlifyCache = false;
  try {
    const body = (await context.request.json().catch(() => ({}))) as {
      clearNetlifyCache?: boolean;
    };
    clearNetlifyCache = body.clearNetlifyCache === true;
  } catch {
    /* empty body */
  }

  const productionBranch = githubProductionBranch();
  const steps: Record<string, unknown> = {};

  try {
    const sync = await syncForkFromUpstream(token, repo);
    steps.sync = sync;

    if (!sync.merged) {
      const status = sync.httpStatus === 409 ? 409 : 500;
      return new Response(
        JSON.stringify({
          ok: false,
          steps,
          error: sync.message,
          compareUrl: sync.compareUrl,
        }),
        { status, headers: json },
      );
    }

    const merge = await mergeHeadIntoBase(
      token,
      repo,
      productionBranch,
      "main",
      `Merge main into ${productionBranch} (MasjidWeb admin — apply builder update)`,
    );
    steps.mergeMainIntoProduction = merge;

    if (merge.status === "conflict") {
      return new Response(
        JSON.stringify({
          ok: false,
          steps,
          error: merge.message,
        }),
        { status: 409, headers: json },
      );
    }

    if (merge.status === "error") {
      const code =
        merge.httpStatus >= 400 && merge.httpStatus < 600
          ? merge.httpStatus
          : 500;
      return new Response(
        JSON.stringify({ ok: false, steps, error: merge.message }),
        { status: code, headers: json },
      );
    }

    const nlToken = import.meta.env.NETLIFY_AUTH_TOKEN;
    const nlSite = netlifyBuilderSiteId();
    if (!nlToken || !nlSite) {
      const skipMsg =
        "NETLIFY_AUTH_TOKEN or builder site id not set — Git updated but no deploy was triggered from here.";
      steps.netlify = { ok: false, skipped: true, message: skipMsg };
      return new Response(
        JSON.stringify({
          ok: false,
          partial: true,
          steps,
          warning: skipMsg,
          message:
            "Upstream sync and merge finished; configure Netlify env on the admin site to trigger builds from here.",
        }),
        { status: 200, headers: json },
      );
    }

    const netlify = await triggerProductionBuild(nlToken, nlSite, {
      clearCache: clearNetlifyCache,
    });
    steps.netlify = netlify;

    const mergeNote =
      merge.status === "already_up_to_date"
        ? "Production branch already matched main; "
        : "Synced upstream, merged main into production branch; ";

    if (!netlify.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          partial: true,
          steps,
          message:
            mergeNote +
            "Netlify did not start a build — trigger a deploy from Netlify or fix the token.",
          warning: netlify.message,
        }),
        { status: 200, headers: json },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        steps,
        message:
          mergeNote + "production build started on Netlify.",
      }),
      { status: 200, headers: json },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        steps,
        error: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: json },
    );
  }
};
