import { describe, expect, it } from "vitest";
import { describeAdminUpdateState } from "./update-admin-copy";

describe("describeAdminUpdateState", () => {
  it("tells admins they can safely prepare an update when a newer release exists", () => {
    const result = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: true,
      latestReleaseVersion: "1.7.0",
      deployedPackageVersion: "1.6.1",
    });

    expect(result.status).toBe("update_available");
    expect(result.title).toBe("Update available");
    expect(result.actionLabel).toBe("Prepare safe update");
    expect(result.canPrepare).toBe(true);
    expect(result.canApprove).toBe(false);
    expect(result.productionStatus).toBe("Production unchanged");
    expect(result.description).toContain("Preparing it will not change production");
  });

  it("shows up to date when no newer release exists", () => {
    const result = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: false,
      latestReleaseVersion: "1.6.1",
      deployedPackageVersion: "1.6.1",
    });

    expect(result.status).toBe("up_to_date");
    expect(result.title).toBe("Up to date");
    expect(result.canPrepare).toBe(false);
    expect(result.canApprove).toBe(false);
    expect(result.description).toContain("No action needed");
  });

  it("keeps setup errors plain English", () => {
    const result = describeAdminUpdateState({
      ok: false,
      error: "GITHUB_TOKEN or GITHUB_REPO not configured",
    });

    expect(result.status).toBe("setup_required");
    expect(result.title).toBe("Setup needed");
    expect(result.canPrepare).toBe(false);
    expect(result.canApprove).toBe(false);
    expect(result.description).toContain("missing update configuration");
  });

  it("blocks approval for a draft safe-update PR with conflicts", () => {
    const result = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: true,
      activeSafeUpdate: {
        number: 1,
        title: "chore: review Ycode core update",
        url: "https://github.com/example/repo/pull/1",
        isDraft: true,
        mergeable: false,
        mergeableState: "dirty",
        ciStatus: "failure",
        labels: ["safe-ycode-update", "needs-developer-review", "tenant-sensitive-update"],
      },
    });

    expect(result.status).toBe("blocked_needs_resolution");
    expect(result.title).toBe("Update prepared, but not ready");
    expect(result.canPrepare).toBe(false);
    expect(result.canApprove).toBe(false);
    expect(result.productionStatus).toBe("Production unchanged");
    expect(result.actionLabel).toBe("Copy request for AI/operator");
    expect(result.nextActionText).toBe("Resolve safe update PR #1");
    expect(result.description).toContain("Do not approve this update yet");
  });

  it("blocks approval when checks failed even if the PR is not draft", () => {
    const result = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 2,
        title: "chore: update Ycode core",
        url: "https://github.com/example/repo/pull/2",
        isDraft: false,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "failure",
        labels: ["safe-ycode-update"],
      },
    });

    expect(result.status).toBe("checks_failed");
    expect(result.canApprove).toBe(false);
    expect(result.actionLabel).toBe("Open technical report");
    expect(result.description).toContain("checks failed");
  });

  it("allows approval only when safe PR is mergeable and checks pass", () => {
    const result = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 3,
        title: "chore: update Ycode core",
        url: "https://github.com/example/repo/pull/3",
        isDraft: false,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "success",
        labels: ["safe-ycode-update"],
      },
    });

    expect(result.status).toBe("ready_to_approve");
    expect(result.title).toBe("Ready for admin approval");
    expect(result.canApprove).toBe(true);
    expect(result.canPrepare).toBe(false);
    expect(result.productionStatus).toBe("Production unchanged");
    expect(result.actionLabel).toBe("Open PR to approve update");
  });

  it("tells admins to wait while checks are pending", () => {
    const result = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 4,
        title: "chore: update Ycode core",
        url: "https://github.com/example/repo/pull/4",
        isDraft: false,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "pending",
        labels: ["safe-ycode-update"],
      },
    });

    expect(result.status).toBe("preparing");
    expect(result.actionLabel).toBe("Refresh status");
    expect(result.description).toContain("still running");
  });
});
