/**
 * One-shot: provision two test client tenants (same pipeline as dashboard).
 * Run with required env vars set (see provision-cli.ts).
 */
import {
  completeProvision,
  publishTenantAfterProvision,
  startProvision,
} from "../src/lib/provision-pipeline";

const TEMPLATE = "2fff887d-a78e-4256-9116-6e02fe38c614";

const TENANTS = [
  {
    slug: "ctest01",
    business_name: "Client Test 01",
    email: "ctest01@masjidweb.com",
  },
  {
    slug: "ctest02",
    business_name: "Client Test 02",
    email: "ctest02@masjidweb.com",
  },
] as const;

async function main(): Promise<void> {
  for (const t of TENANTS) {
    const p1 = await startProvision(
      { ...t, source_template_tenant_id: TEMPLATE },
      "provision-two-test-clients",
    );
    console.log("Phase1", t.slug, p1.tenantId, p1.siteUrl);
    const p2 = await completeProvision(p1.tenantId, "provision-two-test-clients");
    console.log("Phase2", t.slug, "warnings", p2.warnings?.length ?? 0);
    const pub = await publishTenantAfterProvision(
      p1.tenantId,
      "provision-two-test-clients",
    );
    console.log("Publish", t.slug, "warnings", pub.warnings?.length ?? 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
