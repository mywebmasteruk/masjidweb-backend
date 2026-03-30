-- Placeholder published homepage for canonical template tenant (masjidemo1 / DEFAULT_TEMPLATE_TENANT_ID).
-- Idempotent: skips if any root index page already exists for this tenant.

DO $$
DECLARE
  t uuid := '2fff887d-a78e-4256-9116-6e02fe38c614'::uuid;
  hp_id uuid;
  lyr_id uuid;
  layers_json jsonb := $layers$
[{"id":"body","name":"body","classes":"min-h-screen flex flex-col items-center justify-center bg-slate-50 p-8","children":[{"id":"lyr-wrap","name":"div","classes":"max-w-xl text-center space-y-4","children":[{"id":"lyr-h","name":"heading","classes":"text-3xl font-semibold text-slate-900","settings":{"tag":"h1"},"variables":{"text":{"type":"dynamic_text","data":{"content":"Masjid demo"}}}},{"id":"lyr-p","name":"div","classes":"text-slate-600 leading-relaxed","variables":{"text":{"type":"dynamic_text","data":{"content":"Your homepage is live. Open the Ycode builder on manage.masjidweb.com to design this site and connect collections."}}}}]}]}]
$layers$::jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pages
    WHERE tenant_id = t AND is_index = true AND page_folder_id IS NULL
      AND deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  hp_id := gen_random_uuid();
  lyr_id := gen_random_uuid();

  INSERT INTO public.pages (
    id, tenant_id, page_folder_id, name, slug, "order", depth,
    is_index, is_dynamic, error_page, settings, is_published, content_hash, deleted_at
  ) VALUES (
    hp_id, t, NULL, 'Homepage', '', 0, 0,
    true, false, NULL, '{}'::jsonb, false, NULL, NULL
  );

  INSERT INTO public.pages (
    id, tenant_id, page_folder_id, name, slug, "order", depth,
    is_index, is_dynamic, error_page, settings, is_published, content_hash, deleted_at
  ) VALUES (
    hp_id, t, NULL, 'Homepage', '', 0, 0,
    true, false, NULL, '{}'::jsonb, true, NULL, NULL
  );

  INSERT INTO public.page_layers (
    id, page_id, layers, is_published, content_hash, deleted_at, tenant_id
  ) VALUES (
    lyr_id, hp_id, layers_json, false, NULL, NULL, t
  );

  INSERT INTO public.page_layers (
    id, page_id, layers, is_published, content_hash, deleted_at, tenant_id
  ) VALUES (
    lyr_id, hp_id, layers_json, true, NULL, NULL, t
  );
END $$;
