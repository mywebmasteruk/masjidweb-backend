import { describe, expect, it } from "vitest";
import { compareVersions, isSupersededSafeUpdateVersion } from "./github-updates";

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
