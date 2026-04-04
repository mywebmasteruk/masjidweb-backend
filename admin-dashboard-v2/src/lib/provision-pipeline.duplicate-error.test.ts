import { describe, expect, it } from "vitest";
import { ProvisionValidationError } from "./provision-email-policy";
import { isDuplicateSlugProvisionError } from "./provision-pipeline";

describe("isDuplicateSlugProvisionError", () => {
  it("matches startProvision duplicate message", () => {
    expect(
      isDuplicateSlugProvisionError(
        new ProvisionValidationError(
          "A tenant with this slug already exists. Choose a different slug or business name.",
        ),
      ),
    ).toBe(true);
  });

  it("returns false for unrelated validation errors", () => {
    expect(
      isDuplicateSlugProvisionError(
        new ProvisionValidationError("Could not derive a URL slug from the business name."),
      ),
    ).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isDuplicateSlugProvisionError(null)).toBe(false);
    expect(isDuplicateSlugProvisionError(new Error("network"))).toBe(false);
  });
});
