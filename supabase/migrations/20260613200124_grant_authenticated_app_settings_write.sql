-- RLS policy app_settings_write already checks is_admin(); missing table grants blocked upsert.
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;

-- Ensure authenticated can read profiles for is_admin() (usually already granted)
GRANT SELECT ON public.profiles TO authenticated;;
