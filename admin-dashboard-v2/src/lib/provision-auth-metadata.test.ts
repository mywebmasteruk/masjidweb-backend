import { describe, expect, it, vi } from "vitest";
import {
  buildProvisionAuthMetadataUpdate,
  updateProvisionAuthMetadataForUser,
} from "./provision-auth-metadata";

describe("buildProvisionAuthMetadataUpdate", () => {
  it("stores tenant assignment in app_metadata and keeps legacy user_metadata for fallback", () => {
    expect(
      buildProvisionAuthMetadataUpdate(
        {
          app_metadata: { provider: "email", role: "admin" },
          user_metadata: { theme: "dark" },
        },
        {
          tenantId: "tenant-1",
          tenantSlug: "al-noor",
          displayName: "Al Noor Masjid",
        },
      ),
    ).toEqual({
      app_metadata: {
        provider: "email",
        role: "admin",
        tenant_id: "tenant-1",
        tenant_slug: "al-noor",
      },
      user_metadata: {
        theme: "dark",
        tenant_id: "tenant-1",
        tenant_slug: "al-noor",
        display_name: "Al Noor Masjid",
      },
    });
  });
});

describe("updateProvisionAuthMetadataForUser", () => {
  it("updates Supabase Auth app_metadata for authorization and user_metadata for legacy fallback", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      auth: {
        admin: {
          updateUserById,
        },
      },
    } as any;

    await updateProvisionAuthMetadataForUser(
      supabase,
      {
        id: "user-1",
        app_metadata: { provider: "email" },
        user_metadata: { invited_at: "2026-05-13T00:00:00.000Z" },
      },
      {
        tenantId: "tenant-1",
        tenantSlug: "al-noor",
        displayName: "Al Noor Masjid",
      },
    );

    expect(updateUserById).toHaveBeenCalledWith("user-1", {
      app_metadata: {
        provider: "email",
        tenant_id: "tenant-1",
        tenant_slug: "al-noor",
      },
      user_metadata: {
        invited_at: "2026-05-13T00:00:00.000Z",
        tenant_id: "tenant-1",
        tenant_slug: "al-noor",
        display_name: "Al Noor Masjid",
      },
    });
  });

  it("throws when Supabase rejects the metadata update", async () => {
    const supabase = {
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({ error: new Error("nope") }),
        },
      },
    } as any;

    await expect(
      updateProvisionAuthMetadataForUser(
        supabase,
        { id: "user-1", app_metadata: {}, user_metadata: {} },
        {
          tenantId: "tenant-1",
          tenantSlug: "al-noor",
          displayName: "Al Noor Masjid",
        },
      ),
    ).rejects.toThrow("Failed to set tenant metadata for auth user: nope");
  });
});
