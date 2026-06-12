import type { APIRoute } from "astro";
import { z } from "zod";
import { isAuthorized } from "../../lib/auth-helpers";
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
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ ok: false, error: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const returnLinkOnly = parseReturnLinkOnly(context, parsed.data.returnLink);
    const result = await sendTenantAuthLink(parsed.data.tenantId, { returnLinkOnly });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
