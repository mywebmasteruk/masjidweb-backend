import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getServiceSupabase } from "./supabase-server";

export type AiProvider = "none" | "openrouter";
export type ModelSelectionMode = "latest_claude_frontier" | "manual";
export type ReasoningEffort = "low" | "medium" | "high";

export type AiProviderSettingsInput = {
  enabled: boolean;
  provider: AiProvider;
  modelSelectionMode: ModelSelectionMode;
  model: string | null;
  reasoningEffort: ReasoningEffort;
  temperature: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  apiKey?: string | null;
  removeApiKey?: boolean;
};

export type AiProviderSettingsPublic = {
  enabled: boolean;
  provider: AiProvider;
  modelSelectionMode: ModelSelectionMode;
  model: string | null;
  reasoningEffort: ReasoningEffort;
  temperature: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  apiKeySavedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  source: "database" | "defaults";
};

type AiProviderSettingsRow = {
  id: string;
  enabled: boolean;
  provider: AiProvider;
  model_selection_mode: ModelSelectionMode;
  model: string | null;
  reasoning_effort: ReasoningEffort;
  temperature: number;
  max_output_tokens: number;
  request_timeout_ms: number;
  openrouter_api_key_ciphertext: string | null;
  openrouter_api_key_iv: string | null;
  openrouter_api_key_tag: string | null;
  openrouter_api_key_last4: string | null;
  openrouter_api_key_saved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const DEFAULT_MODEL = "anthropic/claude-opus-4.1";
export const LATEST_CLAUDE_FRONTIER_MODEL_SELECTION = "latest_claude_frontier" as const;
const OPENROUTER_MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/;

export function isValidOpenRouterModelId(model: string | null | undefined): boolean {
  return typeof model === "string" && OPENROUTER_MODEL_ID_PATTERN.test(model.trim());
}

export function assertValidOpenRouterModelId(model: string | null | undefined): void {
  if (!isValidOpenRouterModelId(model)) {
    throw new Error(
      "OpenRouter model must be a model ID such as anthropic/claude-opus-4.1, not a display name.",
    );
  }
}

export function parseModelSelectionMode(value: unknown): ModelSelectionMode {
  return value === "manual" ? "manual" : LATEST_CLAUDE_FRONTIER_MODEL_SELECTION;
}

export function workflowOpenRouterModelInput(settings: {
  modelSelectionMode: ModelSelectionMode;
  model: string | null;
}): string {
  if (settings.modelSelectionMode === LATEST_CLAUDE_FRONTIER_MODEL_SELECTION) {
    return LATEST_CLAUDE_FRONTIER_MODEL_SELECTION;
  }
  assertValidOpenRouterModelId(settings.model);
  return settings.model as string;
}

function defaultSettings(): AiProviderSettingsPublic {
  return {
    enabled: false,
    provider: "none",
    modelSelectionMode: LATEST_CLAUDE_FRONTIER_MODEL_SELECTION,
    model: DEFAULT_MODEL,
    reasoningEffort: "medium",
    temperature: 0.1,
    maxOutputTokens: 16000,
    requestTimeoutMs: 120000,
    hasApiKey: false,
    apiKeyLast4: null,
    apiKeySavedAt: null,
    createdAt: null,
    updatedAt: null,
    source: "defaults",
  };
}

function encryptionKey(): Buffer {
  const raw = process.env["ADMIN_AI_SETTINGS_ENCRYPTION_KEY"]?.trim();
  const fallback = process.env["ADMIN_SESSION_SECRET"]?.trim();
  const source = raw && raw.length >= 16 ? raw : fallback;
  if (!source || source.length < 16) {
    throw new Error("ADMIN_AI_SETTINGS_ENCRYPTION_KEY or ADMIN_SESSION_SECRET must be at least 16 characters");
  }
  return createHash("sha256").update(source).digest();
}

function encryptSecret(value: string): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decryptSecret(row: AiProviderSettingsRow): string | null {
  if (!row.openrouter_api_key_ciphertext || !row.openrouter_api_key_iv || !row.openrouter_api_key_tag) {
    return null;
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(row.openrouter_api_key_iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(row.openrouter_api_key_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.openrouter_api_key_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function toPublic(row: AiProviderSettingsRow | null): AiProviderSettingsPublic {
  if (!row) return defaultSettings();
  return {
    enabled: row.enabled,
    provider: row.provider,
    modelSelectionMode: parseModelSelectionMode(row.model_selection_mode),
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    temperature: Number(row.temperature),
    maxOutputTokens: row.max_output_tokens,
    requestTimeoutMs: row.request_timeout_ms,
    hasApiKey: Boolean(row.openrouter_api_key_ciphertext),
    apiKeyLast4: row.openrouter_api_key_last4,
    apiKeySavedAt: row.openrouter_api_key_saved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: "database",
  };
}

function parseProvider(value: unknown): AiProvider {
  return value === "openrouter" ? "openrouter" : "none";
}

function parseReasoningEffort(value: unknown): ReasoningEffort {
  if (value === "low" || value === "high") return value;
  return "medium";
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeAiProviderSettingsInput(body: Record<string, unknown>): AiProviderSettingsInput {
  const provider = parseProvider(body.provider);
  const enabled = body.enabled === true;
  const modelSelectionMode = parseModelSelectionMode(body.modelSelectionMode);
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : null;
  if (enabled && provider === "openrouter" && modelSelectionMode === "manual") {
    assertValidOpenRouterModelId(model);
  }
  return {
    enabled,
    provider,
    modelSelectionMode,
    model,
    reasoningEffort: parseReasoningEffort(body.reasoningEffort),
    temperature: numberInRange(body.temperature, 0.1, 0, 2),
    maxOutputTokens: Math.round(numberInRange(body.maxOutputTokens, 16000, 1000, 100000)),
    requestTimeoutMs: Math.round(numberInRange(body.requestTimeoutMs, 120000, 10000, 300000)),
    apiKey: typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : null,
    removeApiKey: body.removeApiKey === true,
  };
}

export async function getAiProviderSettings(): Promise<AiProviderSettingsPublic> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("admin_ai_provider_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(`Failed to load AI provider settings: ${error.message}`);
  return toPublic((data as AiProviderSettingsRow | null) ?? null);
}

export async function getSavedOpenRouterApiKey(): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("admin_ai_provider_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(`Failed to load saved OpenRouter key: ${error.message}`);
  const row = (data as AiProviderSettingsRow | null) ?? null;
  return row ? decryptSecret(row) : null;
}

export async function saveAiProviderSettings(input: AiProviderSettingsInput): Promise<AiProviderSettingsPublic> {
  const supabase = getServiceSupabase();
  const existing = await getAiProviderSettings();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id: "default",
    enabled: input.enabled,
    provider: input.provider,
    model_selection_mode: input.modelSelectionMode,
    model: input.model,
    reasoning_effort: input.reasoningEffort,
    temperature: input.temperature,
    max_output_tokens: input.maxOutputTokens,
    request_timeout_ms: input.requestTimeoutMs,
    updated_at: now,
  };

  if (existing.source === "defaults") {
    payload.created_at = now;
  }

  if (input.removeApiKey) {
    payload.openrouter_api_key_ciphertext = null;
    payload.openrouter_api_key_iv = null;
    payload.openrouter_api_key_tag = null;
    payload.openrouter_api_key_last4 = null;
    payload.openrouter_api_key_saved_at = null;
  } else if (input.apiKey) {
    const encrypted = encryptSecret(input.apiKey);
    payload.openrouter_api_key_ciphertext = encrypted.ciphertext;
    payload.openrouter_api_key_iv = encrypted.iv;
    payload.openrouter_api_key_tag = encrypted.tag;
    payload.openrouter_api_key_last4 = input.apiKey.slice(-4);
    payload.openrouter_api_key_saved_at = now;
  }

  const { data, error } = await supabase
    .from("admin_ai_provider_settings")
    .upsert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to save AI provider settings: ${error.message}`);
  return toPublic(data as AiProviderSettingsRow);
}
