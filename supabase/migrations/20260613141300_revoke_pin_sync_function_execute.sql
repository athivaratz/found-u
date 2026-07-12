-- Trigger-only function: not callable via PostgREST RPC
REVOKE ALL ON FUNCTION public.sync_profile_pin_auth_method() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_profile_pin_auth_method() FROM anon, authenticated;;
