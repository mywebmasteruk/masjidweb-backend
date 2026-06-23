import type { MiddlewareHandler } from "astro";
import {
  isDashboardAllowedHost,
  wrongHostForAdminMessage,
} from "./lib/admin-host-allowlist";
import { corsHeadersForRequest, corsPreflightHeaders } from "./lib/api-cors";
import { parseCookies, verifySessionToken, getSessionCookieName } from "./lib/session";

export const onRequest: MiddlewareHandler = async (context, next) => {
  const suffix =
    (import.meta.env.TENANT_DOMAIN_SUFFIX as string | undefined) || "masjidweb.com";
  const host = context.request.headers.get("host");
  if (!isDashboardAllowedHost(host, suffix)) {
    return new Response(wrongHostForAdminMessage(suffix), {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const path = context.url.pathname;
  if (path.startsWith("/api/")) {
    if (context.request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsPreflightHeaders(context.request),
      });
    }
  }
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
  const response = await next();
  if (path.startsWith("/api/")) {
    for (const [key, value] of Object.entries(corsHeadersForRequest(context.request))) {
      response.headers.set(key, value);
    }
  }
  return response;
};
