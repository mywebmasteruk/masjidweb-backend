import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "admin_session_v2";

function getSecret() {
  const secret = import.meta.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be set (min 32 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    }),
  );
}

export function serializeSessionCookie(token: string): string {
  const maxAge = 60 * 60 * 8;
  const secure = import.meta.env.PROD ? "Secure; " : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; ${secure}`;
}

export function clearSessionCookie(): string {
  const secure = import.meta.env.PROD ? "Secure; " : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; ${secure}`;
}
