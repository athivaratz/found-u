-- Allow service_role (used by API routes and bootstrap script) to manage student accounts
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_accounts TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Ensure RLS policies allow service_role bypass (service_role typically bypasses RLS in Supabase)
ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_accounts'
      AND policyname = 'service_role_all_student_accounts'
  ) THEN
    CREATE POLICY service_role_all_student_accounts
      ON public.student_accounts
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;;
