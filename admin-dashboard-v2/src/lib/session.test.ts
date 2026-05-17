import { describe, expect, it } from "vitest";
import { clearSessionCookie, getSessionCookieName, parseCookies, serializeSessionCookie } from "./session";

describe("session cookies", () => {
  it("serializes admin sessions with HttpOnly and SameSite=Lax", () => {
    const cookie = serializeSessionCookie("token value");

    expect(cookie).toContain(`${getSessionCookieName()}=token%20value`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=28800");
  });

  it("clears admin sessions with the same security attributes", () => {
    const cookie = clearSessionCookie();

    expect(cookie).toContain(`${getSessionCookieName()}=`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=0");
  });

  it("parses encoded cookie values", () => {
    expect(parseCookies("admin_session_v2=token%20value; theme=light")).toEqual({
      admin_session_v2: "token value",
      theme: "light",
    });
  });
});
