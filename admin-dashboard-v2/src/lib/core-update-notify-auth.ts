import type { APIContext } from "astro";
import { readServerEnv } from "./server-env";

/** Validates GitHub Actions → admin webhook secret (core-update + isolation log). */
export function isCoreUpdateNotifyAuthorized(context: APIContext): boolean {
  const secret = readServerEnv("CORE_UPDATE_NOTIFY_SECRET")?.trim();
  const provided = context.request.headers.get("x-core-update-notify-secret")?.trim();
  return Boolean(secret && provided && provided === secret);
}
