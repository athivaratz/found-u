-- Server routes use service_role; without these grants admin queries return empty rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO service_role;

-- Client profile/tutorial updates
GRANT UPDATE ON public.accounts TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'accounts'
      AND policyname = 'accounts_update_own'
  ) THEN
    CREATE POLICY accounts_update_own
      ON public.accounts
      FOR UPDATE
      TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;
END $$;;
