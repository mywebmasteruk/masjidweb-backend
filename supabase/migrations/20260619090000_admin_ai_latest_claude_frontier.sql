alter table public.admin_ai_provider_settings
  drop constraint if exists admin_ai_provider_settings_model_selection;

alter table public.admin_ai_provider_settings
  add constraint admin_ai_provider_settings_model_selection
  check (model_selection_mode in ('latest_claude_frontier', 'manual'));
