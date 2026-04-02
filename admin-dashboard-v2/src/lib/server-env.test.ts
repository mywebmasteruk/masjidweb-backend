import { describe, expect, it } from "vitest";
import { readServerEnv } from "./server-env";

describe("readServerEnv", () => {
  it("reads from process.env when set", () => {
    process.env["SERVER_ENV_TEST_KEY"] = "abc";
    expect(readServerEnv("SERVER_ENV_TEST_KEY")).toBe("abc");
    delete process.env["SERVER_ENV_TEST_KEY"];
  });
});
