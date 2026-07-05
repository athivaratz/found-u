-- TRGM fuzzy search: indexes + RPC functions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Additional GIN indexes for columns used in fuzzy search
CREATE INDEX IF NOT EXISTS idx_lost_items_description_trgm
  ON lost_items USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lost_items_location_lost_trgm
  ON lost_items USING gin (location_lost gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lost_items_tracking_code_trgm
  ON lost_items USING gin (tracking_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_found_items_item_name_trgm
  ON found_items USING gin (item_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_found_items_location_found_trgm
  ON found_items USING gin (location_found gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_found_items_tracking_code_trgm
  ON found_items USING gin (tracking_code gin_trgm_ops);

CREATE OR REPLACE FUNCTION search_lost_items_fuzzy(
  p_query text,
  p_category text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 10,
  p_threshold real DEFAULT 0.15
)
RETURNS SETOF lost_items
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT li.*
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

CREATE OR REPLACE FUNCTION search_found_items_fuzzy(
  p_query text,
  p_category text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 10,
  p_threshold real DEFAULT 0.15
)
RETURNS SETOF found_items
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT fi.*
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

GRANT EXECUTE ON FUNCTION search_lost_items_fuzzy(text, text, text, int, real) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_found_items_fuzzy(text, text, text, int, real) TO authenticated, anon;
