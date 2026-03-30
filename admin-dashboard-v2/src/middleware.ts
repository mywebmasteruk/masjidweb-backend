import type { MiddlewareHandler } from "astro";
import { parseCookies, verifySessionToken, getSessionCookieName } from "./lib/session";

export const onRequest: MiddlewareHandler = async (context, next) => {
  const path = context.url.pathname;
  if (path.startsWith("/dashboard")) {
    const cookie = parseCookies(context.request.headers.get("cookie"));
    const token = cookie[getSessionCookieName()];
    const ok = token ? await verifySessionToken(token) : false;
    if (!ok) {
      return context.redirect("/login");
    }
  }
  if (path === "/login") {
    const cookie = parseCookies(context.request.headers.get("cookie"));
    const token = cookie[getSessionCookieName()];
    const ok = token ? await verifySessionToken(token) : false;
    if (ok) {
      return context.redirect("/dashboard");
    }
  }
  return next();
};
