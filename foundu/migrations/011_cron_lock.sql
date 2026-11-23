-- One row so two DirectAdmin cron runs cannot overlap.
-- The runner inserts its own id. If the row is still locked, the second
-- process exits immediately. A crashed run leaves the row until locked_until,
-- then the next run takes it. This is not a visitor-facing table.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS cron_lock (
  name VARCHAR(32) NOT NULL,
  owner CHAR(36) NOT NULL,
  locked_until DATETIME(3) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
