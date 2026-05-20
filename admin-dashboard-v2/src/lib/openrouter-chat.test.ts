import { afterEach, describe, expect, it, vi } from "vitest";
import { requestOpenRouterChat } from "./openrouter-chat";

describe("requestOpenRouterChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns assistant content from OpenRouter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            model: "anthropic/claude-sonnet-4",
            choices: [{ message: { content: "Fix the merge conflict in file X." } }],
          }),
      }),
    );

    const result = await requestOpenRouterChat({
      apiKey: "test-key",
      model: "anthropic/claude-sonnet-4",
      prompt: "Resolve PR conflicts",
    });

    expect(result.reply).toContain("merge conflict");
    expect(result.model).toBe("anthropic/claude-sonnet-4");
  });

  it("throws when OpenRouter responds with an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: "Invalid API key" } }),
      }),
    );

    await expect(
      requestOpenRouterChat({
        apiKey: "bad",
        model: "anthropic/claude-sonnet-4",
        prompt: "test",
      }),
    ).rejects.toThrow("Invalid API key");
  });
});
