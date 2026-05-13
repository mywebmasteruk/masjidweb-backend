import { describe, expect, it, vi } from "vitest";
import { assertNoPartialCloneResidue } from "./provision-pipeline";

function createCountSupabaseMock(counts: Record<string, number>) {
  return {
    from: vi.fn((table: string) => {
      const result = { count: counts[table] ?? 0, error: null };
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue(result),
        then: vi.fn((resolve) => Promise.resolve(resolve(result))),
      };
      return query;
    }),
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

  it("checks non-versioned clone tables without draft/deleted filters", async () => {
    const supabase = createCountSupabaseMock({ color_variables: 1, settings: 2 });

    await expect(
      assertNoPartialCloneResidue(supabase as never, "tenant-1"),
    ).rejects.toThrow(
      "Partial clone residue found without clone_complete checkpoint: color_variables=1, settings=2",
    );

    const calls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls;
    const colorVariablesCallIndex = calls.findIndex(([table]) => table === "color_variables");
    const settingsCallIndex = calls.findIndex(([table]) => table === "settings");
    const colorVariablesQuery = (supabase.from as ReturnType<typeof vi.fn>).mock.results[
      colorVariablesCallIndex
    ]?.value;
    const settingsQuery = (supabase.from as ReturnType<typeof vi.fn>).mock.results[
      settingsCallIndex
    ]?.value;

    expect(colorVariablesQuery.is).not.toHaveBeenCalled();
    expect(settingsQuery.is).not.toHaveBeenCalled();
  });
});
