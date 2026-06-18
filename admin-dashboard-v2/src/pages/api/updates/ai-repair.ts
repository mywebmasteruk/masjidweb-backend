import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import {
  type CopilotEscalationMode,
  dispatchAiRepairWorkflow,
  githubActionsWorkflowUrl,
} from "../../../lib/github-safe-update";

const json = { "Content-Type": "application/json" } as const;
const copilotEscalationModes = new Set<CopilotEscalationMode>([
  "none",
  "comment",
  "issue",
  "assign",
]);

function parseCopilotEscalationMode(value: unknown): CopilotEscalationMode {
  if (typeof value !== "string" || value.trim() === "") return "none";
  const mode = value.trim();
  if (!copilotEscalationModes.has(mode as CopilotEscalationMode)) {
    throw new Error("copilotEscalationMode must be one of: none, comment, issue, assign");
  }
  return mode as CopilotEscalationMode;
}

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: json,
    });
  }

  const github = getGithubUpdatesConfig();
  if (!github) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "GITHUB_TOKEN or GITHUB_REPO not configured",
      }),
      { status: 500, headers: json },
    );
  }

  let prNumber = 0;
  let copilotEscalationMode: CopilotEscalationMode = "none";
  try {
    const body = (await context.request.json()) as {
      prNumber?: number;
      copilotEscalationMode?: unknown;
    };
    prNumber = typeof body.prNumber === "number" ? body.prNumber : 0;
    copilotEscalationMode = parseCopilotEscalationMode(body.copilotEscalationMode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON body";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: json,
    });
  }

  if (!Number.isFinite(prNumber) || prNumber < 1) {
    return new Response(
      JSON.stringify({ ok: false, error: "prNumber is required (active safe-update PR)" }),
      { status: 400, headers: json },
    );
  }

  const { token, repo } = github;

  try {
    const { workflowUrl } = await dispatchAiRepairWorkflow(token, repo, prNumber, {
      copilotEscalationMode,
    });
    const isCopilotEscalation = copilotEscalationMode !== "none";
    return new Response(
      JSON.stringify({
        ok: true,
        prNumber,
        workflowUrl,
        copilotEscalationMode,
        message: isCopilotEscalation
          ? "Copilot escalation requested. GitHub issue/comment will be created; approval stays blocked until CI is green."
          : "Autopilot deterministic repair started on GitHub. Refresh status in a few minutes.",
        disclaimer: isCopilotEscalation
          ? "Copilot escalation creates a constrained handoff only. It never approves, marks ready, or merges the safe-update PR."
          : "Autopilot v2.2 regenerates known mechanical conflicts such as package-lock.json, then runs the tenant guard. Tenant-sensitive conflicts stay blocked with an invariant report until a developer resolves them.",
      }),
      { headers: json },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to start AI repair workflow";
    const workflowUrl = githubActionsWorkflowUrl(repo, "ai-repair-safe-update.yml");
    const hint =
      message.includes("404") ?
        " Ensure ai-repair-safe-update.yml is merged to main on the builder repository."
      : "";
    return new Response(
      JSON.stringify({ ok: false, error: message + hint, workflowUrl }),
      { status: 502, headers: json },
    );
  }
};
