import type { APIRoute } from "astro";
import { ZodError } from "zod";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getTemplateTenantId } from "../../../lib/master-tenant-constants";
import {
  createOrgFieldMapping,
  deleteOrgFieldMapping,
  listOrgFieldMappings,
  listTemplateCollectionFields,
  updateOrgFieldMapping,
} from "../../../lib/org-field-mappings";

const json = { "Content-Type": "application/json" } as const;

function errorResponse(error: unknown, status: number): Response {
  const message =
    error instanceof ZodError
      ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : error instanceof Error
        ? error.message
        : String(error);
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: json });
}

export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: json });
  }
  try {
    const { mappings, source } = await listOrgFieldMappings();
    const collectionNames = [...new Set(["org", ...mappings.map((m) => m.collection_name)])];
    const templateFields = await listTemplateCollectionFields(getTemplateTenantId(), collectionNames);
    return new Response(JSON.stringify({ ok: true, mappings, source, templateFields }), { headers: json });
  } catch (error) {
    return errorResponse(error, 500);
  }
};

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: json });
  }
  try {
    const mapping = await createOrgFieldMapping(await context.request.json());
    return new Response(JSON.stringify({ ok: true, mapping }), { headers: json });
  } catch (error) {
    return errorResponse(error, 400);
  }
};

export const PATCH: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: json });
  }
  try {
    const body = (await context.request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return errorResponse(new Error("Missing mapping id"), 400);
    const { id: _id, ...patch } = body;
    const mapping = await updateOrgFieldMapping(id, patch);
    return new Response(JSON.stringify({ ok: true, mapping }), { headers: json });
  } catch (error) {
    return errorResponse(error, 400);
  }
};

export const DELETE: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: json });
  }
  try {
    const id = new URL(context.request.url).searchParams.get("id") ?? "";
    if (!id) return errorResponse(new Error("Missing mapping id"), 400);
    await deleteOrgFieldMapping(id);
    return new Response(JSON.stringify({ ok: true }), { headers: json });
  } catch (error) {
    return errorResponse(error, 400);
  }
};
