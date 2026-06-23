import { readServerEnv } from "./server-env";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://manage.masjidweb.com",
  "http://localhost:3003",
  "http://127.0.0.1:3003",
];

function parseAllowedOrigins(): string[] {
  const raw = readServerEnv("PAYLOAD_PORTAL_ORIGINS");
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function resolveCorsOrigin(request: Request): string | null {
  const allowed = parseAllowedOrigins();
  const requestOrigin = normalizeOrigin(request.headers.get("origin"));
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;

  const refererOrigin = normalizeOrigin(request.headers.get("referer"));
  if (refererOrigin && allowed.includes(refererOrigin)) return refererOrigin;

  return null;
}

export function corsHeadersForRequest(request: Request): Record<string, string> {
  const origin = resolveCorsOrigin(request);
  if (!origin) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export function corsPreflightHeaders(request: Request): Record<string, string> {
  const origin = resolveCorsOrigin(request);
  if (!origin) {
    return { "Content-Type": "text/plain; charset=utf-8" };
  }

  const requested = request.headers.get("access-control-request-headers");
  return {
    ...corsHeadersForRequest(request),
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      requested ??
      "Content-Type, Authorization, x-payload-service-secret, x-provision-internal",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "text/plain; charset=utf-8",
  };
}

export function jsonResponse(
  body: unknown,
  request: Request,
  status = 200,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...corsHeadersForRequest(request),
  };
  return new Response(JSON.stringify(body), { status, headers });
}
