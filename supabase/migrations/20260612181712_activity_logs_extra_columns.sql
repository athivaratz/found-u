ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS target_name text,
  ADD COLUMN IF NOT EXISTS user_name text;

ALTER TABLE public.activity_logs
  ALTER COLUMN details TYPE jsonb USING
    CASE
      WHEN details IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(details) = 'object' THEN details
      ELSE jsonb_build_object('message', details)
    END;;
