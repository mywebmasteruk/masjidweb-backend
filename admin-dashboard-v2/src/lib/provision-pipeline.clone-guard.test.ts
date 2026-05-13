import { describe, expect, it, vi } from "vitest";
import { assertNoPartialCloneResidue } from "./provision-pipeline";

function createCountSupabaseMock(counts: Record<string, number>) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: counts[table] ?? 0, error: null }),
    })),
  };
}

describe("assertNoPartialCloneResidue", () => {
  it("allows a clean tenant before first clone", async () => {
    const supabase = createCountSupabaseMock({});

    await expect(
      assertNoPartialCloneResidue(supabase as never, "tenant-1"),
    ).resolves.toBeUndefined();
  });

  it("fails visibly when any clone-owned draft content exists without a clone checkpoint", async () => {
    const supabase = createCountSupabaseMock({ asset_folders: 1, pages: 1, page_layers: 2 });

    await expect(
      assertNoPartialCloneResidue(supabase as never, "tenant-1"),
    ).rejects.toThrow(
      "Partial clone residue found without clone_complete checkpoint: asset_folders=1, pages=1, page_layers=2",
    );
  });
});
