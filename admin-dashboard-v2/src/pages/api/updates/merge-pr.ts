import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import { mergePR } from "../../../lib/github-updates";

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const github = getGithubUpdatesConfig();
  if (!github) {
    return new Response(
      JSON.stringify({ error: "GITHUB_TOKEN or GITHUB_REPO not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const { token, repo } = github;

  let prNumber: number;
  try {
    const body = (await context.request.json()) as { prNumber?: number };
    if (!body.prNumber) throw new Error("prNumber is required");
    prNumber = body.prNumber;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid body — expected { prNumber: number }" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const result = await mergePR(token, repo, prNumber);
    return new Response(JSON.stringify({ ok: result.merged, ...result }), {
      status: result.merged ? 200 : 422,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
