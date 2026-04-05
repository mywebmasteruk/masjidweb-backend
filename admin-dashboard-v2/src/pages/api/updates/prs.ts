import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { listSyncPRs } from "../../../lib/github-updates";

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

  const basesRaw = import.meta.env.GITHUB_SYNC_PR_BASES?.trim();
  const basesFromEnv = basesRaw
    ? basesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  try {
    const prs = await listSyncPRs(
      token,
      repo,
      basesFromEnv && basesFromEnv.length > 0 ? basesFromEnv : undefined,
    );
    return new Response(JSON.stringify({ ok: true, prs }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
