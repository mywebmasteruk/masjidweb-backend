# Native scope audit (multi-tenant hardening)

## Tables with `tenant_id`

Repositories should use **`getTenantIdFromHeaders()`** + **`scopeToTenantRow()`** on PostgREST queries when **`getSupabaseAdmin()`** may return the **service role** (RLS bypass). See [`docs/TENANCY.md`](TENANCY.md).

## Updates in this branch

| Area | Change |
|------|--------|
| [`collectionFieldRepository.ts`](../ycode-masjidweb/lib/repositories/collectionFieldRepository.ts) | Scoped selects/updates/deletes/reorder/publish; `createField` sets `tenant_id`. |
| [`collectionItemValueRepository.ts`](../ycode-masjidweb/lib/repositories/collectionItemValueRepository.ts) | Scoped all `collection_item_values` / `collection_items` mutations; inserts include `tenant_id` when available. |
| [`translationRepository.ts`](../ycode-masjidweb/lib/repositories/translationRepository.ts) | `translations` has **no** `tenant_id` column; scoped via **`locales`** (`assertLocaleBelongsToTenant`, `getLocaleIdsForTenant`). |

## Follow-up (optional)

1. Audit remaining **`getSupabaseAdmin()`** call sites under `ycode-masjidweb/lib/repositories/` and `app/ycode/api/` for the same scoping pattern (`getTenantIdFromHeaders` / `resolveTenantScope` + `scopeToTenantRow` or documented join path).
2. Consider a future migration adding **`tenant_id`** to **`translations`** for simpler queries (trade-off: denormalization vs join-only via `locales`).
3. Re-run **`docs/MT_VALIDATION_CHECKLIST.md`** on a preview deploy after any large repository or `page-fetcher` change.
4. When re-merging upstream YCode, reconcile **`lib/page-fetcher.ts`** with any upstream changes to inline HTML/asset helpers (this fork may use [`layer-html.ts`](../ycode-masjidweb/lib/layer-html.ts) / [`layer-asset-resolve.ts`](../ycode-masjidweb/lib/layer-asset-resolve.ts)).
