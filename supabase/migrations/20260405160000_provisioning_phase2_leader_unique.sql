-- One in-flight phase-2 leader per tenant: prevents concurrent template clones when
-- multiple POST /api/provision-complete requests overlap (duplicate tabs, CDN retries).
create unique index if not exists provisioning_audit_phase2_leader_uidx
  on public.provisioning_audit_log (tenant_id)
  where action = 'phase2_leader_claim';

comment on index public.provisioning_audit_phase2_leader_uidx is
  'At most one active phase2_leader_claim row per tenant; paired with app-side delete when phase 2 finishes.';
