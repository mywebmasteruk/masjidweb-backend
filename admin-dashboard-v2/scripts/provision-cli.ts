/**
 * Full tenant provision (phase 1 + 2) for local/ops use — same as dashboard + complete.
 *
 * Usage:
 *   node --env-file=.env.provision.local --import tsx scripts/provision-cli.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID,
 *   TENANT_DOMAIN_SUFFIX (optional), PROVISIONING_WEBHOOK_SECRET, YCODE_SITE_INTERNAL_URL (optional).
 */

import {
  completeProvision,
  publishTenantAfterProvision,
  startProvision,
} from "../src/lib/provision-pipeline";

const payload = {
  business_name: "Tenant Test 3",
  email: "tenanttest3@masjidweb.com",
  slug: "tenanttest3",
  source_template_tenant_id: "2fff887d-a78e-4256-9116-6e02fe38c614",
};

async function main(): Promise<void> {
  const p1 = await startProvision(payload, "provision-cli");
  console.log("Phase 1:", JSON.stringify(p1, null, 2));
  const p2 = await completeProvision(p1.tenantId, "provision-cli");
  console.log("Phase 2 warnings:", JSON.stringify(p2.warnings, null, 2));
  const p2b = await publishTenantAfterProvision(p1.tenantId, "provision-cli");
  console.log("Publish step warnings:", JSON.stringify(p2b.warnings, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
