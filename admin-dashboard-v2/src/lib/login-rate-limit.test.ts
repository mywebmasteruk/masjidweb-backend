import { describe, expect, it } from "vitest";
import { createLoginRateLimiter } from "./login-rate-limit";

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
