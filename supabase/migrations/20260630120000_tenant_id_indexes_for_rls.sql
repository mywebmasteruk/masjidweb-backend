-- Phase 4 pre-flight: index tenant_id on the high-volume tenant tables so RLS
-- tenant filtering uses an index instead of a sequential scan once app-path
-- enforcement is enabled (Supabase RLS perf best practice). Idempotent; the other
-- tenant tables already have a tenant_id-leading index.

create index if not exists asset_folders_tenant_id_idx          on public.asset_folders (tenant_id);
create index if not exists assets_tenant_id_idx                 on public.assets (tenant_id);
create index if not exists collection_fields_tenant_id_idx      on public.collection_fields (tenant_id);
create index if not exists collection_item_values_tenant_id_idx on public.collection_item_values (tenant_id);
create index if not exists collection_items_tenant_id_idx       on public.collection_items (tenant_id);
create index if not exists collections_tenant_id_idx            on public.collections (tenant_id);
create index if not exists components_tenant_id_idx             on public.components (tenant_id);
create index if not exists fonts_tenant_id_idx                  on public.fonts (tenant_id);
create index if not exists page_folders_tenant_id_idx           on public.page_folders (tenant_id);
create index if not exists page_layers_tenant_id_idx            on public.page_layers (tenant_id);
