import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTenantAuthRedirectUrls,
  inviteUserByEmailFailedForExistingUser,
  isUserAlreadyRegistered,
  sendTenantAuthLink,
} from "./send-tenant-auth-link";
import { getServiceSupabase } from "./supabase-server";

vi.mock("./supabase-server", () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock("./provision-email", () => ({
  coerceTenantAdminEmailToSuffix: vi.fn((email: string, slug: string) => ({
    email: email || `admin@${slug}.masjidweb.com`,
    coerced: !email,
  })),
}));

vi.mock("./provision-email-policy", () => ({
  normalizeProvisioningEmail: vi.fn((email: string) => email.trim().toLowerCase()),
}));

vi.mock("./provision-auth-metadata", () => ({
  updateProvisionAuthMetadataForUser: vi.fn().mockResolvedValue(undefined),
}));

function createSupabaseMock(authHandlers: {
  inviteUserByEmail?: ReturnType<typeof vi.fn>;
  generateLink?: ReturnType<typeof vi.fn>;
}) {
  const inviteUserByEmail =
    authHandlers.inviteUserByEmail ??
    vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  const generateLink =
    authHandlers.generateLink ??
    vi.fn().mockResolvedValue({
      data: {
        user: { id: "user-1" },
        properties: { action_link: "https://auth.example/invite-link" },
      },
      error: null,
    });

  return {
    auth: {
      admin: {
        inviteUserByEmail,
        generateLink,
      },
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "tenant-1",
          slug: "test1000",
          business_name: "Test Masjid",
          email: "admin@test1000.masjidweb.com",
        },
        error: null,
      }),
    })),
    inviteUserByEmail,
    generateLink,
  };
}

describe("buildTenantAuthRedirectUrls", () => {
  it("routes invite and magic auth links to a client page that can read URL fragments", () => {
    expect(buildTenantAuthRedirectUrls("https://test1000.masjidweb.com")).toEqual({
      invite: "https://test1000.masjidweb.com/ycode/accept-invite",
      magicLink: "https://test1000.masjidweb.com/ycode/accept-invite",
    });
  });
});

describe("isUserAlreadyRegistered", () => {
  it("detects common Supabase already-registered messages", () => {
    expect(isUserAlreadyRegistered(new Error("User already registered"))).toBe(true);
    expect(isUserAlreadyRegistered("email address is already in use")).toBe(true);
    expect(isUserAlreadyRegistered(new Error("network timeout"))).toBe(false);
  });
});

describe("inviteUserByEmailFailedForExistingUser", () => {
  it("includes already-invited cases", () => {
    expect(inviteUserByEmailFailedForExistingUser(new Error("User has already been invited"))).toBe(
      true,
    );
  });
});

describe("sendTenantAuthLink returnLinkOnly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TENANT_DOMAIN_SUFFIX", "masjidweb.com");
  });

  it("returns invite link without sending email when generateLink(invite) succeeds", async () => {
    const supabase = createSupabaseMock({});
    vi.mocked(getServiceSupabase).mockReturnValue(supabase as never);

    const result = await sendTenantAuthLink("tenant-1", { returnLinkOnly: true });

    expect(supabase.inviteUserByEmail).not.toHaveBeenCalled();
    expect(supabase.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "invite",
        email: "admin@test1000.masjidweb.com",
        options: expect.objectContaining({
          redirectTo: "https://test1000.masjidweb.com/ycode/accept-invite",
        }),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      method: "invite",
      linkOnly: true,
      actionLink: "https://auth.example/invite-link",
    });
  });

  it("falls back to magic link when invite generateLink fails", async () => {
    const generateLink = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error("invite unavailable") })
      .mockResolvedValueOnce({
        data: {
          user: { id: "user-1" },
          properties: { action_link: "https://auth.example/magic-link" },
        },
        error: null,
      });
    const supabase = createSupabaseMock({ generateLink });
    vi.mocked(getServiceSupabase).mockReturnValue(supabase as never);

    const result = await sendTenantAuthLink("tenant-1", { returnLinkOnly: true });

    expect(supabase.inviteUserByEmail).not.toHaveBeenCalled();
    expect(generateLink).toHaveBeenCalledTimes(2);
    expect(generateLink).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "magiclink",
        options: expect.objectContaining({
          redirectTo: "https://test1000.masjidweb.com/ycode/accept-invite",
        }),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      method: "magiclink",
      linkOnly: true,
      actionLink: "https://auth.example/magic-link",
    });
  });

  it("still sends invite email by default (no returnLinkOnly)", async () => {
    const supabase = createSupabaseMock({});
    vi.mocked(getServiceSupabase).mockReturnValue(supabase as never);

    const result = await sendTenantAuthLink("tenant-1");

    expect(supabase.inviteUserByEmail).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("linkOnly", true);
  });
});
