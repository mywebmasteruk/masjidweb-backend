import type { APIContext } from "astro";
import { createHash, timingSafeEqual } from "node:crypto";
import { readServerEnv } from "./server-env";

/** Constant-time secret compare (sha256 digests sidestep length leaks). */
function secretsMatch(expected: string, provided: string): boolean {
  const a = createHash("sha256").update(expected, "utf8").digest();
  const b = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Validates GitHub Actions → admin webhook secret (core-update + isolation log). */
export function isCoreUpdateNotifyAuthorized(context: APIContext): boolean {
  const secret = readServerEnv("CORE_UPDATE_NOTIFY_SECRET")?.trim();
  const provided = context.request.headers.get("x-core-update-notify-secret")?.trim();
  if (!secret || !provided) return false;
  return secretsMatch(secret, provided);
}
