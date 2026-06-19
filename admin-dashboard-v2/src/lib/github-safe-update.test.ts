import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeAiRepairRun,
  dispatchAiRepairWorkflow,
  dispatchSafeUpdateWorkflow,
  getActiveAiRepairRun,
  githubActionsWorkflowUrl,
} from "./github-safe-update";

describe("dispatchSafeUpdateWorkflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches the safe update workflow on main", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await dispatchSafeUpdateWorkflow("token", "owner/repo");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/actions/workflows/sync-upstream.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );
  });

  it("throws a plain error when GitHub rejects the dispatch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(dispatchSafeUpdateWorkflow("token", "owner/repo")).rejects.toThrow(
      "GitHub workflow dispatch failed: 404",
    );
  });
});

describe("dispatchAiRepairWorkflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches Premium AI repair workflow by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await dispatchAiRepairWorkflow("token", "owner/repo", 3);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/actions/workflows/ai-repair-safe-update.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            pr_number: "3",
            mechanical_only: false,
            repair_mode: "premium_ai",
            openrouter_model: "",
            copilot_escalation_mode: "none",
          },
        }),
      },
    );
    expect(result.workflowUrl).toBe(
      "https://github.com/owner/repo/actions/workflows/ai-repair-safe-update.yml",
    );
  });

  it("dispatches ai-repair workflow with Copilot escalation mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await dispatchAiRepairWorkflow("token", "owner/repo", 7, {
      repairMode: "autopilot",
      copilotEscalationMode: "issue",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/actions/workflows/ai-repair-safe-update.yml/dispatches",
      expect.objectContaining({
        body: JSON.stringify({
          ref: "main",
          inputs: {
            pr_number: "7",
            mechanical_only: true,
            repair_mode: "autopilot",
            openrouter_model: "",
            copilot_escalation_mode: "issue",
          },
        }),
      }),
    );
  });

  it("dispatches Premium AI repair with model override", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await dispatchAiRepairWorkflow("token", "owner/repo", 11, {
      repairMode: "premium_ai",
      openrouterModel: "anthropic/test-frontier",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/actions/workflows/ai-repair-safe-update.yml/dispatches",
      expect.objectContaining({
        body: JSON.stringify({
          ref: "main",
          inputs: {
            pr_number: "11",
            mechanical_only: false,
            repair_mode: "premium_ai",
            openrouter_model: "anthropic/test-frontier",
            copilot_escalation_mode: "none",
          },
        }),
      }),
    );
  });

  it("rejects invalid pr numbers", async () => {
    await expect(dispatchAiRepairWorkflow("token", "owner/repo", 0)).rejects.toThrow(
      "Invalid pull request number",
    );
  });
});

describe("githubActionsWorkflowUrl", () => {
  it("builds the actions workflow URL", () => {
    expect(githubActionsWorkflowUrl("o/r", "ai-repair-safe-update.yml")).toBe(
      "https://github.com/o/r/actions/workflows/ai-repair-safe-update.yml",
    );
  });
});

describe("getActiveAiRepairRun", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns in-progress run with current step", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 99,
              status: "in_progress",
              conclusion: null,
              html_url: "https://github.com/o/r/actions/runs/99",
              created_at: "2026-05-31T08:00:00Z",
              updated_at: "2026-05-31T08:01:00Z",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: [
            {
              steps: [
                { name: "Run AI conflict repair", status: "in_progress", conclusion: null },
              ],
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const run = await getActiveAiRepairRun("token", "o/r");
    expect(run?.currentStep).toBe("Run AI conflict repair");
    expect(run?.status).toBe("in_progress");
  });
});

describe("describeAiRepairRun", () => {
  it("describes in-progress and completed runs", () => {
    expect(
      describeAiRepairRun({
        id: 1,
        status: "in_progress",
        conclusion: null,
        htmlUrl: "https://example.com",
        createdAt: "",
        updatedAt: "",
        currentStep: "Verify production build",
      }),
    ).toContain("Verify production build");
    expect(
      describeAiRepairRun({
        id: 1,
        status: "completed",
        conclusion: "failure",
        htmlUrl: "https://example.com",
        createdAt: "",
        updatedAt: "",
        currentStep: null,
      }),
    ).toContain("failed");
  });
});
