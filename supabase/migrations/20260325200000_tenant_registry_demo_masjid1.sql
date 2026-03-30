-- Public demo mirror: masjid1.<domain> — stable UUID, synced from template on each master.* publish (historical).
-- Idempotent: keeps existing row id if slug already present.

insert into public.tenant_registry (id, slug, business_name, status, description)
values (
  'b8e4f0a1-2c3d-4e5f-a6b7-c8d9e0f1a2b3'::uuid,
  'masjid1',
  'Public demo (mosque)',
  'active',
  'Synced from template (master.*) after each successful template publish.'
)
on conflict (slug) do update set
  business_name = excluded.business_name,
  description = excluded.description,
  updated_at = now();
