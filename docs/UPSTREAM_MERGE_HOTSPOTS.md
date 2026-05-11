# Merge hotspots (MasjidWeb × upstream YCode)

These files carry **multi-tenant and Supabase behavior**. Re-read diffs and re-test tenant isolation after merging **`ycode/ycode`** (or large cherry-picks) into [`ycode-masjidweb`](../ycode-masjidweb).

| File | Why |
|------|-----|
| [`ycode-masjidweb/middleware.ts`](../ycode-masjidweb/middleware.ts) | Sets `x-tenant-id` from `tenant_registry`; provisioning publish slug header. |
| [`ycode-masjidweb/lib/supabase-server.ts`](../ycode-masjidweb/lib/supabase-server.ts) | `getSupabaseAdmin`, `getTenantIdFromHeaders`, `resolveTenantScope`, `scopeToTenantRow`. |
| [`ycode-masjidweb/lib/knex-helpers.ts`](../ycode-masjidweb/lib/knex-helpers.ts) | Tenant-aware Knex batch updates / filters. |
| [`ycode-masjidweb/lib/tenant/middleware-utils.ts`](../ycode-masjidweb/lib/tenant/middleware-utils.ts) | Subdomain extraction, public route helpers. |
| [`ycode-masjidweb/lib/page-fetcher.ts`](../ycode-masjidweb/lib/page-fetcher.ts) | SSR and published HTML; calls `resolveTenantScope`, `getTenantIdFromHeaders`, collection HTML, `renderCollectionItemsToHtml`. |
| [`ycode-masjidweb/lib/layer-html.ts`](../ycode-masjidweb/lib/layer-html.ts) | Server-side layer → HTML (fork extract; upstream may still inline in `page-fetcher`). |
| [`ycode-masjidweb/lib/layer-asset-resolve.ts`](../ycode-masjidweb/lib/layer-asset-resolve.ts) | `resolveAllAssets` / `resolveLayerAssets` for SSR; paired with `page-fetcher`. |
| [`ycode-masjidweb/lib/scope-to-tenant-row.ts`](../ycode-masjidweb/lib/scope-to-tenant-row.ts) | `scopeToTenantRow` helper; must stay aligned with [`supabase-server.ts`](../ycode-masjidweb/lib/supabase-server.ts). |
| [`ycode-masjidweb/lib/tenant/index.ts`](../ycode-masjidweb/lib/tenant/index.ts) | Tenant module exports; keep consistent with middleware + Supabase helpers. |

### Fork-only namespace (`lib/masjidweb/`)

Prefer new MasjidWeb-specific code under [`ycode-masjidweb/lib/masjidweb/`](../ycode-masjidweb/lib/masjidweb/) (see [`README`](../ycode-masjidweb/lib/masjidweb/README.md)). After upstream merges, diff at least:

| File | Why |
|------|-----|
| [`lib/masjidweb/index.ts`](../ycode-masjidweb/lib/masjidweb/index.ts) | Stable re-exports of tenant helpers + publish contract; adjust if core paths move. |
| [`lib/masjidweb/contracts/publish-request.ts`](../ycode-masjidweb/lib/masjidweb/contracts/publish-request.ts) | Zod schema for provision → publish body; must stay aligned with [`admin-dashboard-v2` provision helpers](../admin-dashboard-v2/src/lib/provision-publish.ts) and [`docs/PROVISION_PUBLISH_CONTRACTS.md`](PROVISION_PUBLISH_CONTRACTS.md). |

### Repositories (service-role scoping)

Any repository using **`getSupabaseAdmin()`** + `scopeToTenantRow` / `getTenantIdFromHeaders` is a hotspot. After upstream merges, diff at least:

| File | Why |
|------|-----|
| [`pageRepository.ts`](../ycode-masjidweb/lib/repositories/pageRepository.ts) | Pages and drafts per tenant. |
| [`pageLayersRepository.ts`](../ycode-masjidweb/lib/repositories/pageLayersRepository.ts) | Layer trees tied to pages. |
| [`pageFolderRepository.ts`](../ycode-masjidweb/lib/repositories/pageFolderRepository.ts) | Folder hierarchy + URLs. |
| [`collectionRepository.ts`](../ycode-masjidweb/lib/repositories/collectionRepository.ts) | CMS collections. |
| [`collectionItemRepository.ts`](../ycode-masjidweb/lib/repositories/collectionItemRepository.ts) | Items and values. |
| [`assetRepository.ts`](../ycode-masjidweb/lib/repositories/assetRepository.ts) / [`assetFolderRepository.ts`](../ycode-masjidweb/lib/repositories/assetFolderRepository.ts) | Media paths and folders. |
| [`componentRepository.ts`](../ycode-masjidweb/lib/repositories/componentRepository.ts) | Reusable components. |
| [`localeRepository.ts`](../ycode-masjidweb/lib/repositories/localeRepository.ts) | Locales (tenant-scoped). |
| [`fontRepository.ts`](../ycode-masjidweb/lib/repositories/fontRepository.ts) / [`layerStyleRepository.ts`](../ycode-masjidweb/lib/layerStyleRepository.ts) | Fonts and layer styles. |
| [`settingsRepository.ts`](../ycode-masjidweb/lib/repositories/settingsRepository.ts) | Site settings rows. |
| [`collectionFieldRepository.ts`](../ycode-masjidweb/lib/repositories/collectionFieldRepository.ts) / [`collectionItemValueRepository.ts`](../ycode-masjidweb/lib/repositories/collectionItemValueRepository.ts) / [`translationRepository.ts`](../ycode-masjidweb/lib/repositories/translationRepository.ts) | Field defs, values, translations (see [`NATIVE_SCOPE_AUDIT.md`](NATIVE_SCOPE_AUDIT.md)). |

### API surface

| Area | Why |
|------|-----|
| [`ycode-masjidweb/app/ycode/api/`](../ycode-masjidweb/app/ycode/api/) | Most builder REST handlers; merge conflicts often land on shared CRUD patterns. |

## Re-verify after merge

1. `bash scripts/verify-all.sh`
2. Log in on two tenant subdomains; confirm content isolation (see [`TEST_PLAN.md`](../TEST_PLAN.md) and [`docs/TENANCY.md`](TENANCY.md)).
