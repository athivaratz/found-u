-- BUG-04: table SELECT cannot be narrowed with REVOKE SELECT (column).
-- Revoke the table grant, then grant the public column list. Owners and
-- admins read contacts and owner ids through security-definer functions.
-- service_role keeps the table grants from earlier migrations.

REVOKE SELECT ON public.lost_items FROM anon, authenticated;
REVOKE SELECT ON public.found_items FROM anon, authenticated;

GRANT SELECT (
  id,
  tracking_code,
  item_name,
  category,
  description,
  location_lost,
  location_place_name,
  location_coords,
  date_lost,
  status,
  matched_found_id,
  created_at,
  updated_at
) ON public.lost_items TO anon, authenticated;

GRANT SELECT (
  id,
  tracking_code,
  photo_url,
  item_name,
  category,
  color,
  brand,
  description,
  location_found,
  location_place_name,
  location_coords,
  date_found,
  drop_off_location,
  status,
  room_handover_confirmed,
  room_handover_confirmed_at,
  room_handover_confirmed_by,
  room_handover_confirmed_by_name,
  handover_deadline_at,
  expired_at,
  matched_lost_id,
  created_at,
  updated_at
) ON public.found_items TO anon, authenticated;

-- Fuzzy search was SECURITY INVOKER RETURNS SETOF the base table (SELECT *).
-- That fails once contacts and user_id are not selectable. Return the public
-- columns only. CREATE OR REPLACE cannot change the return type.
DROP FUNCTION IF EXISTS public.search_lost_items_fuzzy(text, text, text, int, real);
DROP FUNCTION IF EXISTS public.search_found_items_fuzzy(text, text, text, int, real);

CREATE FUNCTION public.search_lost_items_fuzzy(
  p_query text,
  p_category text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 10,
  p_threshold real DEFAULT 0.15
)
RETURNS TABLE (
  id uuid,
  tracking_code text,
  item_name text,
  category text,
  description text,
  location_lost text,
  location_place_name text,
  location_coords jsonb,
  date_lost timestamptz,
  status public.item_status,
  matched_found_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    li.id,
    li.tracking_code,
    li.item_name,
    li.category,
    li.description,
    li.location_lost,
    li.location_place_name,
    li.location_coords,
    li.date_lost,
    li.status,
    li.matched_found_id,
    li.created_at,
    li.updated_at
  FROM lost_items li
  WHERE
    (p_category IS NULL OR li.category = p_category)
    AND (p_status IS NULL OR li.status = p_status::item_status)
    AND (
      p_query IS NULL
      OR btrim(p_query) = ''
      OR (
        upper(btrim(p_query)) ~ '^(LOST|FOUND)-'
        AND li.tracking_code ILIKE upper(btrim(p_query)) || '%'
      )
      OR (
        NOT (upper(btrim(p_query)) ~ '^(LOST|FOUND)-')
        AND (
          similarity(coalesce(li.item_name, ''), btrim(p_query)) >= p_threshold
          OR similarity(coalesce(li.description, ''), btrim(p_query)) >= p_threshold
          OR similarity(coalesce(li.location_lost, ''), btrim(p_query)) >= p_threshold
          OR coalesce(li.item_name, '') % btrim(p_query)
          OR coalesce(li.description, '') % btrim(p_query)
          OR coalesce(li.location_lost, '') % btrim(p_query)
          OR li.tracking_code ILIKE '%' || btrim(p_query) || '%'
        )
      )
    )
  ORDER BY
    CASE
      WHEN p_query IS NOT NULL AND upper(btrim(p_query)) ~ '^(LOST|FOUND)-' THEN 0
      ELSE 1
    END,
    GREATEST(
      similarity(coalesce(li.item_name, ''), coalesce(btrim(p_query), '')),
      similarity(coalesce(li.description, ''), coalesce(btrim(p_query), '')),
      similarity(coalesce(li.location_lost, ''), coalesce(btrim(p_query), ''))
    ) DESC,
    li.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;

CREATE FUNCTION public.search_found_items_fuzzy(
  p_query text,
  p_category text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 10,
  p_threshold real DEFAULT 0.15
)
RETURNS TABLE (
  id uuid,
  tracking_code text,
  photo_url text,
  item_name text,
  category text,
  color text,
  brand text,
  description text,
  location_found text,
  location_place_name text,
  location_coords jsonb,
  date_found timestamptz,
  drop_off_location text,
  status public.item_status,
  room_handover_confirmed boolean,
  room_handover_confirmed_at timestamptz,
  room_handover_confirmed_by uuid,
  room_handover_confirmed_by_name text,
  handover_deadline_at timestamptz,
  expired_at timestamptz,
  matched_lost_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    fi.id,
    fi.tracking_code,
    fi.photo_url,
    fi.item_name,
    fi.category,
    fi.color,
    fi.brand,
    fi.description,
    fi.location_found,
    fi.location_place_name,
    fi.location_coords,
    fi.date_found,
    fi.drop_off_location,
    fi.status,
    fi.room_handover_confirmed,
    fi.room_handover_confirmed_at,
    fi.room_handover_confirmed_by,
    fi.room_handover_confirmed_by_name,
    fi.handover_deadline_at,
    fi.expired_at,
    fi.matched_lost_id,
    fi.created_at,
    fi.updated_at
  FROM found_items fi
  WHERE
    (p_category IS NULL OR fi.category = p_category)
    AND (p_status IS NULL OR fi.status = p_status::item_status)
    AND (
      p_query IS NULL
      OR btrim(p_query) = ''
      OR (
        upper(btrim(p_query)) ~ '^(LOST|FOUND)-'
        AND fi.tracking_code ILIKE upper(btrim(p_query)) || '%'
      )
      OR (
        NOT (upper(btrim(p_query)) ~ '^(LOST|FOUND)-')
        AND (
          similarity(coalesce(fi.item_name, ''), btrim(p_query)) >= p_threshold
          OR similarity(coalesce(fi.description, ''), btrim(p_query)) >= p_threshold
          OR similarity(coalesce(fi.location_found, ''), btrim(p_query)) >= p_threshold
          OR coalesce(fi.item_name, '') % btrim(p_query)
          OR coalesce(fi.description, '') % btrim(p_query)
          OR coalesce(fi.location_found, '') % btrim(p_query)
          OR fi.tracking_code ILIKE '%' || btrim(p_query) || '%'
        )
      )
    )
  ORDER BY
    CASE
      WHEN p_query IS NOT NULL AND upper(btrim(p_query)) ~ '^(LOST|FOUND)-' THEN 0
      ELSE 1
    END,
    GREATEST(
      similarity(coalesce(fi.item_name, ''), coalesce(btrim(p_query), '')),
      similarity(coalesce(fi.description, ''), coalesce(btrim(p_query), '')),
      similarity(coalesce(fi.location_found, ''), coalesce(btrim(p_query), ''))
    ) DESC,
    fi.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;

REVOKE ALL ON FUNCTION public.search_lost_items_fuzzy(text, text, text, int, real) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_found_items_fuzzy(text, text, text, int, real) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_lost_items_fuzzy(text, text, text, int, real) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_found_items_fuzzy(text, text, text, int, real) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.read_lost_items_private()
RETURNS SETOF public.lost_items
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.lost_items
  WHERE public.is_admin() OR user_id = auth.uid()
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.read_found_items_private()
RETURNS SETOF public.found_items
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.found_items
  WHERE public.is_admin() OR user_id = auth.uid()
  ORDER BY created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.read_lost_items_private() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_lost_items_private() FROM anon;
REVOKE ALL ON FUNCTION public.read_found_items_private() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_found_items_private() FROM anon;
GRANT EXECUTE ON FUNCTION public.read_lost_items_private() TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_found_items_private() TO authenticated;

-- Realtime payloads follow the publication, not column grants. Publish the
-- same public columns. user_id is omitted, so clients cannot filter on it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'publication supabase_realtime does not exist — skipping item realtime column lists';
    RETURN;
  END IF;

  ALTER TABLE public.lost_items REPLICA IDENTITY DEFAULT;
  ALTER TABLE public.found_items REPLICA IDENTITY DEFAULT;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'lost_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.lost_items';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'found_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.found_items';
  END IF;

  EXECUTE $pub$
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lost_items (
      id,
      tracking_code,
      item_name,
      category,
      description,
      location_lost,
      location_place_name,
      location_coords,
      date_lost,
      status,
      matched_found_id,
      created_at,
      updated_at
    )
  $pub$;

  EXECUTE $pub$
    ALTER PUBLICATION supabase_realtime ADD TABLE public.found_items (
      id,
      tracking_code,
      photo_url,
      item_name,
      category,
      color,
      brand,
      description,
      location_found,
      location_place_name,
      location_coords,
      date_found,
      drop_off_location,
      status,
      room_handover_confirmed,
      room_handover_confirmed_at,
      room_handover_confirmed_by,
      room_handover_confirmed_by_name,
      handover_deadline_at,
      expired_at,
      matched_lost_id,
      created_at,
      updated_at
    )
  $pub$;
END $$;
