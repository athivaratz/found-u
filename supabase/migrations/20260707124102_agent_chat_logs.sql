-- Agent chat debug logs (7-day retention via scheduled cleanup)
CREATE TABLE IF NOT EXISTS public.agent_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  provider text NOT NULL,
  model text,
  settings_snapshot jsonb,
  routing jsonb,
  request_messages jsonb,
  response_parts jsonb,
  steps jsonb DEFAULT '[]'::jsonb,
  truncated boolean NOT NULL DEFAULT false,
  finish_reason text,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_chat_logs_created_at_idx
  ON public.agent_chat_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS agent_chat_logs_user_id_idx
  ON public.agent_chat_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_chat_logs_session_id_idx
  ON public.agent_chat_logs (session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.agent_chat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_chat_logs_admin_select ON public.agent_chat_logs;
CREATE POLICY agent_chat_logs_admin_select ON public.agent_chat_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = auth.uid() AND a.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.cleanup_agent_chat_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.agent_chat_logs
  WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON TABLE public.agent_chat_logs IS 'Raw agent chat request/response logs for admin debug (retain 7 days)';;
