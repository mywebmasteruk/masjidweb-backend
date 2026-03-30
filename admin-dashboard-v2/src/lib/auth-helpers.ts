import type { APIContext } from "astro";
import { parseCookies, verifySessionToken, getSessionCookieName } from "./session";

export async function isAuthorized(context: APIContext | { request: Request }): Promise<boolean> {
  const cookie = parseCookies(context.request.headers.get("cookie"));
  const token = cookie[getSessionCookieName()];
  if (!token) return false;
  return verifySessionToken(token);
}
