#!/usr/bin/env node
/**
 * Download site environment variables from Netlify into a local file (for `astro dev`).
 *
 * Usage:
 *   NETLIFY_AUTH_TOKEN=... NETLIFY_SITE_ID=... node scripts/fetch_netlify_env.mjs [output-file]
 *
 * Default output: admin-dashboard-v2/.env (relative to repo root). Secrets may be omitted in the API response;
 * fill any missing keys manually from Netlify → Site configuration → Environment variables.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.netlify.com/api/v1";

const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID;
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outArg = process.argv[2];
const outFile = outArg
  ? resolve(outArg)
  : resolve(repoRoot, "admin-dashboard-v2", ".env");

if (!token || !siteId) {
  console.error(
    "Usage: NETLIFY_AUTH_TOKEN=... NETLIFY_SITE_ID=... node scripts/fetch_netlify_env.mjs [output-file]",
  );
  process.exit(1);
}

const res = await fetch(`${API}/sites/${siteId}/env`, {
  headers: { Authorization: `Bearer ${token}` },
});

if (!res.ok) {
  console.error(`GET site env failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

/** @type {{ key: string; values?: { value?: string; context?: string }[] }[]} */
const rows = await res.json();

const lines = [
  "# Pulled from Netlify — do not commit. Regenerate with scripts/fetch_netlify_env.mjs",
  `# Site ID: ${siteId}`,
  "",
];

for (const row of rows) {
  const key = row.key;
  if (!key) continue;
  const all = row.values?.find((v) => v.context === "all");
  const val = all?.value ?? row.values?.[0]?.value;
  if (val === undefined || val === "") {
    lines.push(`# ${key}=<not returned by API — set manually if required>`);
  } else {
    const escaped = String(val).replace(/\n/g, "\\n");
    lines.push(`${key}=${escaped}`);
  }
}

lines.push("");

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join("\n"), "utf8");
console.log(`Wrote ${outFile} (${lines.filter((l) => l && !l.startsWith("#")).length} values)`);
