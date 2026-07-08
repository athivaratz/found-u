-- Agent search performance indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_lost_items_tracking_code ON lost_items (tracking_code);
CREATE INDEX IF NOT EXISTS idx_lost_items_status_created ON lost_items (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_found_items_status_created ON found_items (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lost_items_item_name_trgm ON lost_items USING gin (item_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_found_items_description_trgm ON found_items USING gin (description gin_trgm_ops);;
