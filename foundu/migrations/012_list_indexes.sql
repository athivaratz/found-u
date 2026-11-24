-- Keyset lists walk (created_at, id). Status indexes do not cover an
-- unfiltered admin list, and accounts had no created_at index at all.
-- MariaDB 10.11 accepts ADD INDEX IF NOT EXISTS.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

ALTER TABLE lost_items ADD INDEX IF NOT EXISTS idx_lost_items_created_id (created_at, id);
ALTER TABLE found_items ADD INDEX IF NOT EXISTS idx_found_items_created_id (created_at, id);
ALTER TABLE accounts ADD INDEX IF NOT EXISTS idx_accounts_created_id (created_at, id);
ALTER TABLE match_dismissals ADD INDEX IF NOT EXISTS idx_match_dismissals_created_id (created_at, id);
