import { describe, expect, it } from "vitest";
import {
  filterCmsSourceItemsWithContent,
  filterTemplateFieldsToMappedCollections,
} from "./ycode-cms-seed";

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

describe("filterTemplateFieldsToMappedCollections", () => {
  it("drops template fields for stale collections that were not cloned", () => {
    const fields = [
      { id: "tenant-id-live", collection_id: "live-collection" },
      { id: "tenant-id-stale", collection_id: "stale-published-only" },
    ];
    const idMap = new Map([["live-collection", "new-live-collection"]]);

    const result = filterTemplateFieldsToMappedCollections(fields, idMap);

    expect(result).toEqual([{ id: "tenant-id-live", collection_id: "live-collection" }]);
  });

  it("keeps all fields when cloning without an id map", () => {
    const fields = [{ id: "tenant-id", collection_id: "legacy-collection" }];

    expect(filterTemplateFieldsToMappedCollections(fields)).toEqual(fields);
  });
});
