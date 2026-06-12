export type LoginRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type LoginRateLimiterOptions = {
  maxAttempts: number;
  windowMs: number;
};

type LoginAttemptWindow = {
  count: number;
  resetAt: number;
};

export function createLoginRateLimiter({ maxAttempts, windowMs }: LoginRateLimiterOptions) {
  const attempts = new Map<string, LoginAttemptWindow>();

  return {
    check(clientKey: string, now = Date.now()): LoginRateLimitResult {
      const current = attempts.get(clientKey);
      if (!current || current.resetAt <= now) {
        attempts.set(clientKey, { count: 1, resetAt: now + windowMs });
        return { allowed: true };
      }

      if (current.count >= maxAttempts) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        };
      }

      current.count += 1;
      return { allowed: true };
    },

    reset(clientKey: string): void {
      attempts.delete(clientKey);
    },
  };
}

export const adminLoginRateLimiter = createLoginRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

export function getLoginClientKey(request: Request): string {
  // Prefer headers set by the platform (not spoofable by the client). x-forwarded-for is
  // client-influenced: clients can prepend arbitrary entries, so only the LAST hop
  // (appended by the edge) is trustworthy — never the first.
  const netlifyIp = request.headers.get("x-nf-client-connection-ip")?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);

  return netlifyIp || realIp || forwardedFor || "unknown";
}
