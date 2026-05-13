/**
 * One-off: provision a client tenant with a random slug, full pipeline + publish.
 * Run from admin-dashboard-v2 with provisioning env set.
 *
 *   cp .env.example .env   # fill SUPABASE_*, NETLIFY_*, PROVISIONING_WEBHOOK_SECRET, etc.
 *   npm run provision:test
 *
 * Or inject Netlify env, then: npx tsx scripts/provision-test-tenant.ts
 */

import { randomBytes } from "node:crypto";
import { getServiceSupabase } from "../src/lib/supabase-server";
import {
  completeProvision,
  publishTenantAfterProvision,
  startProvision,
} from "../src/lib/provision-pipeline";

const suffix = randomBytes(4).toString("hex");
const slug = `cloneverify-${suffix}`;
const templateId =
  process.env.TEMPLATE_TENANT_ID ?? "2fff887d-a78e-4256-9116-6e02fe38c614";

const payload = {
  business_name: `Clone verify ${suffix}`,
  email: `${slug}@masjidweb.com`,
  slug,
  source_template_tenant_id: templateId,
};

async function getTenantStatus(tenantId: string): Promise<string> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("tenant_registry")
    .select("status")
    .eq("id", tenantId)
    .single();
  if (error || !data?.status) {
    throw new Error(`Could not read tenant status: ${error?.message ?? "missing status"}`);
  }
  return String(data.status);
}

async function main(): Promise<void> {
  console.log("Provisioning slug:", slug);
  const p1 = await startProvision(payload, "provision-test-tenant");
  console.log("Phase 1:", JSON.stringify({ ...p1, warnings: p1.warnings }, null, 2));

  for (let pass = 1; pass <= 4; pass += 1) {
    const status = await getTenantStatus(p1.tenantId);
    if (status === "active") break;
    if (status !== "provisioning") {
      throw new Error(`Provisioning stopped in unexpected status: ${status}`);
    }

    const p2 = await completeProvision(p1.tenantId, "provision-test-tenant");
    console.log(
      `Phase 2 pass ${pass} warnings:`,
      JSON.stringify(p2.warnings, null, 2),
    );
  }

  const finalStatus = await getTenantStatus(p1.tenantId);
  if (finalStatus !== "active") {
    throw new Error(`Tenant did not become active after phase 2 passes: ${finalStatus}`);
  }

  const p2b = await publishTenantAfterProvision(p1.tenantId, "provision-test-tenant");
  console.log("Publish warnings:", JSON.stringify(p2b.warnings, null, 2));
  console.log("\nTENANT_ID", p1.tenantId);
  console.log("TENANT_SLUG", p1.slug);
  console.log("VERIFY_URL", p1.siteUrl);
  console.log("BUILDER_URL", `${p1.siteUrl.replace(/\/$/, "")}/ycode`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
