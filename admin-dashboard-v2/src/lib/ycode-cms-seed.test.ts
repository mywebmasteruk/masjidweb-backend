import { describe, expect, it } from "vitest";
import { filterCmsSourceItemsWithContent } from "./ycode-cms-seed";

describe("filterCmsSourceItemsWithContent", () => {
  it("drops items that only have tenant/system values and no display content", () => {
    const items = [
      { id: "empty-shell" },
      { id: "real-announcement" },
    ];
    const valuesByItem = new Map([
      [
        "empty-shell",
        [
          { field_id: "tenant-field", value: "tenant-1" },
          { field_id: "slug-field", value: "masjid" },
          { field_id: "status-field", value: "Published" },
          { field_id: "id-field", value: "-" },
        ],
      ],
      [
        "real-announcement",
        [
          { field_id: "tenant-field", value: "tenant-1" },
          { field_id: "name-field", value: "Welcome — new to the centre?" },
        ],
      ],
    ]);
    const fieldKeyById = new Map([
      ["tenant-field", "tenant_id"],
      ["slug-field", "tenant_slug"],
      ["status-field", "status"],
      ["id-field", "id"],
      ["name-field", "name"],
    ]);

    const result = filterCmsSourceItemsWithContent(items, valuesByItem, fieldKeyById);

    expect(result.map((item) => item.id)).toEqual(["real-announcement"]);
  });
});
