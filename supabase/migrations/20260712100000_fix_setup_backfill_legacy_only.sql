-- Fix setup_status backfill: only mark complete for legacy installs with admin accounts
-- Fresh deploys (app_settings seed only, no admin) must stay is_completed=false

UPDATE public.system_config
SET
  config_data = jsonb_build_object(
    'is_completed', false,
    'current_step', 1,
    'hydrated_at', config_data->>'hydrated_at'
  ),
  updated_at = now()
WHERE id = 'setup_status'
  AND (config_data->>'is_completed')::boolean IS TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts WHERE role = 'admin' LIMIT 1
  );

-- Legacy production: ensure complete when admin exists but setup_status was never set
INSERT INTO public.system_config (id, config_data)
SELECT
  'setup_status',
  jsonb_build_object('is_completed', true, 'current_step', 3, 'backfilled_at', now())
WHERE EXISTS (SELECT 1 FROM public.accounts WHERE role = 'admin' LIMIT 1)
ON CONFLICT (id) DO UPDATE
SET
  config_data = jsonb_build_object(
    'is_completed', true,
    'current_step', 3,
    'backfilled_at', COALESCE(public.system_config.config_data->>'backfilled_at', now()::text)
  ),
  updated_at = now()
WHERE EXISTS (SELECT 1 FROM public.accounts WHERE role = 'admin' LIMIT 1)
  AND (public.system_config.config_data->>'is_completed')::boolean IS DISTINCT FROM true;
