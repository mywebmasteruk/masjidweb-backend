import type { APIContext } from "astro";
import { isAuthorized } from "./auth-helpers";
import { isPayloadServiceAuthorized } from "./payload-service-auth";

/** Dashboard session cookie or Payload server-to-server secret. */
export async function isApiAuthorized(
  context: APIContext | { request: Request },
): Promise<boolean> {
  if (await isAuthorized(context)) return true;
  return isPayloadServiceAuthorized(context.request);
}
