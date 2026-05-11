# YCode upstream alignment (OSS vs Cloud)

## Self-hosted (copyable) reference

Official docs describe how to run the **open-source** app:

- [Installation](https://docs.ycode.com/docs/getting-started/installation) — Node 18+, deploy to Vercel (MasjidWeb uses **Netlify**; same serverless idea).
- [Configuration](https://docs.ycode.com/docs/getting-started/configuration) — Supabase keys, **transaction pooler** (port 6543) for serverless/Knex, env var names.

Keep [`ycode-masjidweb/.env.example`](../ycode-masjidweb/.env.example) aligned with upstream variable names where possible; MasjidWeb adds tenant-specific variables (`TENANT_DOMAIN_SUFFIX`, `TEMPLATE_TENANT_ID`, `PROVISIONING_WEBHOOK_SECRET`, etc.).

## YCode Cloud

Product docs state that **Cloud users do not configure env vars or Supabase** — configuration is automatic. **Internal architecture of YCode Cloud is not published.** Do not assume a second public reference for multi-tenant behavior beyond the OSS codebase.

## Merges from `ycode/ycode`

After pulling upstream into the [`ycode-masjidweb` submodule](SUBMODULE.md), re-run Knex migrations as upstream documents, and re-check [`docs/UPSTREAM_MERGE_HOTSPOTS.md`](UPSTREAM_MERGE_HOTSPOTS.md).
