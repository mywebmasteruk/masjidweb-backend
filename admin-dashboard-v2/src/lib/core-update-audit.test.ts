import { describe, expect, it } from "vitest";
import { pickLatestReversibleCheckpoint, type CoreUpdateCheckpoint } from "./core-update-audit";

function row(
  partial: Partial<CoreUpdateCheckpoint> & Pick<CoreUpdateCheckpoint, "action" | "createdAt">,
): CoreUpdateCheckpoint {
  return {
    id: partial.id ?? "id",
    action: partial.action,
    prNumber: partial.prNumber ?? null,
    beforeMainSha: partial.beforeMainSha ?? null,
    afterMainSha: partial.afterMainSha ?? null,
    beforeDeployId: partial.beforeDeployId ?? null,
    afterDeployId: partial.afterDeployId ?? null,
    beforePackageVersion: partial.beforePackageVersion ?? null,
    afterPackageVersion: partial.afterPackageVersion ?? null,
    upstreamRef: partial.upstreamRef ?? null,
    safetyLevel: partial.safetyLevel ?? null,
    details: partial.details ?? {},
    createdAt: partial.createdAt,
  };
}

describe("pickLatestReversibleCheckpoint", () => {
  it("returns null when no approve_merge exists", () => {
    expect(
      pickLatestReversibleCheckpoint([
        row({ action: "rollback_deploy", createdAt: "2026-05-21T10:00:00Z" }),
      ]),
    ).toBeNull();
  });

  it("returns latest approve_merge when no rollback_full followed", () => {
    const approve = row({
      action: "approve_merge",
      createdAt: "2026-05-21T12:00:00Z",
      prNumber: 3,
      beforeDeployId: "deploy-before",
    });
    expect(
      pickLatestReversibleCheckpoint([
        row({ action: "rollback_deploy", createdAt: "2026-05-21T11:00:00Z" }),
        approve,
      ]),
    ).toEqual(approve);
  });

  it("returns null when rollback_full is newer than approve_merge", () => {
    expect(
      pickLatestReversibleCheckpoint([
        row({
          action: "approve_merge",
          createdAt: "2026-05-21T12:00:00Z",
          prNumber: 3,
        }),
        row({
          action: "rollback_full",
          createdAt: "2026-05-21T13:00:00Z",
          prNumber: 3,
        }),
      ]),
    ).toBeNull();
  });

  it("returns approve when rollback_full is older than a newer approve", () => {
    const newerApprove = row({
      action: "approve_merge",
      createdAt: "2026-05-22T12:00:00Z",
      prNumber: 4,
      beforeDeployId: "d2",
    });
    expect(
      pickLatestReversibleCheckpoint([
        row({
          action: "approve_merge",
          createdAt: "2026-05-21T12:00:00Z",
          prNumber: 3,
        }),
        row({
          action: "rollback_full",
          createdAt: "2026-05-21T13:00:00Z",
          prNumber: 3,
        }),
        newerApprove,
      ]),
    ).toEqual(newerApprove);
  });
});
