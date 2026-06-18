import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import {
  getAiProviderSettings,
  normalizeAiProviderSettingsInput,
  saveAiProviderSettings,
} from "../../../lib/ai-provider-settings";

const json = { "Content-Type": "application/json" } as const;

export const GET: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: json,
    });
  }

  try {
    const settings = await getAiProviderSettings();
    return new Response(JSON.stringify({ ok: true, settings }), { headers: json });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI provider settings";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: json,
    });
  }
};

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: json,
    });
  }

  try {
    const body = (await context.request.json()) as Record<string, unknown>;
    const input = normalizeAiProviderSettingsInput(body);
    const settings = await saveAiProviderSettings(input);
    return new Response(JSON.stringify({ ok: true, settings }), { headers: json });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save AI provider settings";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: json,
    });
  }
};
