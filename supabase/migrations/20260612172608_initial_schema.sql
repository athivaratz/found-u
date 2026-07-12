-- Enums
CREATE TYPE public.user_role AS ENUM ('user', 'admin');
CREATE TYPE public.ban_status AS ENUM ('none', 'banned', 'timeout');
CREATE TYPE public.student_account_status AS ENUM ('active', 'disabled');
CREATE TYPE public.item_status AS ENUM ('searching', 'pending_room_confirm', 'found', 'claimed', 'expired');
CREATE TYPE public.nfc_tag_status AS ENUM ('active', 'lost', 'returned', 'disabled');
CREATE TYPE public.nfc_found_report_status AS ENUM ('pending', 'viewed', 'resolved');
CREATE TYPE public.error_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.error_source AS ENUM ('client', 'server', 'api', 'database', 'unknown');

-- Profiles (replaces users collection)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  photo_url text,
  role public.user_role NOT NULL DEFAULT 'user',
  student_id char(5),
  first_name text,
  last_name text,
  nickname text,
  shown_name text,
  is_student_verified boolean NOT NULL DEFAULT false,
  auth_methods text[] DEFAULT '{}',
  must_change_password boolean NOT NULL DEFAULT false,
  has_seen_tutorial boolean NOT NULL DEFAULT false,
  ban_status public.ban_status NOT NULL DEFAULT 'none',
  ban_reason text,
  banned_at timestamptz,
  banned_by uuid,
  timeout_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Student accounts (server-only via RLS)
CREATE TABLE public.student_accounts (
  student_id char(5) PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  nickname text NOT NULL DEFAULT '',
  school_password_hash text NOT NULL,
  current_password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  has_logged_in_once boolean NOT NULL DEFAULT false,
  linked_uid uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_google_email text,
  pin_hash text,
  passkey_credentials jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.student_account_status NOT NULL DEFAULT 'active',
  import_batch_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.passkey_lookup (
  credential_id text PRIMARY KEY,
  student_id char(5) NOT NULL REFERENCES public.student_accounts(student_id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_whitelist (
  email text PRIMARY KEY,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE TABLE public.app_settings (
  id text PRIMARY KEY DEFAULT 'default',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.lost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text NOT NULL,
  item_name text NOT NULL,
  category text NOT NULL,
  description text,
  location_lost text NOT NULL,
  location_place_name text,
  location_coords jsonb,
  date_lost timestamptz NOT NULL DEFAULT now(),
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  student_id char(5),
  status public.item_status NOT NULL DEFAULT 'searching',
  matched_found_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.found_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text NOT NULL,
  photo_url text,
  item_name text,
  category text,
  color text,
  brand text,
  description text NOT NULL,
  location_found text NOT NULL,
  location_place_name text,
  location_coords jsonb,
  date_found timestamptz NOT NULL DEFAULT now(),
  drop_off_location text NOT NULL DEFAULT 'personnel_office',
  finder_contacts jsonb DEFAULT '[]'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.item_status NOT NULL DEFAULT 'pending_room_confirm',
  room_handover_confirmed boolean NOT NULL DEFAULT false,
  room_handover_confirmed_at timestamptz,
  room_handover_confirmed_by uuid,
  room_handover_confirmed_by_name text,
  handover_deadline_at timestamptz,
  expired_at timestamptz,
  matched_lost_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  icon text NOT NULL DEFAULT '📦',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contact_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  icon text NOT NULL DEFAULT '📞',
  placeholder text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.drop_off_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  user_id uuid,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  stack text,
  severity public.error_severity NOT NULL DEFAULT 'medium',
  source public.error_source NOT NULL DEFAULT 'unknown',
  url text,
  user_id uuid,
  user_email text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.nfc_tags (
  id text PRIMARY KEY,
  tag_uid text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  category text NOT NULL,
  description text,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.nfc_tag_status NOT NULL DEFAULT 'active',
  read_only_locked boolean NOT NULL DEFAULT false,
  lost_item_id uuid REFERENCES public.lost_items(id) ON DELETE SET NULL,
  last_found_report_id uuid,
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.nfc_found_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id text NOT NULL REFERENCES public.nfc_tags(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  finder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  finder_message text NOT NULL,
  location_found text,
  location_coords jsonb,
  finder_contacts jsonb DEFAULT '[]'::jsonb,
  status public.nfc_found_report_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_lost_items_tracking_code ON public.lost_items(tracking_code);
CREATE INDEX idx_lost_items_user_id ON public.lost_items(user_id);
CREATE INDEX idx_lost_items_student_id ON public.lost_items(student_id);
CREATE INDEX idx_lost_items_status ON public.lost_items(status);
CREATE INDEX idx_lost_items_created_at ON public.lost_items(created_at DESC);
CREATE INDEX idx_found_items_tracking_code ON public.found_items(tracking_code);
CREATE INDEX idx_found_items_user_id ON public.found_items(user_id);
CREATE INDEX idx_found_items_status ON public.found_items(status);
CREATE INDEX idx_found_items_created_at ON public.found_items(created_at DESC);
CREATE INDEX idx_ai_usage_user_created ON public.ai_usage(user_id, created_at DESC);
CREATE INDEX idx_nfc_tags_owner_registered ON public.nfc_tags(owner_id, registered_at DESC);
CREATE INDEX idx_nfc_tags_tag_uid ON public.nfc_tags(tag_uid);
CREATE INDEX idx_nfc_found_reports_owner_created ON public.nfc_found_reports(owner_id, created_at DESC);
CREATE INDEX idx_nfc_found_reports_tag_created ON public.nfc_found_reports(tag_id, created_at DESC);

-- Helper: is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER student_accounts_updated_at BEFORE UPDATE ON public.student_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER lost_items_updated_at BEFORE UPDATE ON public.lost_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER found_items_updated_at BEFORE UPDATE ON public.found_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER nfc_tags_updated_at BEFORE UPDATE ON public.nfc_tags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
;
