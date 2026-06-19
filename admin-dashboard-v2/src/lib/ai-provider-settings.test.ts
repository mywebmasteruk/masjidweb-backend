import { describe, expect, it } from "vitest";
import { isValidOpenRouterModelId, normalizeAiProviderSettingsInput } from "./ai-provider-settings";

describe("normalizeAiProviderSettingsInput", () => {
  it("normalizes OpenRouter settings and clamps numeric fields", () => {
    const input = normalizeAiProviderSettingsInput({
      enabled: true,
      provider: "openrouter",
      model: " anthropic/frontier ",
      reasoningEffort: "high",
      temperature: 9,
      maxOutputTokens: 999999,
      requestTimeoutMs: 1,
      apiKey: " sk-or-secret ",
    });

    expect(input).toMatchObject({
      enabled: true,
      provider: "openrouter",
      modelSelectionMode: "manual",
      model: "anthropic/frontier",
      reasoningEffort: "high",
      temperature: 2,
      maxOutputTokens: 100000,
      requestTimeoutMs: 10000,
      apiKey: "sk-or-secret",
    });
  });

  it("falls back to safe defaults for unknown values", () => {
    const input = normalizeAiProviderSettingsInput({
      provider: "bad",
      model: "Anthropic: Claude Fable Latest",
      reasoningEffort: "maximum",
      temperature: "not-a-number",
      maxOutputTokens: 0,
      requestTimeoutMs: 900000,
      removeApiKey: true,
    });

    expect(input).toMatchObject({
      enabled: false,
      provider: "none",
      reasoningEffort: "medium",
      temperature: 0.1,
      maxOutputTokens: 1000,
      requestTimeoutMs: 300000,
      apiKey: null,
      removeApiKey: true,
    });
  });

  it("rejects OpenRouter display names when the provider is enabled", () => {
    expect(() =>
      normalizeAiProviderSettingsInput({
        enabled: true,
        provider: "openrouter",
        model: "Anthropic: Claude Fable Latest",
      }),
    ).toThrow("OpenRouter model must be a model ID");
  });

  it("recognizes OpenRouter model IDs", () => {
    expect(isValidOpenRouterModelId("anthropic/claude-opus-4.1")).toBe(true);
    expect(isValidOpenRouterModelId("google/gemini-2.5-pro")).toBe(true);
    expect(isValidOpenRouterModelId("Anthropic: Claude Fable Latest")).toBe(false);
  });
});
