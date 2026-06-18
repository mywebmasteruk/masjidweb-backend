import { describe, expect, it } from "vitest";
import { normalizeAiProviderSettingsInput } from "./ai-provider-settings";

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
});
