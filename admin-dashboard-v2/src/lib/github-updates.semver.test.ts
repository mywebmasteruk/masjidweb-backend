import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compareVersions,
  getReleaseSemverVsFork,
  isFailingCheckConclusion,
  isSafeUpdatePullRequest,
  isSupersededSafeUpdatePullRequest,
  isSupersededSafeUpdateVersion,
  listSyncPRs,
  normalizeBuilderRepo,
  pickActiveSafeUpdatePr,
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

  it("reads package versions from canonical public repos when legacy repo metadata fails", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href === "https://api.github.com/repos/mywebmasteruk/ycode-mw-tenant") {
        return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
      }
      if (href === "https://api.github.com/repos/mywebmasteruk/ycode-mw-tenant/contents/package.json?ref=main") {
        return packageJsonResponse("1.20.0");
      }
      if (href === "https://api.github.com/repos/ycode/ycode/releases/latest") {
        return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
      }
      if (href === "https://api.github.com/repos/ycode/ycode/contents/package.json?ref=main") {
        return packageJsonResponse("1.23.1");
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getReleaseSemverVsFork(
      "bad-token",
      "mywebmasteruk/ycode-masjidweb",
      "main",
    );

    expect(result.forkPackageRepoUsed).toBe("mywebmasteruk/ycode-mw-tenant");
    expect(result.latestReleaseVersion).toBe("1.23.1");
    expect(result.forkPackageVersion).toBe("1.20.0");
    expect(result.releaseAheadOfForkPackage).toBe(true);
  });
});

describe("normalizeBuilderRepo", () => {
  it("maps the removed legacy builder repo to the active fork", () => {
    expect(normalizeBuilderRepo("mywebmasteruk/ycode-masjidweb")).toBe("mywebmasteruk/ycode-mw-tenant");
  });
});

describe("isSafeUpdatePullRequest", () => {
  it("recognizes hyphenated safe-update titles and tenant-sensitive labels", () => {
    expect(
      isSafeUpdatePullRequest({
        number: 23,
        title: "safe-update upstream Ycode",
        base: "main",
        state: "open",
        createdAt: "2026-06-21T00:00:00Z",
        headSha: "sha",
        isDraft: false,
        labels: ["tenant-sensitive-update"],
        mergeable: null,
        mergeableState: null,
        ciStatus: "unknown",
        htmlUrl: "https://github.com/mywebmasteruk/ycode-mw-tenant/pull/23",
        autopilotStatus: null,
        autopilotRisk: null,
        autopilotBlockedReason: null,
        deployPreviewUrl: null,
      }),
    ).toBe(true);
  });
});

describe("listSyncPRs and pickActiveSafeUpdatePr", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("finds an active safe-update PR when compare status is unknown", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const isAuthed = Boolean((init?.headers as Record<string, string> | undefined)?.Authorization);
      if (isAuthed && href.startsWith("https://api.github.com/repos/mywebmasteruk/ycode-mw-tenant/")) {
        return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
      }
      if (href === "https://api.github.com/repos/mywebmasteruk/ycode-mw-tenant/pulls?base=main&state=open&per_page=30") {
        return new Response(JSON.stringify([
          {
            number: 23,
            title: "safe-update upstream Ycode",
            base: { ref: "main" },
            state: "open",
            draft: false,
            labels: [{ name: "safe-ycode-update" }],
            created_at: "2026-06-21T00:00:00Z",
            mergeable: null,
            mergeable_state: "unknown",
            head: { sha: "pr-sha" },
            html_url: "https://github.com/mywebmasteruk/ycode-mw-tenant/pull/23",
            body: "Status: Needs review\nRisk: MEDIUM",
          },
        ]));
      }
      if (href === "https://api.github.com/repos/mywebmasteruk/ycode-mw-tenant/pulls/23") {
        return new Response(JSON.stringify({
          mergeable: null,
          mergeable_state: "unknown",
          head: { sha: "pr-sha" },
        }));
      }
      if (href === "https://api.github.com/repos/mywebmasteruk/ycode-mw-tenant/commits/pr-sha/check-runs") {
        return new Response(JSON.stringify({ total_count: 0, check_runs: [] }));
      }
      if (href === "https://api.github.com/repos/mywebmasteruk/ycode-mw-tenant/commits/pr-sha/status") {
        return new Response(JSON.stringify({ state: "pending", statuses: [] }));
      }
      if (href === "https://api.github.com/repos/mywebmasteruk/ycode-mw-tenant/git/ref/heads/main") {
        return new Response(JSON.stringify({ object: { sha: "main-sha" } }));
      }
      if (href === "https://api.github.com/repos/mywebmasteruk/ycode-mw-tenant/contents/package.json?ref=main-sha") {
        return packageJsonResponse("1.20.0");
      }
      if (href === "https://api.github.com/repos/mywebmasteruk/ycode-mw-tenant/contents/package.json?ref=pr-sha") {
        return packageJsonResponse("1.23.1");
      }
      return new Response(`unexpected ${href}`, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const prs = await listSyncPRs("token", "mywebmasteruk/ycode-masjidweb", ["main"]);
    const active = await pickActiveSafeUpdatePr(
      "token",
      "mywebmasteruk/ycode-masjidweb",
      prs,
      "main",
    );

    expect(prs).toHaveLength(1);
    expect(active?.number).toBe(23);
    expect(active?.mergeableState).toBe("unknown");
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
