import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isAuthorized } from "../../lib/auth-helpers";
import { getServiceSupabase } from "../../lib/supabase-server";
import { removeDomainAlias } from "../../lib/netlify-domains";

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

const TENANT_CONTENT_TABLES = [
  "collection_item_values",
  "collection_items",
  "collection_fields",
  "collections",
  "page_layers",
  "pages",
  "page_folders",
  "components",
  "layer_styles",
  "assets",
  "asset_folders",
  "fonts",
  "locales",
  "translations",
  "settings",
  "color_variables",
  "versions",
  "webhooks",
  "webhook_deliveries",
  "form_submissions",
  "api_keys",
  "mcp_tokens",
  "tenant_homepage_content",
] as const;

async function deleteTenantData(
  supabase: SupabaseClient,
  tenantId: string,
  warnings: string[],
): Promise<void> {
  for (const table of TENANT_CONTENT_TABLES) {
    const { error } = await supabase.from(table).delete().eq("tenant_id", tenantId);
    if (error && !error.message.includes("does not exist")) {
      warnings.push(`Failed to clean ${table}: ${error.message}`);
    }
  }

  try {
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const tenantUsers = (users?.users ?? []).filter(
      (u) => u.user_metadata?.tenant_id === tenantId,
    );
    for (const u of tenantUsers) {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) warnings.push(`Failed to delete auth user ${u.email}: ${error.message}`);
    }
  } catch (e) {
    warnings.push(`Auth user cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }
}

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

  await deleteTenantData(supabase, tenantId, warnings);

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
