import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getAiProviderSettings } from "../../../lib/ai-provider-settings";
import { getGithubUpdatesConfig } from "../../../lib/github-env";
import {
  type AiRepairMode,
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
const aiRepairModes = new Set<AiRepairMode>(["autopilot", "premium_ai"]);

function parseCopilotEscalationMode(value: unknown): CopilotEscalationMode {
  if (typeof value !== "string" || value.trim() === "") return "none";
  const mode = value.trim();
  if (!copilotEscalationModes.has(mode as CopilotEscalationMode)) {
    throw new Error("copilotEscalationMode must be one of: none, comment, issue, assign");
  }
  return mode as CopilotEscalationMode;
}

function parseAiRepairMode(value: unknown, premiumAiRepair: unknown): AiRepairMode {
  if (premiumAiRepair === true) return "premium_ai";
  if (typeof value !== "string" || value.trim() === "") return "autopilot";
  const mode = value.trim();
  if (!aiRepairModes.has(mode as AiRepairMode)) {
    throw new Error("repairMode must be one of: autopilot, premium_ai");
  }
  return mode as AiRepairMode;
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
  let repairMode: AiRepairMode = "autopilot";
  try {
    const body = (await context.request.json()) as {
      prNumber?: number;
      copilotEscalationMode?: unknown;
      repairMode?: unknown;
      premiumAiRepair?: unknown;
    };
    prNumber = typeof body.prNumber === "number" ? body.prNumber : 0;
    copilotEscalationMode = parseCopilotEscalationMode(body.copilotEscalationMode);
    repairMode = parseAiRepairMode(body.repairMode, body.premiumAiRepair);
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
    const settings = repairMode === "premium_ai" ? await getAiProviderSettings() : null;
    const { workflowUrl } = await dispatchAiRepairWorkflow(token, repo, prNumber, {
      copilotEscalationMode,
      repairMode,
      openrouterModel: settings?.provider === "openrouter" && settings.enabled ? settings.model : null,
    });
    const isCopilotEscalation = copilotEscalationMode !== "none";
    const isPremiumAiRepair = repairMode === "premium_ai";
    return new Response(
      JSON.stringify({
        ok: true,
        prNumber,
        workflowUrl,
        copilotEscalationMode,
        repairMode,
        message: isCopilotEscalation
          ? "Copilot escalation requested. GitHub issue/comment will be created; approval stays blocked until CI is green."
          : isPremiumAiRepair
            ? "Premium AI Repair started. It will produce a report artifact for blocked tenant-sensitive conflicts; it will not auto-merge or approve."
            : "Autopilot deterministic repair started on GitHub. Refresh status in a few minutes.",
        disclaimer: isCopilotEscalation
          ? "Copilot escalation creates a constrained handoff only. It never approves, marks ready, or merges the safe-update PR."
          : isPremiumAiRepair
            ? "Premium AI Repair uses OpenRouter with OPENROUTER_REPAIR_MODEL and is currently report-only: suggested diffs are not applied automatically until safety can be proven."
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
