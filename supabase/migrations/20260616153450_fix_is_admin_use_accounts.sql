-- is_admin() is used by many RLS policies (delete/update items, settings, logs, etc.)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.accounts
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$function$;

-- Obsolete after merging profiles + student_accounts into accounts
DROP FUNCTION IF EXISTS public.sync_profile_pin_auth_method() CASCADE;;
