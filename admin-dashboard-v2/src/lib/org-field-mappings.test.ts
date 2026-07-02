import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORG_FIELD_MAPPINGS,
  normalizeOrgFieldMappingInput,
  normalizeOrgFieldMappingPatch,
} from "./org-field-mappings";

describe("normalizeOrgFieldMappingInput", () => {
  it("accepts a valid mapping and defaults collection/enabled", () => {
    const input = normalizeOrgFieldMappingInput({
      source_field: "phone",
      target_field: " tel ",
    });
    expect(input).toEqual({
      collection_name: "org",
      source_field: "phone",
      target_field: "tel",
      enabled: true,
    });
  });

  it("rejects unknown source fields", () => {
    expect(() =>
      normalizeOrgFieldMappingInput({ source_field: "favourite_colour", target_field: "name" }),
    ).toThrow();
  });

  it("rejects empty target fields", () => {
    expect(() =>
      normalizeOrgFieldMappingInput({ source_field: "email", target_field: "  " }),
    ).toThrow();
  });
});

describe("normalizeOrgFieldMappingPatch", () => {
  it("accepts partial updates", () => {
    expect(normalizeOrgFieldMappingPatch({ enabled: false })).toEqual({ enabled: false });
  });

  it("rejects empty patches", () => {
    expect(() => normalizeOrgFieldMappingPatch({})).toThrow(/Nothing to update/);
  });
});

describe("DEFAULT_ORG_FIELD_MAPPINGS", () => {
  it("targets the org collection and covers the core form fields", () => {
    expect(DEFAULT_ORG_FIELD_MAPPINGS.every((m) => m.collection_name === "org")).toBe(true);
    const sources = DEFAULT_ORG_FIELD_MAPPINGS.map((m) => m.source_field);
    for (const required of ["business_name", "slug", "address", "phone", "email", "description"]) {
      expect(sources).toContain(required);
    }
  });
});
