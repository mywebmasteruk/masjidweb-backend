import { createHash, timingSafeEqual } from "node:crypto";
import { readServerEnv } from "./server-env";

/** Constant-time secret compare (sha256 digests sidestep length leaks). */
function secretsMatch(expected: string, provided: string): boolean {
  const a = createHash("sha256").update(expected, "utf8").digest();
  const b = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Server-to-server auth for Payload (`manage.masjidweb.com`) calling admin JSON APIs.
 * Send header `x-payload-service-secret: <PAYLOAD_SERVICE_SECRET>` (16+ chars, same on both apps).
 */
function payloadServiceSecret(): string | undefined {
  return (
    readServerEnv("PAYLOAD_SERVICE_SECRET")?.trim() ||
    readServerEnv("PAYLOAD_OPS_API_SECRET")?.trim()
  );
}

export function isPayloadServiceAuthorized(request: Request): boolean {
  const secret = payloadServiceSecret();
  const provided = request.headers.get("x-payload-service-secret")?.trim();
  if (!secret || secret.length < 16 || !provided) return false;
  return secretsMatch(secret, provided);
}
