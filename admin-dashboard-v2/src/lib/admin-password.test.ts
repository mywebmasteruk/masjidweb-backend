import { describe, expect, it } from "vitest";
import { isAdminPasswordMatch } from "./admin-password";

describe("isAdminPasswordMatch", () => {
  it("accepts the exact expected password", () => {
    expect(isAdminPasswordMatch("correct horse battery staple", "correct horse battery staple")).toBe(true);
  });

  it("rejects a different password", () => {
    expect(isAdminPasswordMatch("correct horse battery staple", "correct horse battery stable")).toBe(false);
  });

  it("rejects missing or empty values", () => {
    expect(isAdminPasswordMatch(undefined, "anything")).toBe(false);
    expect(isAdminPasswordMatch("expected", "")).toBe(false);
  });
});
