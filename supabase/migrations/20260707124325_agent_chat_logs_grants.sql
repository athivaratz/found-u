-- PostgREST roles need explicit table grants (new tables via MCP may miss defaults)
GRANT SELECT, INSERT, DELETE ON public.agent_chat_logs TO service_role;
GRANT SELECT ON public.agent_chat_logs TO authenticated;

-- Allow admins to read via RLS when using user JWT (optional safety)
DROP POLICY IF EXISTS agent_chat_logs_admin_select ON public.agent_chat_logs;
CREATE POLICY agent_chat_logs_admin_select ON public.agent_chat_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = auth.uid() AND a.role = 'admin'
    )
  );;
