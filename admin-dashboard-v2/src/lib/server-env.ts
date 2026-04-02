/**
 * Read secrets and config in both Astro SSR (import.meta.env) and plain Node (tsx scripts, tests).
 */
export function readServerEnv(key: string): string | undefined {
  let fromMeta: string | undefined;
  if (typeof import.meta !== "undefined" && import.meta.env) {
    fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  }
  if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta;
  if (typeof process !== "undefined") {
    const p = process.env[key];
    if (typeof p === "string" && p.length > 0) return p;
  }
  return undefined;
}
