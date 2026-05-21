import { describe, expect, it } from "vitest";
import { pickCoreVersionUpgradeDeploys } from "./core-version-history";

describe("pickCoreVersionUpgradeDeploys", () => {
  it("keeps the newest deploy for each core version", () => {
    const rows = [
      { id: "live", version: "1.10.0" },
      { id: "prev-same", version: "1.10.0" },
      { id: "older", version: "1.6.1" },
      { id: "older-dup", version: "1.6.1" },
      { id: "oldest", version: "1.5.0" },
    ];

    expect(pickCoreVersionUpgradeDeploys(rows).map((r) => r.id)).toEqual([
      "live",
      "older",
      "oldest",
    ]);
  });

  it("skips rows without a resolved version", () => {
    const rows = [
      { id: "live", version: "1.10.0" },
      { id: "unknown", version: null },
      { id: "older", version: "1.6.1" },
    ];

    expect(pickCoreVersionUpgradeDeploys(rows).map((r) => r.id)).toEqual([
      "live",
      "older",
    ]);
  });
});
