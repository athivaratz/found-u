-- Banking-style PIN auth: first login uses school password, then mandatory PIN setup.
-- Stop forcing password change on first login.

ALTER TABLE public.student_accounts
  ALTER COLUMN must_change_password SET DEFAULT false;

UPDATE public.student_accounts
SET must_change_password = false,
    updated_at = now()
WHERE must_change_password = true;

UPDATE public.profiles
SET must_change_password = false,
    updated_at = now()
WHERE must_change_password = true;

-- Fast lookups for eligibility checks (Google / Passkey / PIN)
CREATE INDEX IF NOT EXISTS idx_student_accounts_linked_uid
  ON public.student_accounts (linked_uid)
  WHERE linked_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_accounts_quick_unlock
  ON public.student_accounts (student_id)
  WHERE status = 'active' AND has_logged_in_once = true AND pin_hash IS NOT NULL;

-- Keep profiles.auth_methods aligned when PIN is set/cleared on student_accounts
CREATE OR REPLACE FUNCTION public.sync_profile_pin_auth_method()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.linked_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD.pin_hash IS NOT DISTINCT FROM NEW.pin_hash)
     AND (OLD.linked_uid IS NOT DISTINCT FROM NEW.linked_uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.pin_hash IS NOT NULL THEN
    UPDATE public.profiles
    SET auth_methods = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(COALESCE(auth_methods, '{}'::text[]) || ARRAY['pin']::text[])
      )
    ),
    updated_at = now()
    WHERE id = NEW.linked_uid;
  ELSE
    UPDATE public.profiles
    SET auth_methods = (
      SELECT COALESCE(array_agg(m), '{}'::text[])
      FROM unnest(COALESCE(auth_methods, '{}'::text[])) AS m
      WHERE m <> 'pin'
    ),
    updated_at = now()
    WHERE id = NEW.linked_uid;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_pin_auth_method ON public.student_accounts;
CREATE TRIGGER trg_sync_profile_pin_auth_method
  AFTER INSERT OR UPDATE OF pin_hash, linked_uid ON public.student_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_pin_auth_method();

-- Backfill existing linked accounts that already have a PIN hash
UPDATE public.profiles p
SET auth_methods = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(COALESCE(p.auth_methods, '{}'::text[]) || ARRAY['pin']::text[])
  )
),
updated_at = now()
FROM public.student_accounts sa
WHERE sa.linked_uid = p.id
  AND sa.pin_hash IS NOT NULL
  AND NOT (COALESCE(p.auth_methods, '{}'::text[]) @> ARRAY['pin']::text[]);

COMMENT ON COLUMN public.student_accounts.must_change_password IS
  'Optional password rotation flag. First-login flow uses PIN setup instead of forced password change.';

COMMENT ON COLUMN public.student_accounts.pin_hash IS
  'Scrypt hash of 6-digit PIN for quick unlock on remembered devices.';

COMMENT ON COLUMN public.student_accounts.has_logged_in_once IS
  'True after first successful password login; required before PIN/Passkey/Google quick auth.';;
