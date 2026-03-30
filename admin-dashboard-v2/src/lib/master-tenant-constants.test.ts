import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TEMPLATE_TENANT_ID,
  getTemplateTenantId,
} from "./master-tenant-constants";

describe("master-tenant-constants", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes canonical default template UUID", () => {
    expect(DEFAULT_TEMPLATE_TENANT_ID).toBe(
      "2fff887d-a78e-4256-9116-6e02fe38c614",
    );
  });

  it("getTemplateTenantId uses TEMPLATE_TENANT_ID from process.env when set", () => {
    vi.stubEnv(
      "TEMPLATE_TENANT_ID",
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    expect(getTemplateTenantId()).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("getTemplateTenantId falls back to default when env unset", () => {
    expect(getTemplateTenantId()).toBe(DEFAULT_TEMPLATE_TENANT_ID);
  });
});
