/**
 * Run CMS demo reseed locally (no Netlify function timeout).
 * Usage:
 *   npx tsx scripts/reseed-cms-cli.ts --slug=my-tenant-slug
 *   npx tsx scripts/reseed-cms-cli.ts --all
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (e.g. from `netlify env:get`).
 */

import { getServiceSupabase } from "../src/lib/supabase-server";
import { reseedTenantCmsDemo } from "../src/lib/ycode-cms-seed";
import { triggerPostProvisionPublish } from "../src/lib/provision-publish";
import { patchNullTenantIds } from "../src/lib/provision-tenant-patch";

function domainSuffix(): string {
  return process.env.TENANT_DOMAIN_SUFFIX || "masjidweb.com";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const slugArg = args.find((a) => a.startsWith("--slug="))?.split("=")[1];
  const all = args.includes("--all");

  if (!slugArg && !all) {
    console.error('Usage: --slug=tenant-slug | --all');
    process.exit(1);
  }

  const supabase = getServiceSupabase();
  const warnings: string[] = [];

  let query = supabase
    .from("tenant_registry")
    .select(
      "id, slug, business_name, email, address, phone, domain, description, status, provisioned_from_template_id",
    )
    .eq("tenant_kind", "client")
    .in("status", ["active", "provisioning"]);

  if (slugArg) {
    query = query.eq("slug", slugArg);
  }

  const { data: tenants, error } = await query;
  if (error) throw new Error(error.message);

  const list = tenants ?? [];
  if (!list.length) {
    console.log("No tenants matched.");
    return;
  }

  for (const t of list) {
    const slug = t.slug as string;
    const tenantId = t.id as string;
    process.stdout.write(`Reseeding ${slug}… `);
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
      await triggerPostProvisionPublish(slug, domainSuffix(), warnings);
      await patchNullTenantIds(supabase, tenantId);
      console.log("ok");
    } catch (e) {
      console.log("fail");
      console.error(e);
    }
  }

  if (warnings.length) {
    console.warn("Warnings:", warnings);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
