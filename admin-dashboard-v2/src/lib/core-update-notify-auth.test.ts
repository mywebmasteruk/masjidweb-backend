import { afterEach, describe, expect, it, vi } from "vitest";
import { isCoreUpdateNotifyAuthorized } from "./core-update-notify-auth";

function contextWith(header: string | null): { request: Request } {
  const headers = new Headers();
  if (header !== null) headers.set("x-core-update-notify-secret", header);
  return { request: new Request("https://admin.example.com/api/isolation-check-log", { headers }) };
}

describe("isCoreUpdateNotifyAuthorized", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the matching secret", () => {
    vi.stubEnv("CORE_UPDATE_NOTIFY_SECRET", "s3cret-value-1234567890");
    expect(isCoreUpdateNotifyAuthorized(contextWith("s3cret-value-1234567890") as never)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    vi.stubEnv("CORE_UPDATE_NOTIFY_SECRET", "s3cret-value-1234567890");
    expect(isCoreUpdateNotifyAuthorized(contextWith("nope") as never)).toBe(false);
  });

  it("rejects when the header is missing", () => {
    vi.stubEnv("CORE_UPDATE_NOTIFY_SECRET", "s3cret-value-1234567890");
    expect(isCoreUpdateNotifyAuthorized(contextWith(null) as never)).toBe(false);
  });

  it("rejects when no secret is configured", () => {
    vi.stubEnv("CORE_UPDATE_NOTIFY_SECRET", "");
    expect(isCoreUpdateNotifyAuthorized(contextWith("anything") as never)).toBe(false);
  });
});
