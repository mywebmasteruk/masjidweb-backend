import { describe, expect, it } from "vitest";
import { effectiveAuthUserMetadataForCleanup } from "./tenant-delete-data";

describe("effectiveAuthUserMetadataForCleanup", () => {
  it("does not let user-editable metadata override app_metadata tenant assignment", () => {
    expect(
      effectiveAuthUserMetadataForCleanup({
        id: "user-1",
        app_metadata: {
          tenant_id: "11111111-1111-1111-1111-111111111111",
          tenant_slug: "trusted-slug",
        },
        user_metadata: {
          tenant_id: "22222222-2222-2222-2222-222222222222",
          tenant_slug: "attacker-slug",
          invited_at: "2026-05-13T00:00:00.000Z",
        },
      } as any),
    ).toEqual({
      tenant_id: "11111111-1111-1111-1111-111111111111",
      tenant_slug: "trusted-slug",
      invited_at: "2026-05-13T00:00:00.000Z",
    });
  });
});
