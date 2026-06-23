import type { APIRoute } from "astro";
import { z } from "zod";
import { isApiAuthorized } from "../../lib/api-auth";
import { jsonResponse } from "../../lib/api-cors";
import { sendTenantAuthLink } from "../../lib/send-tenant-auth-link";

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  /** When true, return copy/open link without sending invite email. */
  returnLink: z.boolean().optional(),
});

function parseReturnLinkOnly(context: Parameters<APIRoute>[0], bodyReturnLink?: boolean): boolean {
  if (bodyReturnLink === true) return true;
  const q = context.url.searchParams;
  return q.get("return_link") === "true" || q.get("mode") === "copy";
}

export const POST: APIRoute = async (context) => {
  if (!(await isApiAuthorized(context))) {
    return jsonResponse({ error: "Unauthorized" }, context.request, 401);
  }

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, context.request, 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: parsed.error.flatten().fieldErrors }, context.request, 400);
  }

  try {
    const returnLinkOnly = parseReturnLinkOnly(context, parsed.data.returnLink);
    const result = await sendTenantAuthLink(parsed.data.tenantId, { returnLinkOnly });
    return jsonResponse(result, context.request);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: message }, context.request, 500);
  }
};

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204 });
