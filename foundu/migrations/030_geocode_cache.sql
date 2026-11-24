-- Nominatim answers are cached here so the admin place search does not
-- hit the upstream on every keypress, and so a short outage still has
-- yesterday's result. The query is not a secret. Cron drops old rows.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS geocode_cache (
  query_hash CHAR(64) NOT NULL,
  query_text VARCHAR(200) NOT NULL,
  payload JSON NOT NULL,
  fetched_at DATETIME(3) NOT NULL,
  PRIMARY KEY (query_hash),
  KEY idx_geocode_cache_fetched (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
