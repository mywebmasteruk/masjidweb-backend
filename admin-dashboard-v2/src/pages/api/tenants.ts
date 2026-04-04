import type { APIRoute } from "astro";
import { z } from "zod";
import { isAuthorized } from "../../lib/auth-helpers";
import { getServiceSupabase } from "../../lib/supabase-server";
import { removeDomainAlias } from "../../lib/netlify-domains";
import { deleteTenantScopedData } from "../../lib/tenant-delete-data";

const patchTenantSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["deactivated", "active"]),
});

export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("tenant_registry")
    .select("id, slug, business_name, email, domain, status, netlify_site_url, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ tenants: data ?? [] }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};

export const PATCH: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = patchTenantSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ ok: false, error: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { id, status } = parsed.data;
  const supabase = getServiceSupabase();

  const { data: tenant, error: fetchErr } = await supabase
    .from("tenant_registry")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchErr || !tenant) {
    return new Response(JSON.stringify({ error: "Tenant not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  const { error: updateErr } = await supabase
    .from("tenant_registry")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, id, status }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  let tenantId: string | undefined;
  try {
    const body = (await context.request.json()) as { id?: string };
    tenantId = body.id;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  if (!tenantId) {
    return new Response(JSON.stringify({ error: "Missing tenant id" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceSupabase();
  const { data: tenant, error: fetchErr } = await supabase
    .from("tenant_registry")
    .select("id, slug, tenant_kind")
    .eq("id", tenantId)
    .single();

  if (fetchErr || !tenant) {
    return new Response(JSON.stringify({ error: "Tenant not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  if (tenant.tenant_kind === "template") {
    return new Response(
      JSON.stringify({
        error:
          "Demo template tenants cannot be deleted here. Set tenant_kind to client in Supabase first only if you intend to remove the template.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const warnings: string[] = [];
  const netlifyToken = import.meta.env.NETLIFY_AUTH_TOKEN as string | undefined;
  const siteId = import.meta.env.NETLIFY_SITE_ID as string | undefined;
  const domainSuffix = import.meta.env.TENANT_DOMAIN_SUFFIX || "masjidweb.com";

  if (netlifyToken && siteId && tenant.slug) {
    try {
      await removeDomainAlias(netlifyToken, siteId, `${tenant.slug}.${domainSuffix}`);
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }

  await deleteTenantScopedData(supabase, tenantId, warnings);

  const { error: deleteErr } = await supabase
    .from("tenant_registry")
    .delete()
    .eq("id", tenantId);

  if (deleteErr) {
    return new Response(JSON.stringify({ error: deleteErr.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, warnings: warnings.length ? warnings : undefined }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
