-- Setup wizard system configuration (Module 2/3)
CREATE TABLE IF NOT EXISTS public.system_config (
  id text PRIMARY KEY,
  config_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Middleware can read setup_status only (not ai_credentials or other secrets)
CREATE POLICY system_config_setup_status_public_read
  ON public.system_config FOR SELECT TO anon, authenticated
  USING (id = 'setup_status');

-- Service role / wizard can read/write all keys
CREATE POLICY system_config_service_role_all
  ON public.system_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.system_config TO anon, authenticated;
GRANT ALL ON public.system_config TO service_role;

INSERT INTO public.system_config (id, config_data)
VALUES ('setup_status', '{"is_completed": false, "current_step": 1}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Backfill existing production: mark setup complete when app_settings already exists
INSERT INTO public.system_config (id, config_data)
SELECT
  'setup_status',
  jsonb_build_object('is_completed', true, 'current_step', 3, 'backfilled_at', now())
FROM public.app_settings
WHERE id = 'default'
ON CONFLICT (id) DO UPDATE
SET
  config_data = CASE
    WHEN (SELECT count(*) FROM public.app_settings WHERE id = 'default') > 0
    THEN jsonb_build_object('is_completed', true, 'current_step', 3, 'backfilled_at', now())
    ELSE public.system_config.config_data
  END,
  updated_at = now()
WHERE EXISTS (SELECT 1 FROM public.app_settings WHERE id = 'default');
