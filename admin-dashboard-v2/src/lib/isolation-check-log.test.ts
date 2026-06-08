import { describe, expect, it } from "vitest";
import { parseIsolationCheckPayload, truncateFailureOutput } from "./isolation-check-log";

describe("parseIsolationCheckPayload", () => {
  it("accepts a pass payload with workflow metadata", () => {
    const result = parseIsolationCheckPayload({
      status: "pass",
      durationMs: 45230,
      repository: "mywebmasteruk/ycode-mw-tenant",
      branch: "main",
      commitSha: "abc123",
      workflowRunId: "999",
      workflowRunUrl: "https://github.com/org/repo/actions/runs/999",
      workflowName: "Daily tenant isolation check",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.status).toBe("pass");
      expect(result.entry.durationMs).toBe(45230);
      expect(result.entry.commitSha).toBe("abc123");
    }
  });

  it("rejects invalid status", () => {
    const result = parseIsolationCheckPayload({ status: "unknown" });
    expect(result.ok).toBe(false);
  });

  it("stores failure output on fail", () => {
    const result = parseIsolationCheckPayload({
      status: "fail",
      failureOutput: "FAIL lib/foo.test.ts",
      summary: "1 test failed",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.failureOutput).toContain("FAIL");
      expect(result.entry.summary).toBe("1 test failed");
    }
  });
});

describe("truncateFailureOutput", () => {
  it("returns null for empty output", () => {
    expect(truncateFailureOutput("   ")).toBeNull();
  });

  it("truncates oversized logs", () => {
    const huge = "x".repeat(130_000);
    const out = truncateFailureOutput(huge);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThan(130_000);
    expect(out).toContain("truncated");
  });
});
