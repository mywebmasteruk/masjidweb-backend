import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getUpdateStatus } from "../../../lib/github-updates";

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
    const status = await getUpdateStatus(token, repo);
    return new Response(JSON.stringify({ ok: true, ...status }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
