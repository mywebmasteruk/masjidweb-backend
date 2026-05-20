/** Guidance / copy-prompt fallback only; automated repair uses GitHub Actions + opus default. */
export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4";

/** Frontier model for automated safe-update repair (builder repo workflow + OPENROUTER_MODEL). */
export const DEFAULT_AI_REPAIR_MODEL = "anthropic/claude-opus-4";

export type OpenRouterChatOptions = {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens?: number;
  referer?: string;
  title?: string;
};

export type OpenRouterChatResult = {
  reply: string;
  model: string;
};

export async function requestOpenRouterChat(
  options: OpenRouterChatOptions,
): Promise<OpenRouterChatResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": options.referer ?? "https://admin.masjidweb.com",
      "X-Title": options.title ?? "MasjidWeb Admin",
    },
    body: JSON.stringify({
      model: options.model,
      messages: [{ role: "user", content: options.prompt }],
      max_tokens: options.maxTokens ?? 4096,
    }),
  });

  const raw = await res.text();
  let parsed: {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
    model?: string;
  } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error(
      res.ok ? "OpenRouter returned invalid JSON" : `OpenRouter error (${res.status})`,
    );
  }

  if (!res.ok) {
    const message =
      parsed.error?.message ||
      (raw.trim().slice(0, 200) || `OpenRouter request failed (${res.status})`);
    throw new Error(message);
  }

  const reply = parsed.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("OpenRouter returned an empty response");
  }

  return {
    reply,
    model: parsed.model ?? options.model,
  };
}
