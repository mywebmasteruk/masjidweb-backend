import { describe, expect, it } from "vitest";
import { createLoginRateLimiter, getLoginClientKey } from "./login-rate-limit";

describe("createLoginRateLimiter", () => {
  it("allows attempts below the limit", () => {
    const limiter = createLoginRateLimiter({ maxAttempts: 3, windowMs: 60_000 });

    expect(limiter.check("192.0.2.10", 1_000)).toEqual({ allowed: true });
    expect(limiter.check("192.0.2.10", 2_000)).toEqual({ allowed: true });
    expect(limiter.check("192.0.2.10", 3_000)).toEqual({ allowed: true });
  });

  it("blocks attempts over the limit inside the window", () => {
    const limiter = createLoginRateLimiter({ maxAttempts: 2, windowMs: 60_000 });

    limiter.check("192.0.2.10", 1_000);
    limiter.check("192.0.2.10", 2_000);

    expect(limiter.check("192.0.2.10", 3_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 58,
    });
  });

  it("allows attempts again after the window expires", () => {
    const limiter = createLoginRateLimiter({ maxAttempts: 1, windowMs: 60_000 });

    limiter.check("192.0.2.10", 1_000);
    expect(limiter.check("192.0.2.10", 2_000).allowed).toBe(false);
    expect(limiter.check("192.0.2.10", 61_001)).toEqual({ allowed: true });
  });

  it("tracks clients independently", () => {
    const limiter = createLoginRateLimiter({ maxAttempts: 1, windowMs: 60_000 });

    limiter.check("192.0.2.10", 1_000);

    expect(limiter.check("198.51.100.20", 2_000)).toEqual({ allowed: true });
  });

  it("can clear attempts after successful login", () => {
    const limiter = createLoginRateLimiter({ maxAttempts: 1, windowMs: 60_000 });

    limiter.check("192.0.2.10", 1_000);
    limiter.reset("192.0.2.10");

    expect(limiter.check("192.0.2.10", 2_000)).toEqual({ allowed: true });
  });
});

describe("getLoginClientKey", () => {
  function requestWithHeaders(headers: Record<string, string>): Request {
    return new Request("https://admin.example.com/api/auth/login", { headers });
  }

  it("prefers the Netlify trusted client IP over forwarded headers", () => {
    const key = getLoginClientKey(
      requestWithHeaders({
        "x-nf-client-connection-ip": "203.0.113.7",
        "x-real-ip": "198.51.100.1",
        "x-forwarded-for": "10.0.0.1, 203.0.113.7",
      }),
    );
    expect(key).toBe("203.0.113.7");
  });

  it("ignores client-prepended x-forwarded-for entries (uses last hop)", () => {
    const key = getLoginClientKey(
      requestWithHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.7" }),
    );
    expect(key).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when Netlify header is absent", () => {
    const key = getLoginClientKey(
      requestWithHeaders({
        "x-real-ip": "198.51.100.1",
        "x-forwarded-for": "1.2.3.4",
      }),
    );
    expect(key).toBe("198.51.100.1");
  });

  it("returns unknown when no IP headers are present", () => {
    expect(getLoginClientKey(requestWithHeaders({}))).toBe("unknown");
  });
});
