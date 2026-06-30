-- Phase 4 (RLS fail-closed) + SECURITY FIX: tenant-scope the 8 tables whose RLS
-- policies were still the generic "any authenticated user" form.
--
-- BUG: 19 tenant tables (pages, collections, assets, …) already had tenant-scoped
-- policies (tenant_id = current_tenant_id()), but these 8 kept old policies of the
-- form `auth.uid() IS NOT NULL` on the `public` role. anon AND authenticated also
-- hold full table GRANTs. Net effect: any logged-in tenant admin, using the public
-- anon key + their own JWT, could read/write EVERY tenant's rows in these tables
-- via direct PostgREST — including secrets (mcp_tokens, app_settings = MailerLite
-- key). Proven by impersonation: a high900 admin saw 8 mcp_tokens, 7 foreign.
--
-- FIX: replace the loose policies with the same tenant-scoped pattern the other 19
-- tables use. The app is unaffected — it queries via the service_role key, which
-- bypasses RLS. Only the anon/authenticated PostgREST path is constrained (to the
-- caller's own tenant), which is all the browser ever legitimately needs.
--
-- After: impersonation shows 0 foreign rows on all 8; service_role still sees all.
-- Already applied to prod (jofgypmriaqphnsyxiks) via the Management API; this file
-- is the source of truth and is idempotent.

-- ---- secret / operational tables (no is_published): deny anon, own-tenant only ----
do $$
declare t text;
begin
  foreach t in array array['app_settings','collection_imports','mcp_tokens','versions','webhook_deliveries','webhooks']
  loop
    -- drop the legacy generic policies (names vary per table) + any prior run of ours
    execute format('drop policy if exists %I on public.%I', t||'_anon_deny', t);
    execute format('drop policy if exists %I on public.%I', t||'_tenant_all', t);
    -- legacy names
    execute (select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' '), '')
             from pg_policies where schemaname='public' and tablename=t
               and lower(coalesce(qual,'')||' '||coalesce(with_check,'')) like '%auth.uid%'
               and lower(coalesce(qual,'')||' '||coalesce(with_check,'')) not like '%tenant_id%');
    execute format('create policy %I on public.%I as permissive for all to anon using (false) with check (false)', t||'_anon_deny', t);
    execute format('create policy %I on public.%I as permissive for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id())', t||'_tenant_all', t);
  end loop;
end $$;

-- ---- content tables (have is_published + deleted_at): anon may read PUBLISHED
--      rows (parity with pages/collections), authenticated own-tenant only ----
do $$
declare t text;
begin
  foreach t in array array['global_variables','translations']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_anon_published', t);
    execute format('drop policy if exists %I on public.%I', t||'_tenant_all', t);
    execute (select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' '), '')
             from pg_policies where schemaname='public' and tablename=t
               and lower(coalesce(qual,'')||' '||coalesce(with_check,'')) like '%auth.uid%'
               and lower(coalesce(qual,'')||' '||coalesce(with_check,'')) not like '%tenant_id%');
    execute format('create policy %I on public.%I as permissive for select to anon using (is_published = true and deleted_at is null)', t||'_anon_published', t);
    execute format('create policy %I on public.%I as permissive for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id())', t||'_tenant_all', t);
  end loop;
end $$;
