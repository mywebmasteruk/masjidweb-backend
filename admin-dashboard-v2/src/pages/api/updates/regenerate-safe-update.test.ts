import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startFreshSafeUpdate: vi.fn(),
  getGithubUpdatesConfig: vi.fn(),
  isAuthorized: vi.fn(),
}));

vi.mock("../../../lib/auth-helpers", () => ({
  isAuthorized: mocks.isAuthorized,
}));

vi.mock("../../../lib/github-env", () => ({
  getGithubUpdatesConfig: mocks.getGithubUpdatesConfig,
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

const context = {
  request: new Request("https://admin.masjidweb.com/api/updates/regenerate-safe-update"),
};

describe("regenerate-safe-update API", () => {
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
      message: "Closed blocking PR #37. GitHub is preparing a fresh safe-update PR…",
    });
  });

  it("closes blocking PRs then dispatches a fresh update", async () => {
    const { POST } = await import("./regenerate-safe-update");
    const response = await POST(context as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.closedPr).toBe(37);
    expect(body.closedPrs).toEqual([37]);
    expect(mocks.startFreshSafeUpdate).toHaveBeenCalledWith({
      token: "read-token",
      workflowToken: "workflow-token",
      repo: "mywebmasteruk/ycode-mw-tenant",
      productionBranch: "main",
      reason: "regenerate",
    });
  });
});
