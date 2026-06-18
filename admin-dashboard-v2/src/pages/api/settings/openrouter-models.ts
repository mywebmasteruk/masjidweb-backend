import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import { getSavedOpenRouterApiKey } from "../../../lib/ai-provider-settings";

const json = { "Content-Type": "application/json" } as const;

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
};

function summarizeModel(model: OpenRouterModel): { id: string; name: string; contextLength: number | null } {
  return {
    id: model.id,
    name: model.name || model.id,
    contextLength: typeof model.context_length === "number" ? model.context_length : null,
  };
}

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: json,
    });
  }

  let providedKey = "";
  try {
    const body = (await context.request.json().catch(() => ({}))) as { apiKey?: unknown };
    providedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  } catch {
    providedKey = "";
  }

  try {
    const savedKey = providedKey ? null : await getSavedOpenRouterApiKey();
    const apiKey = providedKey || savedKey || process.env["OPENROUTER_API_KEY"]?.trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Enter an OpenRouter API key or save one first." }),
        { status: 400, headers: json },
      );
    }

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env["OPENROUTER_SITE_URL"]?.trim() || "https://admin.masjidweb.com",
        "X-Title": process.env["OPENROUTER_APP_NAME"]?.trim() || "MasjidWeb Admin",
      },
    });
    const raw = await res.text();
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `OpenRouter models request failed: ${res.status}` }),
        { status: 502, headers: json },
      );
    }
    const parsed = JSON.parse(raw) as { data?: OpenRouterModel[] };
    const models = (parsed.data ?? [])
      .filter((model) => typeof model.id === "string" && model.id.trim())
      .map(summarizeModel)
      .sort((a, b) => a.id.localeCompare(b.id));
    return new Response(JSON.stringify({ ok: true, models }), { headers: json });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch OpenRouter models";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 502,
      headers: json,
    });
  }
};
