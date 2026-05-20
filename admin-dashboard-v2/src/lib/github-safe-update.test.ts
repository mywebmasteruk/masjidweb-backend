import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchAiRepairWorkflow,
  dispatchSafeUpdateWorkflow,
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

  it("dispatches ai-repair workflow with pr_number input", async () => {
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
        body: JSON.stringify({ ref: "main", inputs: { pr_number: "3" } }),
      },
    );
    expect(result.workflowUrl).toBe(
      "https://github.com/owner/repo/actions/workflows/ai-repair-safe-update.yml",
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
