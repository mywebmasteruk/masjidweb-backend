create table if not exists public.admin_ai_provider_settings (
  id text primary key default 'default',
  enabled boolean not null default false,
  provider text not null default 'none',
  model_selection_mode text not null default 'manual',
  model text,
  reasoning_effort text not null default 'medium',
  temperature numeric not null default 0.1,
  max_output_tokens integer not null default 16000,
  request_timeout_ms integer not null default 120000,
  openrouter_api_key_ciphertext text,
  openrouter_api_key_iv text,
  openrouter_api_key_tag text,
  openrouter_api_key_last4 text,
  openrouter_api_key_saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_ai_provider_settings_singleton check (id = 'default'),
  constraint admin_ai_provider_settings_provider check (provider in ('none', 'openrouter')),
  constraint admin_ai_provider_settings_model_selection check (model_selection_mode in ('manual')),
  constraint admin_ai_provider_settings_reasoning check (reasoning_effort in ('low', 'medium', 'high')),
  constraint admin_ai_provider_settings_temperature check (temperature >= 0 and temperature <= 2),
  constraint admin_ai_provider_settings_max_tokens check (max_output_tokens between 1000 and 100000),
  constraint admin_ai_provider_settings_timeout check (request_timeout_ms between 10000 and 300000)
);

alter table public.admin_ai_provider_settings enable row level security;

revoke all on public.admin_ai_provider_settings from anon, authenticated;

drop policy if exists "admin_ai_provider_settings_no_client_access" on public.admin_ai_provider_settings;
create policy "admin_ai_provider_settings_no_client_access"
  on public.admin_ai_provider_settings
  for all
  using (false)
  with check (false);

create index if not exists admin_ai_provider_settings_updated_at_idx
  on public.admin_ai_provider_settings (updated_at desc);
