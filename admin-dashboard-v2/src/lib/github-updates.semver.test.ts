import { describe, expect, it } from "vitest";
import { compareVersions } from "./github-updates";

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
