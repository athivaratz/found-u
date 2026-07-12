-- Allow admins to manage user accounts from admin UI (getAllUsers, ban/unban)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'accounts' AND policyname = 'accounts_select_admin'
  ) THEN
    CREATE POLICY accounts_select_admin
      ON public.accounts
      FOR SELECT
      TO authenticated
      USING (is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'accounts' AND policyname = 'accounts_update_admin'
  ) THEN
    CREATE POLICY accounts_update_admin
      ON public.accounts
      FOR UPDATE
      TO authenticated
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- Server routes may need full access to item tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lost_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.found_items TO service_role;;
