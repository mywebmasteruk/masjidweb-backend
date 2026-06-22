import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubWorkflowDispatchError } from "../../../lib/github-safe-update";

const mocks = vi.hoisted(() => ({
  dispatchSafeUpdateWorkflow: vi.fn(),
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

vi.mock("../../../lib/github-safe-update", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/github-safe-update")>();
  return {
    ...actual,
    dispatchSafeUpdateWorkflow: mocks.dispatchSafeUpdateWorkflow,
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
    mocks.dispatchSafeUpdateWorkflow.mockResolvedValue(undefined);
    mocks.sendCoreUpdateEmail.mockResolvedValue(undefined);
  });

  it("dispatches the safe update workflow with the workflow token", async () => {
    const { POST } = await import("./prepare-safe-update");

    const response = await POST(context as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.dispatchSafeUpdateWorkflow).toHaveBeenCalledWith(
      "workflow-token",
      "mywebmasteruk/ycode-mw-tenant",
    );
  });

  it("returns an actionable hint when GitHub rejects workflow dispatch permissions", async () => {
    mocks.dispatchSafeUpdateWorkflow.mockRejectedValue(
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
});
