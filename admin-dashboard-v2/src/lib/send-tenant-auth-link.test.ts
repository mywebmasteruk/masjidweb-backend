import { describe, expect, it } from "vitest";
import { buildTenantAuthRedirectUrls } from "./send-tenant-auth-link";

describe("buildTenantAuthRedirectUrls", () => {
  it("routes invite and magic auth links to a client page that can read URL fragments", () => {
    expect(buildTenantAuthRedirectUrls("https://test1000.masjidweb.com")).toEqual({
      invite: "https://test1000.masjidweb.com/ycode/accept-invite",
      magicLink: "https://test1000.masjidweb.com/ycode/accept-invite",
    });
  });
});
