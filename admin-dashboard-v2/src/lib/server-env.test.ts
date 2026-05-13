import { describe, expect, it } from "vitest";
import { readServerEnv } from "./server-env";

describe("readServerEnv", () => {
  it("reads from process.env when set", () => {
    process.env["SERVER_ENV_TEST_KEY"] = "abc";
    expect(readServerEnv("SERVER_ENV_TEST_KEY")).toBe("abc");
    delete process.env["SERVER_ENV_TEST_KEY"];
  });

  it("ignores Netlify CLI missing-value placeholders", () => {
    process.env["SERVER_ENV_TEST_KEY"] =
      "No value set in the production context for environment variable YCODE_SITE_INTERNAL_URL";

    expect(readServerEnv("SERVER_ENV_TEST_KEY")).toBeUndefined();

    delete process.env["SERVER_ENV_TEST_KEY"];
  });
});
