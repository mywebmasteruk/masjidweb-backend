import { describe, expect, it } from "vitest";
import { describeAdminUpdateState } from "./update-admin-copy";

const basePr = {
  number: 1,
  title: "chore: review Ycode core update",
  url: "https://github.com/example/repo/pull/1",
  deployPreviewUrl: "https://deploy-preview-1--masjidweb-tenants.netlify.app",
};

describe("describeAdminUpdateState", () => {
  it("tells admins they can safely prepare an update when a newer release exists", () => {
    const result = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: true,
      latestReleaseVersion: "1.7.0",
      forkPackageVersion: "1.6.1",
      deployedPackageVersion: "1.6.1",
    });

    expect(result.status).toBe("update_available");
    expect(result.phases.find((p) => p.step === 1)?.status).toBe("current");
    expect(result.canPrepare).toBe(true);
    expect(result.canApprove).toBe(false);
    expect(result.nextActionText).not.toMatch(/^Step 2:/);
    expect(result.phases.find((p) => p.step === 1)?.detail).toMatch(/Prepare safe update/);
  });

  it("shows up to date when no newer release exists", () => {
    const result = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: false,
      latestReleaseVersion: "1.6.1",
      forkPackageVersion: "1.6.1",
      deployedPackageVersion: "1.6.1",
    });

    expect(result.status).toBe("up_to_date");
    expect(result.canPrepare).toBe(false);
  });

  it("keeps upstream patch releases actionable", () => {
    const result = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: true,
      latestReleaseVersion: "1.10.1",
      forkPackageVersion: "1.10.0",
      deployedPackageVersion: "1.10.0",
    });

    expect(result.status).toBe("update_available");
    expect(result.canPrepare).toBe(true);
    expect(result.phases.find((p) => p.step === 1)?.status).toBe("current");
  });

  it("fails closed when release or fork version cannot be verified", () => {
    const result = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: false,
      latestReleaseVersion: null,
      forkPackageVersion: null,
      deployedPackageVersion: "1.10.0",
    });

    expect(result.status).toBe("unknown_error");
    expect(result.trafficLight).toBe("red");
    expect(result.canPrepare).toBe(false);
    expect(result.description).toContain("could not verify");
  });

  it("still shows update available when fork main is behind upstream on minor version", () => {
    const result = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: true,
      latestReleaseVersion: "1.7.0",
      forkPackageVersion: "1.6.1",
      deployedPackageVersion: "1.6.1",
    });

    expect(result.status).toBe("update_available");
    expect(result.canPrepare).toBe(true);
  });

  it("blocks approval when merge conflicts exist", () => {
    const result = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: true,
      latestReleaseVersion: "1.23.1",
      forkPackageVersion: "1.20.0",
      activeSafeUpdate: {
        ...basePr,
        isDraft: true,
        mergeable: false,
        mergeableState: "dirty",
        ciStatus: "failure",
        labels: ["safe-ycode-update", "needs-developer-review"],
        autopilotStatus: "blocked",
        autopilotRisk: "HIGH",
        autopilotBlockedReason: "Autopilot blocked this update to protect tenant data: 4 conflict(s) are in tenant-sensitive files.",
      },
    });

    expect(result.status).toBe("blocked_needs_resolution");
    expect(result.title).toBe("Update blocked");
    expect(result.description).toContain("protect tenant data");
    expect(result.actionLabel).toBe("Fix with Premium AI");
    expect(result.nextActionText).toContain("Approval stays locked");
    expect(result.canApprove).toBe(false);
    expect(result.canCopyPrompt).toBe(true);
    expect(result.trafficLight).toBe("red");
    expect(result.trafficLightLabel).toBe("Update blocked");
    expect(result.phases.find((p) => p.step === 2)?.status).toBe("current");
    expect(result.agentPrompt).toContain("Safe update PR: #1");
  });

  it("allows preview when draft PR is clean and checks pass", () => {
    const result = describeAdminUpdateState({
      ok: true,
      latestReleaseVersion: "1.23.1",
      forkPackageVersion: "1.20.0",
      activeSafeUpdate: {
        ...basePr,
        number: 2,
        isDraft: true,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "success",
        labels: ["safe-ycode-update", "tenant-sensitive-update"],
      },
    });

    expect(result.status).toBe("ready_to_preview");
    expect(result.actionLabel).toBe("Approve merge");
    expect(result.canPreview).toBe(true);
    expect(result.canApprove).toBe(true);
    expect(result.trafficLight).toBe("green");
    expect(result.trafficLightLabel).toBe("Ready for you");
    expect(result.previewUrl).toBe(
      "https://deploy-preview-1--masjidweb-tenants.netlify.app",
    );
    expect(result.previewUrl).not.toContain("/ycode");
    expect(result.preview?.publicSiteOnPreview).toBe(result.previewUrl);
    expect(result.previewBuilderUrl).toContain("/ycode");
    expect(result.preview?.tenantSlug).toBe("masjidemo1");
    expect(result.preview?.loginEmailHint).toBe("masjidemo1@masjidweb.com");
    expect(result.phases.find((p) => p.step === 3)?.status).toBe("current");
  });

  it("does not treat needs-developer-review as merge conflicts when PR is mergeable", () => {
    const result = describeAdminUpdateState({
      ok: true,
      latestReleaseVersion: "1.23.1",
      forkPackageVersion: "1.20.0",
      activeSafeUpdate: {
        ...basePr,
        number: 3,
        isDraft: true,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "success",
        labels: ["safe-ycode-update", "needs-developer-review", "tenant-sensitive-update"],
      },
    });

    expect(result.status).toBe("ready_to_preview");
    expect(result.canApprove).toBe(true);
    expect(result.canCopyPrompt).toBe(false);
  });

  it("allows approval when safe PR is mergeable and checks pass", () => {
    const result = describeAdminUpdateState({
      ok: true,
      latestReleaseVersion: "1.23.1",
      forkPackageVersion: "1.20.0",
      activeSafeUpdate: {
        ...basePr,
        number: 3,
        isDraft: false,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "success",
        labels: ["safe-ycode-update"],
      },
    });

    expect(result.status).toBe("ready_to_approve");
    expect(result.canApprove).toBe(true);
    expect(result.actionLabel).toBe("Approve merge");
    expect(result.phases.find((p) => p.step === 4)?.status).toBe("current");
  });

  it("tells admins to wait while checks are pending", () => {
    const result = describeAdminUpdateState({
      ok: true,
      latestReleaseVersion: "1.23.1",
      forkPackageVersion: "1.20.0",
      activeSafeUpdate: {
        ...basePr,
        number: 4,
        isDraft: false,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "pending",
        labels: ["safe-ycode-update"],
      },
    });

    expect(result.status).toBe("preparing");
    expect(result.actionLabel).toBe("Refresh status");
  });
});
