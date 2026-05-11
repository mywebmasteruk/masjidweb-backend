import { describe, it, expect } from "vitest";
import { createTenantSchema } from "./tenant-schema";

const validBase = {
  business_name: "Test Mosque",
  email: "admin@example.com",
  source_template_tenant_id: "550e8400-e29b-41d4-a716-446655440000",
};

describe("createTenantSchema", () => {
  it("accepts minimal valid payload", () => {
    const r = createTenantSchema.safeParse(validBase);
    expect(r.success).toBe(true);
  });

  it("rejects empty business_name", () => {
    const r = createTenantSchema.safeParse({ ...validBase, business_name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const r = createTenantSchema.safeParse({ ...validBase, email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid slug format", () => {
    const r = createTenantSchema.safeParse({ ...validBase, slug: "Bad_Slug" });
    expect(r.success).toBe(false);
  });

  it("accepts valid slug", () => {
    const r = createTenantSchema.safeParse({ ...validBase, slug: "my-masjid" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.slug).toBe("my-masjid");
  });

  it("treats empty slug as undefined (derived server-side)", () => {
    const r = createTenantSchema.safeParse({ ...validBase, slug: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.slug).toBeUndefined();
  });
});
