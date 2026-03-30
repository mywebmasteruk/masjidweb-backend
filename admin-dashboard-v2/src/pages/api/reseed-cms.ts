import type { APIRoute } from "astro";
import { z } from "zod";
import { isAuthorized } from "../../lib/auth-helpers";
import { getServiceSupabase } from "../../lib/supabase-server";
import { getTemplateTenantId } from "../../lib/master-tenant-constants";
import { reseedTenantCmsDemo } from "../../lib/ycode-cms-seed";
import { triggerPostProvisionPublish } from "../../lib/provision-publish";
import { patchNullTenantIds } from "../../lib/provision-tenant-patch";

const bodySchema = z.object({
  slug: z.string().min(1).optional(),
  allActive: z.boolean().optional(),
});

function getDomainSuffix(): string {
  return import.meta.env.TENANT_DOMAIN_SUFFIX || "masjidweb.com";
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
      JSON.stringify({ error: parsed.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = getServiceSupabase();
  const domainSuffix = getDomainSuffix();
  const templateId = getTemplateTenantId();

  const warnings: string[] = [];
  const results: { slug: string; ok: boolean; error?: string }[] = [];

  let query = supabase
    .from("tenant_registry")
    .select("id, slug, business_name, email, address, phone, domain, description, status")
    .neq("id", templateId)
    .in("status", ["active", "provisioning"]);

  if (parsed.data.slug) {
    query = query.eq("slug", parsed.data.slug);
  }

  const { data: tenants, error: listErr } = await query;

  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!parsed.data.slug && parsed.data.allActive !== true) {
    return new Response(
      JSON.stringify({
        error: 'Pass { "slug": "tenant-slug" } or { "allActive": true } to reseed.',
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const list = tenants ?? [];
  if (!list.length) {
    return new Response(JSON.stringify({ ok: true, message: "No tenants matched", results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const t of list) {
    const slug = t.slug as string;
    const tenantId = t.id as string;
    try {
      await reseedTenantCmsDemo(tenantId, slug, {
        slug,
        business_name: (t.business_name as string) ?? slug,
        address: t.address ?? undefined,
        phone: t.phone ?? undefined,
        email: t.email ?? undefined,
        domain: t.domain ?? undefined,
        description: t.description ?? undefined,
      });
      await triggerPostProvisionPublish(slug, domainSuffix, warnings);
      await triggerPostProvisionPublish(slug, domainSuffix, warnings);
      await patchNullTenantIds(supabase, tenantId);
      results.push({ slug, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ slug, ok: false, error: msg });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, warnings, results }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
