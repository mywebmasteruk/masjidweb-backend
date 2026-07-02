import { describe, expect, it } from "vitest";
import { DEFAULT_ORG_FIELD_MAPPINGS } from "./org-field-mappings";
import {
  filterCmsSourceItemsWithContent,
  filterTemplateFieldsToMappedCollections,
  resolveOrgFieldOverrides,
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

describe("resolveOrgFieldOverrides", () => {
  // Mirrors the live template's org collection: system fields carry a key,
  // custom fields have key null and are identified by display name (with
  // the "addresss" typo).
  const templateOrgFields = [
    { id: "sys-name", key: "name", name: "Name" },
    { id: "sys-slug", key: "slug", name: "Slug" },
    { id: "sys-status", key: "status", name: "Status" },
    { id: "custom-name", key: null, name: "name" },
    { id: "custom-address", key: null, name: "addresss" },
    { id: "custom-tel", key: null, name: "tel" },
    { id: "custom-email", key: null, name: "email" },
    { id: "custom-description", key: null, name: "description" },
    { id: "custom-photo", key: null, name: "photo" },
  ];

  const defaultMappings = DEFAULT_ORG_FIELD_MAPPINGS;

  it("maps provisioning org info onto system and custom org fields", () => {
    const overrides = resolveOrgFieldOverrides(templateOrgFields, defaultMappings, "greenlane", {
      slug: "greenlane",
      business_name: "Green Lane Masjid",
      address: "20 Green Lane, Birmingham",
      phone: "+44 121 000 0000",
      email: "admin@greenlane.example",
      description: "Community masjid in Small Heath",
    });

    expect(Object.fromEntries(overrides)).toEqual({
      "sys-name": "Green Lane Masjid",
      "sys-slug": "greenlane",
      "custom-name": "Green Lane Masjid",
      "custom-address": "20 Green Lane, Birmingham",
      "custom-tel": "+44 121 000 0000",
      "custom-email": "admin@greenlane.example",
      "custom-description": "Community masjid in Small Heath",
    });
  });

  it("skips blank inputs so cloned demo values remain as placeholders", () => {
    const overrides = resolveOrgFieldOverrides(templateOrgFields, defaultMappings, "greenlane", {
      slug: "greenlane",
      business_name: "Green Lane Masjid",
      address: "  ",
      email: "admin@greenlane.example",
    });

    const fieldIds = overrides.map(([fieldId]) => fieldId);
    expect(fieldIds).not.toContain("custom-address");
    expect(fieldIds).not.toContain("custom-tel");
    expect(fieldIds).not.toContain("custom-description");
    expect(fieldIds).toContain("custom-email");
  });

  it("ignores disabled mappings and mappings with no matching field", () => {
    const mappings = [
      { source_field: "phone", target_field: "tel", enabled: false },
      { source_field: "email", target_field: "no-such-field", enabled: true },
      { source_field: "address", target_field: "addresss", enabled: true },
    ];

    const overrides = resolveOrgFieldOverrides(templateOrgFields, mappings, "greenlane", {
      slug: "greenlane",
      business_name: "Green Lane Masjid",
      address: "20 Green Lane",
      phone: "0121",
      email: "admin@greenlane.example",
    });

    expect(Object.fromEntries(overrides)).toEqual({
      "custom-address": "20 Green Lane",
    });
  });

  it("matches renamed fields when the admin updates the mapping (typo fixed)", () => {
    const fields = [
      { id: "custom-address", key: null, name: "Address" },
      { id: "custom-phone", key: null, name: "Phone" },
    ];
    const mappings = [
      { source_field: "address", target_field: "address", enabled: true },
      { source_field: "phone", target_field: "phone", enabled: true },
    ];

    const overrides = resolveOrgFieldOverrides(fields, mappings, "greenlane", {
      slug: "greenlane",
      business_name: "Green Lane Masjid",
      address: "20 Green Lane",
      phone: "0121",
    });

    expect(Object.fromEntries(overrides)).toEqual({
      "custom-address": "20 Green Lane",
      "custom-phone": "0121",
    });
  });
});
