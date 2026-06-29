-- Give the tenant-provisioning RPCs enough time to finish.
--
-- These functions are invoked from the admin dashboard via PostgREST using the
-- service-role key. PostgREST connects as `authenticator` (statement_timeout =
-- 8s) and SET ROLE service_role; service_role has no statement_timeout of its
-- own, so the 8s from authenticator carries over. The bulk CMS clone for a new
-- tenant (clone_cms_for_tenant: ~500 items + several thousand
-- collection_item_values, each maintaining 7 indexes) and the follow-on draft
-- publish (publish_tenant_drafts) regularly exceed 8s, so provisioning failed
-- with: "clone_cms_for_tenant RPC failed: canceling statement due to statement
-- timeout" (SQLSTATE 57014) and the tenant was left in status "failed".
--
-- A function-level SET raises statement_timeout only for the duration of these
-- calls (verified: it overrides the inherited 8s session cap through PostgREST),
-- leaving the global 8s budget intact for every other query. Idempotent.
ALTER FUNCTION public.clone_cms_for_tenant(uuid, uuid, text, jsonb)
  SET statement_timeout = '60s';

ALTER FUNCTION public.publish_tenant_drafts(uuid)
  SET statement_timeout = '60s';
