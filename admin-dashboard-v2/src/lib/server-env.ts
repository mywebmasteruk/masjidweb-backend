/**
 * Read secrets and config in both Astro SSR (import.meta.env) and plain Node (tsx scripts, tests).
 */
function normalizeEnvValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("No value set in the ")) return undefined;
  return trimmed;
}

export function readServerEnv(key: string): string | undefined {
  let fromMeta: string | undefined;
  if (typeof import.meta !== "undefined" && import.meta.env) {
    fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  }
  const metaValue = normalizeEnvValue(fromMeta);
  if (metaValue) return metaValue;
  if (typeof process !== "undefined") {
    return normalizeEnvValue(process.env[key]);
  }
  return undefined;
}
