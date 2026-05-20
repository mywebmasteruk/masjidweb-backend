import type { APIRoute } from "astro";
import { isAuthorized } from "../../../lib/auth-helpers";
import {
  DEFAULT_OPENROUTER_MODEL,
  requestOpenRouterChat,
} from "../../../lib/openrouter-chat";
import { readServerEnv } from "../../../lib/server-env";

const MAX_PROMPT_CHARS = 24_000;

export const POST: APIRoute = async (context) => {
  if (!(await isAuthorized(context))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = readServerEnv("OPENROUTER_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "OPENROUTER_API_KEY is not set. Add it in Netlify environment variables for this admin site.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let prompt = "";
  try {
    const body = (await context.request.json()) as { prompt?: string };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!prompt) {
    return new Response(JSON.stringify({ ok: false, error: "prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (prompt.length > MAX_PROMPT_CHARS) {
    return new Response(
      JSON.stringify({ ok: false, error: `prompt exceeds ${MAX_PROMPT_CHARS} characters` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const model = readServerEnv("OPENROUTER_MODEL") || DEFAULT_OPENROUTER_MODEL;

  try {
    const result = await requestOpenRouterChat({
      apiKey,
      model,
      prompt,
      referer: context.url.origin,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        reply: result.reply,
        model: result.model,
        disclaimer:
          "This is guidance only. Apply changes in the repository yourself. Nothing was merged or deployed.",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "OpenRouter request failed";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
