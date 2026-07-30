import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubWorkflowDispatchError } from "../../../lib/github-safe-update";

const mocks = vi.hoisted(() => ({
  startFreshSafeUpdate: vi.fn(),
  formatCoreUpdateEmail: vi.fn(() => ({ subject: "subject", text: "text" })),
  getGithubUpdatesConfig: vi.fn(),
  isAuthorized: vi.fn(),
  sendCoreUpdateEmail: vi.fn(),
}));

vi.mock("../../../lib/auth-helpers", () => ({
  isAuthorized: mocks.isAuthorized,
}));

vi.mock("../../../lib/github-env", () => ({
  getGithubUpdatesConfig: mocks.getGithubUpdatesConfig,
}));

vi.mock("../../../lib/core-update-email", () => ({
  formatCoreUpdateEmail: mocks.formatCoreUpdateEmail,
  sendCoreUpdateEmail: mocks.sendCoreUpdateEmail,
}));

vi.mock("../../../lib/updates-env", () => ({
  githubProductionBranch: () => "main",
}));

vi.mock("../../../lib/github-safe-update", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/github-safe-update")>();
  return {
    ...actual,
    startFreshSafeUpdate: mocks.startFreshSafeUpdate,
  };
});

const context = { request: new Request("https://admin.masjidweb.com/api/updates/prepare-safe-update") };

describe("prepare-safe-update API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthorized.mockResolvedValue(true);
    mocks.getGithubUpdatesConfig.mockReturnValue({
      token: "read-token",
      workflowToken: "workflow-token",
      repo: "mywebmasteruk/ycode-mw-tenant",
    });
    mocks.startFreshSafeUpdate.mockResolvedValue({
      closedPrs: [37],
      message:
        "Closed blocking PR #37. GitHub is preparing a fresh safe-update PR from current production code. " +
        "Live production stays on the current version until you approve that new PR — " +
        "this page will update when the PR appears.",
    });
    mocks.sendCoreUpdateEmail.mockResolvedValue(undefined);
  });

  it("closes blocking PRs then starts a fresh safe update", async () => {
    const { POST } = await import("./prepare-safe-update");

    const response = await POST(context as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.closedPrs).toEqual([37]);
    expect(body.message).toContain("Closed blocking PR #37");
    expect(body.message).toContain("Live production stays");
    expect(mocks.startFreshSafeUpdate).toHaveBeenCalledWith({
      token: "read-token",
      workflowToken: "workflow-token",
      repo: "mywebmasteruk/ycode-mw-tenant",
      productionBranch: "main",
      reason: "prepare",
    });
  });

  it("returns an actionable hint when GitHub rejects workflow dispatch permissions", async () => {
    mocks.startFreshSafeUpdate.mockRejectedValue(
      new GithubWorkflowDispatchError("GitHub workflow dispatch failed: 403", 403),
    );
    const { POST } = await import("./prepare-safe-update");

    const response = await POST(context as never);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.configIssue).toBe("github_workflow_token_forbidden");
    expect(body.workflowUrl).toBe(
      "https://github.com/mywebmasteruk/ycode-mw-tenant/actions/workflows/sync-upstream.yml",
    );
    expect(body.message).toContain("Grant Actions workflow write permission");
  });

  it("returns a close-PR hint when the token cannot close the blocker", async () => {
    mocks.startFreshSafeUpdate.mockRejectedValue(new Error("Failed to close PR #37: 403"));
    const { POST } = await import("./prepare-safe-update");

    const response = await POST(context as never);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.configIssue).toBe("github_token_cannot_close_prs");
    expect(body.message).toContain("close the open safe-ycode-update PR");
  });
});
