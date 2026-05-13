import { describe, expect, it } from "vitest";
import {
  jsonPayloadWeight,
  filterTemplateCollectionFieldsToCanonicalCollections,
  pickCanonicalTemplateCollectionRows,
  pickNewerTemplateRow,
  pickRicherLayersTemplateRow,
} from "./ycode-template-clone";

describe("pickRicherLayersTemplateRow", () => {
  it("prefers published when draft is nearly empty but published has real content", () => {
    const draft = {
      id: "x",
      layers: [],
      updated_at: "2026-04-04T20:00:00.000Z",
      is_published: false,
    };
    const published = {
      id: "x",
      layers: [{ id: "body", name: "body", children: Array(20).fill({ x: 1 }) }],
      updated_at: "2026-01-01T10:00:00.000Z",
      is_published: true,
    };
    const out = pickRicherLayersTemplateRow(draft, published);
    expect(out).toBe(published);
  });

  it("uses newer row when both payloads are similarly small", () => {
    const older = {
      id: "x",
      layers: [{ a: 1 }],
      updated_at: "2026-01-01T10:00:00.000Z",
      is_published: false,
    };
    const newer = {
      id: "x",
      layers: [{ b: 2 }],
      updated_at: "2026-04-04T20:00:00.000Z",
      is_published: true,
    };
    const out = pickRicherLayersTemplateRow(older, newer);
    expect(out).toBe(newer);
  });

  it("delegates to single-sided pickNewerTemplateRow", () => {
    const only = { id: "x", layers: [1], is_published: false };
    expect(pickRicherLayersTemplateRow(only, undefined)).toEqual(only);
    expect(pickRicherLayersTemplateRow(undefined, only)).toEqual(only);
  });
});

describe("jsonPayloadWeight", () => {
  it("returns 0 when JSON.stringify throws (circular)", () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(jsonPayloadWeight(o)).toBe(0);
  });
});

describe("pickCanonicalTemplateCollectionRows", () => {
  it("keeps only draft-backed collections when the template has visible draft collections", () => {
    const draft = [
      { id: "bookings", name: "Bookings", is_published: false },
    ];
    const published = [
      { id: "bookings", name: "Bookings", is_published: true },
      { id: "announcements-stale", name: "Announcements", is_published: true },
    ];

    const result = pickCanonicalTemplateCollectionRows(draft, published);

    expect(result.canonicalRows.map((row) => row.id)).toEqual(["bookings"]);
    expect(result.templateCollIdToCanonical.get("announcements-stale")).toBeUndefined();
  });
});

describe("filterTemplateCollectionFieldsToCanonicalCollections", () => {
  it("drops fields for skipped published-only collections", () => {
    const fields = [
      { id: "bookings-name", collection_id: "bookings" },
      { id: "announcements-title", collection_id: "announcements-stale" },
      { id: "global", collection_id: null },
    ];
    const aliases = new Map([["bookings", "bookings"]]);

    const result = filterTemplateCollectionFieldsToCanonicalCollections(fields, aliases);

    expect(result.map((row) => row.id)).toEqual(["bookings-name", "global"]);
  });

  it("drops reference fields that point at skipped published-only collections", () => {
    const fields = [
      {
        id: "bookings-reference",
        collection_id: "bookings",
        reference_collection_id: "announcements-stale",
      },
      {
        id: "bookings-valid-reference",
        collection_id: "bookings",
        reference_collection_id: "speakers",
      },
    ];
    const aliases = new Map([
      ["bookings", "bookings"],
      ["speakers", "speakers"],
    ]);

    const result = filterTemplateCollectionFieldsToCanonicalCollections(fields, aliases);

    expect(result.map((row) => row.id)).toEqual(["bookings-valid-reference"]);
  });
});
