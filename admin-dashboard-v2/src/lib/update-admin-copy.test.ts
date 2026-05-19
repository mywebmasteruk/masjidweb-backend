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

    expect(result.title).toBe("Update available");
    expect(result.actionLabel).toBe("Prepare safe update");
    expect(result.canPrepare).toBe(true);
    expect(result.description).toContain("prepare a reviewed update");
    expect(result.description).toContain("Production will not change immediately");
  });

  it("shows up to date when no newer release exists", () => {
    const result = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: false,
      latestReleaseVersion: "1.6.1",
      deployedPackageVersion: "1.6.1",
    });

    expect(result.title).toBe("Up to date");
    expect(result.canPrepare).toBe(false);
    expect(result.description).toContain("already using the latest known");
  });

  it("keeps setup errors plain English", () => {
    const result = describeAdminUpdateState({
      ok: false,
      error: "GITHUB_TOKEN or GITHUB_REPO not configured",
    });

    expect(result.title).toBe("Setup needed");
    expect(result.canPrepare).toBe(false);
    expect(result.description).toContain("missing update configuration");
  });
});
