-- BUG-02: confirm_item_match and unmatch_item_match are SECURITY DEFINER and
-- were executable by any signed-in user. The admin API calls them with the
-- service role after requireMatchAdmin. Keep that grant and drop the rest.
-- Postgres also grants EXECUTE to PUBLIC when a function is created.

REVOKE ALL ON FUNCTION public.confirm_item_match(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_item_match(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.unmatch_item_match(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unmatch_item_match(uuid, uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_item_match(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unmatch_item_match(uuid, uuid) TO service_role;
