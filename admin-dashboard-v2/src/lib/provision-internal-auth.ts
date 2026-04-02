import { timingSafeEqual } from "node:crypto";

function readProvisionInternalSecret(): string | undefined {
  let fromMeta: string | undefined;
  if (typeof import.meta !== "undefined" && import.meta.env) {
    fromMeta = (import.meta.env as Record<string, string | undefined>)[
      "PROVISION_INTERNAL_SECRET"
    ];
  }
  if (typeof fromMeta === "string" && fromMeta.length >= 16) return fromMeta;
  if (typeof process !== "undefined") {
    const p = process.env["PROVISION_INTERNAL_SECRET"];
    if (typeof p === "string" && p.length >= 16) return p;
  }
  return undefined;
}

/**
 * Optional ops/automation auth for provision phase routes when no dashboard session cookie is present.
 * Send header `x-provision-internal: <PROVISION_INTERNAL_SECRET>` (same value as env, 16+ chars).
 */
export function isInternalProvisionRequest(request: Request): boolean {
  const secret = readProvisionInternalSecret();
  if (!secret) return false;
  const header = request.headers.get("x-provision-internal");
  if (!header || header.length !== secret.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(header, "utf8"),
      Buffer.from(secret, "utf8"),
    );
  } catch {
    return false;
  }
}
