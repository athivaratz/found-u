-- BUG-01: policies on accounts were never enforced because RLS was off.
-- Table-level SELECT cannot be narrowed with REVOKE SELECT (column), so
-- authenticated receives an explicit column list that omits secret hashes.

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.accounts FROM anon;
REVOKE SELECT ON public.accounts FROM authenticated;

GRANT SELECT (
  id,
  student_id,
  email,
  display_name,
  photo_url,
  role,
  first_name,
  last_name,
  nickname,
  shown_name,
  is_student_verified,
  auth_methods,
  must_change_password,
  has_seen_tutorial,
  ban_status,
  ban_reason,
  banned_at,
  banned_by,
  timeout_until,
  has_logged_in_once,
  linked_uid,
  status,
  import_batch_id,
  grade_level,
  room_number,
  is_registered,
  created_at,
  updated_at
) ON public.accounts TO authenticated;

GRANT INSERT, UPDATE ON public.accounts TO authenticated;

DROP POLICY IF EXISTS accounts_select_own ON public.accounts;
CREATE POLICY accounts_select_own
  ON public.accounts
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR linked_uid = auth.uid());

DROP POLICY IF EXISTS accounts_update_own ON public.accounts;
CREATE POLICY accounts_update_own
  ON public.accounts
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR linked_uid = auth.uid())
  WITH CHECK (id = auth.uid() OR linked_uid = auth.uid());

DROP POLICY IF EXISTS accounts_insert_own ON public.accounts;
CREATE POLICY accounts_insert_own
  ON public.accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'user' AND ban_status = 'none');

CREATE OR REPLACE FUNCTION public.protect_accounts_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
BEGIN
  BEGIN
    jwt_role := auth.role();
  EXCEPTION
    WHEN OTHERS THEN
      jwt_role := NULL;
  END;

  IF jwt_role = 'service_role'
     OR current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS DISTINCT FROM 'user'
       OR NEW.ban_status IS DISTINCT FROM 'none'
       OR NEW.ban_reason IS NOT NULL
       OR NEW.banned_at IS NOT NULL
       OR NEW.banned_by IS NOT NULL
       OR NEW.timeout_until IS NOT NULL
       OR NEW.status IS DISTINCT FROM 'active'
       OR NEW.student_id IS NOT NULL
       OR NEW.is_student_verified IS DISTINCT FROM false
       OR NEW.linked_uid IS NOT NULL
       OR NEW.must_change_password IS DISTINCT FROM false
       OR NEW.is_registered IS DISTINCT FROM false
       OR NEW.import_batch_id IS NOT NULL
       OR NEW.school_password_hash IS NOT NULL
       OR NEW.current_password_hash IS NOT NULL
       OR NEW.pin_hash IS NOT NULL
       OR (
         NEW.passkey_credentials IS NOT NULL
         AND NEW.passkey_credentials <> '[]'::jsonb
       ) THEN
      RAISE EXCEPTION 'cannot modify privileged account columns'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.ban_status IS DISTINCT FROM OLD.ban_status
     OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
     OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
     OR NEW.banned_by IS DISTINCT FROM OLD.banned_by
     OR NEW.timeout_until IS DISTINCT FROM OLD.timeout_until
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.is_student_verified IS DISTINCT FROM OLD.is_student_verified
     OR NEW.linked_uid IS DISTINCT FROM OLD.linked_uid
     OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     OR NEW.is_registered IS DISTINCT FROM OLD.is_registered
     OR NEW.import_batch_id IS DISTINCT FROM OLD.import_batch_id
     OR NEW.school_password_hash IS DISTINCT FROM OLD.school_password_hash
     OR NEW.current_password_hash IS DISTINCT FROM OLD.current_password_hash
     OR NEW.pin_hash IS DISTINCT FROM OLD.pin_hash
     OR NEW.passkey_credentials IS DISTINCT FROM OLD.passkey_credentials THEN
    RAISE EXCEPTION 'cannot modify privileged account columns'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_accounts_privileged_columns ON public.accounts;
CREATE TRIGGER protect_accounts_privileged_columns
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_accounts_privileged_columns();
