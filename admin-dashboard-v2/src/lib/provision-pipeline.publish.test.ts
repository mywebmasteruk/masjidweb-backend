import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishTenantAfterProvision } from "./provision-pipeline";
import { getServiceSupabase } from "./supabase-server";
import { triggerPostProvisionPublish } from "./provision-publish";
import { patchNullTenantIds } from "./provision-tenant-patch";
import { verifyTenantDemoData } from "./provision-demo-verify";

vi.mock("./supabase-server", () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock("./server-env", () => ({
  readServerEnv: vi.fn((key: string) => {
    if (key === "TENANT_DOMAIN_SUFFIX") return "masjidweb.com";
    return undefined;
  }),
}));

vi.mock("./provision-template-source", () => ({
  resolveSourceTemplateIdForClientTenant: vi.fn().mockResolvedValue("template-1"),
  assertValidSourceTemplate: vi.fn(),
}));

vi.mock("./provision-publish", () => ({
  ProvisionPublishConfigError: class ProvisionPublishConfigError extends Error {},
  triggerPostProvisionPublish: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("./provision-tenant-patch", () => ({
  patchNullTenantIds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./provision-demo-verify", () => ({
  verifyTenantDemoData: vi.fn().mockResolvedValue(undefined),
}));

function createSupabaseMock() {
  const tenantSingle = vi.fn().mockResolvedValue({
    data: { id: "tenant-1", slug: "al-noor", status: "active" },
    error: null,
  });
  const auditInsert = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ data: { published: true }, error: null });

  return {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "tenant_registry") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: tenantSingle,
        };
      }

      if (table === "provisioning_audit_log") {
        return {
          insert: auditInsert,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    tenantSingle,
    auditInsert,
  };
}

describe("publishTenantAfterProvision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the YCode publish webhook even when SQL publish succeeds", async () => {
    const supabase = createSupabaseMock();
    vi.mocked(getServiceSupabase).mockReturnValue(supabase as never);

    await publishTenantAfterProvision("tenant-1", "operator@example.com");

    expect(supabase.rpc).toHaveBeenCalledWith("publish_tenant_drafts", {
      p_tenant_id: "tenant-1",
    });
    expect(triggerPostProvisionPublish).toHaveBeenCalledWith(
      "al-noor",
      "masjidweb.com",
      expect.any(Array),
    );
    expect(patchNullTenantIds).toHaveBeenCalledWith(supabase, "tenant-1");
    expect(verifyTenantDemoData).toHaveBeenCalledWith(
      supabase,
      "tenant-1",
      expect.any(Array),
      "template-1",
      { skipPublishedCollectionCheck: false },
    );
  });
});
