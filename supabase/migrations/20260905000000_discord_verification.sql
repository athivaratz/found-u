-- Discord verification is server-only.  The public web flow authenticates the
-- Found-U user first; the bot accesses these records only through protected API routes.
CREATE TABLE IF NOT EXISTS public.discord_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  role_ids text[] NOT NULL DEFAULT '{}',
  verified_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_user_id),
  UNIQUE (guild_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_links_account_id
  ON public.discord_links (account_id);

CREATE TABLE IF NOT EXISTS public.discord_verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash char(64) NOT NULL UNIQUE,
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  role_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'fulfilled', 'expired')),
  failure_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  fulfilled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discord_verification_pending
  ON public.discord_verification_sessions (status, expires_at, requested_at);

CREATE INDEX IF NOT EXISTS idx_discord_verification_discord_user
  ON public.discord_verification_sessions (guild_id, discord_user_id, requested_at DESC);

DROP TRIGGER IF EXISTS discord_links_updated_at ON public.discord_links;
CREATE TRIGGER discord_links_updated_at
  BEFORE UPDATE ON public.discord_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS discord_verification_sessions_updated_at ON public.discord_verification_sessions;
CREATE TRIGGER discord_verification_sessions_updated_at
  BEFORE UPDATE ON public.discord_verification_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.discord_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_verification_sessions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discord_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discord_verification_sessions TO service_role;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['discord_links', 'discord_verification_sessions']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = 'service_role_all_' || tbl
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'service_role_all_' || tbl,
        tbl
      );
    END IF;
  END LOOP;
END $$;
