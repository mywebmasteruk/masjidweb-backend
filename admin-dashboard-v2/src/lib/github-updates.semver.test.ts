import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compareVersions,
  getReleaseSemverVsFork,
  isFailingCheckConclusion,
  isSupersededSafeUpdatePullRequest,
  isSupersededSafeUpdateVersion,
} from "./github-updates";

describe("compareVersions (aligned with ycode-masjidweb check-updates)", () => {
  it("detects newer patch", () => {
    expect(compareVersions("0.9.2", "0.9.1")).toBe(1);
  });
  it("equal", () => {
    expect(compareVersions("0.9.2", "0.9.2")).toBe(0);
  });
  it("older patch", () => {
    expect(compareVersions("0.9.1", "0.9.2")).toBe(-1);
  });
});

describe("isFailingCheckConclusion", () => {
  it("treats action-required checks as failures", () => {
    expect(isFailingCheckConclusion("action_required")).toBe(true);
  });

  it("does not treat neutral informational checks as failures", () => {
    expect(isFailingCheckConclusion("neutral")).toBe(false);
  });
});

function packageJsonResponse(version: string): Response {
  return new Response(JSON.stringify({
    content: Buffer.from(JSON.stringify({ version })).toString("base64"),
    encoding: "base64",
  }));
}

describe("getReleaseSemverVsFork", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to upstream package.json when latest release API is unavailable", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href === "https://api.github.com/repos/owner/fork") {
        return new Response(JSON.stringify({ default_branch: "main" }));
      }
      if (href === "https://api.github.com/repos/owner/fork/contents/package.json?ref=main") {
        return packageJsonResponse("1.20.0");
      }
      if (href === "https://api.github.com/repos/ycode/ycode/releases/latest") {
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      }
      if (href === "https://api.github.com/repos/ycode/ycode/contents/package.json?ref=main") {
        return packageJsonResponse("1.23.1");
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getReleaseSemverVsFork("token", "owner/fork", "main");

    expect(result.latestReleaseVersion).toBe("1.23.1");
    expect(result.forkPackageVersion).toBe("1.20.0");
    expect(result.releaseAheadOfForkPackage).toBe(true);
    expect(result.releaseUrl).toBeNull();
  });
});

describe("isSupersededSafeUpdateVersion", () => {
  it("treats equal package versions as superseded", () => {
    expect(isSupersededSafeUpdateVersion("1.10.0", "1.10.0")).toBe(true);
  });

  it("treats older PR head versions as superseded", () => {
    expect(isSupersededSafeUpdateVersion("1.6.1", "1.10.0")).toBe(true);
  });

  it("keeps newer PR head versions active", () => {
    expect(isSupersededSafeUpdateVersion("1.10.1", "1.10.0")).toBe(false);
  });

  it("does not supersede when versions are unknown", () => {
    expect(isSupersededSafeUpdateVersion(null, "1.10.0")).toBe(false);
  });
});

describe("isSupersededSafeUpdatePullRequest", () => {
  it("treats merged head sha as superseded even when package versions match", () => {
    expect(
      isSupersededSafeUpdatePullRequest(
        { headSha: "abc123" },
        "abc123",
        "1.11.0",
        "1.11.0",
      ),
    ).toBe(true);
  });

  it("keeps open PR active when package versions match but head sha differs", () => {
    expect(
      isSupersededSafeUpdatePullRequest(
        { headSha: "branch-sha" },
        "main-sha",
        "1.11.0",
        "1.11.0",
      ),
    ).toBe(false);
  });

  it("skips PR when head semver is strictly behind main", () => {
    expect(
      isSupersededSafeUpdatePullRequest(
        { headSha: "branch-sha" },
        "main-sha",
        "1.10.0",
        "1.11.0",
      ),
    ).toBe(true);
  });
});
