#!/usr/bin/env node
/**
 * Upload KEY=value pairs from a file to Netlify site environment variables.
 * Usage: NETLIFY_AUTH_TOKEN=... NETLIFY_SITE_ID=... node sync_netlify_env.mjs <env-file>
 *
 * Free tier: omit `scopes` on POST (granular scopes require Pro). PATCH cannot use context "all".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = "https://api.netlify.com/api/v1";

const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID;
let accountRef = process.env.NETLIFY_ACCOUNT_SLUG ?? process.env.NETLIFY_ACCOUNT_ID;
const file = process.argv[2];

if (!token || !siteId || !file) {
  console.error(
    "Usage: NETLIFY_AUTH_TOKEN=... NETLIFY_SITE_ID=... node sync_netlify_env.mjs <env-file>",
  );
  console.error(
    "Optional: NETLIFY_ACCOUNT_SLUG or NETLIFY_ACCOUNT_ID (else resolved from GET /sites/:id).",
  );
  process.exit(1);
}

const text = readFileSync(resolve(file), "utf8");
const pairs = {};
for (const line of text.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const key = t.slice(0, eq).trim();
  let val = t.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (key && val) pairs[key] = val;
}

async function resolveAccountRef() {
  if (accountRef) {
    const probe = await fetch(
      `${API}/accounts/${encodeURIComponent(accountRef)}/env?${new URLSearchParams({ site_id: siteId })}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (probe.ok) return accountRef;
    console.warn(
      `Warning: NETLIFY_ACCOUNT_* probe failed (${probe.status}), re-resolving from site…`,
    );
  }

  const sres = await fetch(`${API}/sites/${siteId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!sres.ok) {
    console.error(`Could not load site: ${sres.status} ${await sres.text()}`);
    process.exit(1);
  }
  const site = await sres.json();
  const candidates = [site.account_slug, site.account_id].filter(Boolean);

  for (const ref of candidates) {
    const res = await fetch(
      `${API}/accounts/${encodeURIComponent(ref)}/env?${new URLSearchParams({ site_id: siteId })}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      return ref;
    }
  }

  const listRes = await fetch(`${API}/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    console.error(`List accounts failed: ${listRes.status} ${await listRes.text()}`);
    process.exit(1);
  }
  const accounts = await listRes.json();
  const m = accounts.find((a) => a.id === site.account_id);
  if (m?.slug) return m.slug;
  if (m?.id) return m.id;

  console.error(
    "Could not resolve team for env API. Grant this token access to the site's team.",
  );
  process.exit(1);
}

function postBody(key, value, valueContext, scopes) {
  const item = { key, values: [{ context: valueContext, value }] };
  if (scopes?.length) {
    item.scopes = scopes;
  }
  return JSON.stringify([item]);
}

accountRef = await resolveAccountRef();
const q = new URLSearchParams({ site_id: siteId });

for (const [key, value] of Object.entries(pairs)) {
  let lastPost = null;
  let ok = false;
  for (const ctx of ["all", "production"]) {
    const body = postBody(key, value, ctx, undefined);
    const res = await fetch(`${API}/accounts/${encodeURIComponent(accountRef)}/env?${q}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (res.ok) {
      ok = true;
      break;
    }
    lastPost = res;
  }
  if (!ok) {
    const patch = await fetch(
      `${API}/accounts/${encodeURIComponent(accountRef)}/env/${encodeURIComponent(key)}?${q}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ context: "production", value }),
      },
    );
    if (!patch.ok) {
      console.error(
        `Failed ${key}: POST ${lastPost?.status ?? "?"} ${lastPost ? await lastPost.text() : ""}; PATCH ${patch.status} ${await patch.text()}`,
      );
      process.exit(1);
    }
  }
  console.log(`Set ${key}`);
}

console.log("Done. Trigger a new deploy in Netlify if needed.");
