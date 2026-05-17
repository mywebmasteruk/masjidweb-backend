import { describe, expect, it } from "vitest";
import { isDashboardAllowedHost } from "./admin-host-allowlist";

describe("isDashboardAllowedHost", () => {
  const suffix = "masjidweb.com";

  it("allows admin subdomain", () => {
    expect(isDashboardAllowedHost("admin.masjidweb.com", suffix)).toBe(true);
    expect(isDashboardAllowedHost("admin.masjidweb.com:443", suffix)).toBe(true);
  });

  it("allows Netlify deploy hosts", () => {
    expect(
      isDashboardAllowedHost("main--masjidweb-admin-v2.netlify.app", suffix),
    ).toBe(true);
    expect(isDashboardAllowedHost("masjidweb-admin-v2.netlify.app", suffix)).toBe(
      true,
    );
  });

  it("allows localhost", () => {
    expect(isDashboardAllowedHost("localhost:4321", suffix)).toBe(true);
    expect(isDashboardAllowedHost("127.0.0.1:8080", suffix)).toBe(true);
  });

  it("rejects tenant-style subdomains", () => {
    expect(isDashboardAllowedHost("masjidemo1.masjidweb.com", suffix)).toBe(false);
    expect(isDashboardAllowedHost("foo-bar.masjidweb.com", suffix)).toBe(false);
  });

  it("rejects missing host headers", () => {
    expect(isDashboardAllowedHost(null, suffix)).toBe(false);
    expect(isDashboardAllowedHost("", suffix)).toBe(false);
  });
});
