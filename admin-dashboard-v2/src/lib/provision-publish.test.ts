import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerPostProvisionPublish } from "./provision-publish";

describe("triggerPostProvisionPublish", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, PROVISIONING_WEBHOOK_SECRET: "1234567890123456" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "",
      }),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("POSTs contract JSON body and tenant headers (matches builder publishRequestBodySchema)", async () => {
    delete process.env.YCODE_SITE_INTERNAL_URL;
    const warnings: string[] = [];
    await triggerPostProvisionPublish("demo", "masjidweb.com", warnings);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://demo.masjidweb.com/ycode/api/publish",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ publishAll: true }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Provisioning-Secret": "1234567890123456",
          "X-Tenant-Slug": "demo",
        }),
      }),
    );
    expect(warnings).toHaveLength(0);
  });

  it("uses YCODE_SITE_INTERNAL_URL and sets Host for tenant routing", async () => {
    process.env.YCODE_SITE_INTERNAL_URL = "https://preview.example.netlify.app";
    const warnings: string[] = [];
    await triggerPostProvisionPublish("acme", "masjidweb.com", warnings);

    expect(fetch).toHaveBeenCalledWith(
      "https://preview.example.netlify.app/ycode/api/publish",
      expect.objectContaining({
        headers: expect.objectContaining({
          Host: "acme.masjidweb.com",
          "X-Tenant-Slug": "acme",
        }),
      }),
    );
    expect(warnings).toHaveLength(0);
  });

  it("skips when secret missing", async () => {
    delete process.env.PROVISIONING_WEBHOOK_SECRET;
    const warnings: string[] = [];
    await triggerPostProvisionPublish("demo", "masjidweb.com", warnings);
    expect(fetch).not.toHaveBeenCalled();
    expect(warnings.some((w) => w.includes("PROVISIONING_WEBHOOK_SECRET"))).toBe(
      true,
    );
  });
});
