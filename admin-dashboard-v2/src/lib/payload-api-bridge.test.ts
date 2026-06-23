import { describe, expect, it } from "vitest";
import { corsHeadersForRequest, resolveCorsOrigin } from "./api-cors";
import { isPayloadServiceAuthorized } from "./payload-service-auth";

describe("isPayloadServiceAuthorized", () => {
  it("rejects when secret is missing or too short", () => {
    const prev = process.env.PAYLOAD_SERVICE_SECRET;
    process.env.PAYLOAD_SERVICE_SECRET = "short";
    expect(
      isPayloadServiceAuthorized(
        new Request("https://admin.example.com/api/readiness", {
          headers: { "x-payload-service-secret": "short" },
        }),
      ),
    ).toBe(false);
    process.env.PAYLOAD_SERVICE_SECRET = prev;
  });

  it("accepts matching service secret", () => {
    const secret = "test-payload-service-secret-123456";
    const prev = process.env.PAYLOAD_SERVICE_SECRET;
    process.env.PAYLOAD_SERVICE_SECRET = secret;
    expect(
      isPayloadServiceAuthorized(
        new Request("https://admin.example.com/api/readiness", {
          headers: { "x-payload-service-secret": secret },
        }),
      ),
    ).toBe(true);
    process.env.PAYLOAD_SERVICE_SECRET = prev;
  });
});

describe("api-cors", () => {
  it("allows manage origin from default list", () => {
    const request = new Request("https://admin.example.com/api/readiness", {
      headers: { origin: "https://manage.masjidweb.com" },
    });
    expect(resolveCorsOrigin(request)).toBe("https://manage.masjidweb.com");
    expect(corsHeadersForRequest(request)["Access-Control-Allow-Origin"]).toBe(
      "https://manage.masjidweb.com",
    );
  });

  it("rejects unknown origins", () => {
    const request = new Request("https://admin.example.com/api/readiness", {
      headers: { origin: "https://evil.example.com" },
    });
    expect(resolveCorsOrigin(request)).toBeNull();
    expect(corsHeadersForRequest(request)).toEqual({});
  });
});
