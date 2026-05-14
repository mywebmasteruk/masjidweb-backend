import { describe, expect, it } from "vitest";
import { findPreviousReadyDeploy, type DeployInfo } from "./netlify-deploys";

function deploy(overrides: Partial<DeployInfo>): DeployInfo {
  return {
    id: "deploy-id",
    state: "ready",
    title: null,
    commitRef: null,
    branch: "main",
    createdAt: "2026-05-14T00:00:00.000Z",
    publishedAt: "2026-05-14T00:00:00.000Z",
    deployUrl: "https://example.netlify.app",
    isCurrent: false,
    ...overrides,
  };
}

describe("findPreviousReadyDeploy", () => {
  it("returns the first older ready deploy after the current live deploy", () => {
    const previous = deploy({ id: "previous", createdAt: "2026-05-13T00:00:00.000Z" });
    const deploys = [
      deploy({ id: "newer-preview", state: "ready", isCurrent: false }),
      deploy({ id: "current", isCurrent: true }),
      previous,
      deploy({ id: "older", createdAt: "2026-05-12T00:00:00.000Z" }),
    ];

    expect(findPreviousReadyDeploy(deploys)).toBe(previous);
  });

  it("skips failed or building deploys when selecting rollback target", () => {
    const previous = deploy({ id: "previous-ready" });
    const deploys = [
      deploy({ id: "current", isCurrent: true }),
      deploy({ id: "failed", state: "error" }),
      deploy({ id: "building", state: "building" }),
      previous,
    ];

    expect(findPreviousReadyDeploy(deploys)).toBe(previous);
  });

  it("does not select a rollback target when the live deploy is not in the recent list", () => {
    const deploys = [deploy({ id: "ready-1" }), deploy({ id: "ready-2" })];

    expect(findPreviousReadyDeploy(deploys)).toBeUndefined();
  });

  it("does not select a deploy from another branch", () => {
    const deploys = [
      deploy({ id: "current", branch: "main", isCurrent: true }),
      deploy({ id: "preview-branch", branch: "feature/demo" }),
    ];

    expect(findPreviousReadyDeploy(deploys)).toBeUndefined();
  });
});
