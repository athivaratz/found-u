-- Lost and found reports, plus pairs an admin has dismissed.
-- Confirm and unmatch are PHP transactions with SELECT ... FOR UPDATE.
-- There is no stored procedure, and no grant that lets a student call one.
-- Tracking codes are looked up exactly (LOST- / FOUND- plus 6 characters).
-- Fuzzy search is LIKE plus a PHP trigram, capped around 300 rows. Status
-- and category indexes narrow that scan. MariaDB has no ngram parser.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS lost_items (
  id CHAR(36) NOT NULL,
  tracking_code VARCHAR(32) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(64) NOT NULL,
  description TEXT NULL,
  location_lost VARCHAR(255) NOT NULL,
  location_place_name VARCHAR(255) NULL,
  location_coords JSON NULL,
  date_lost DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  contacts JSON NOT NULL DEFAULT ('[]'),
  user_id CHAR(36) NULL,
  student_id CHAR(5) NULL,
  status ENUM('searching', 'pending_room_confirm', 'found', 'claimed', 'expired') NOT NULL DEFAULT 'searching',
  matched_found_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_lost_items_tracking_code (tracking_code),
  KEY idx_lost_items_user_created (user_id, created_at),
  KEY idx_lost_items_student_created (student_id, created_at),
  KEY idx_lost_items_status_created (status, created_at),
  KEY idx_lost_items_status_date (status, date_lost),
  KEY idx_lost_items_category (category),
  KEY idx_lost_items_matched_found (matched_found_id),
  KEY idx_lost_items_updated (updated_at),
  CONSTRAINT fk_lost_items_user FOREIGN KEY (user_id) REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_lost_items_student FOREIGN KEY (student_id) REFERENCES accounts (student_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS found_items (
  id CHAR(36) NOT NULL,
  tracking_code VARCHAR(32) NOT NULL,
  photo_url VARCHAR(2048) NULL,
  item_name VARCHAR(255) NULL,
  category VARCHAR(64) NULL,
  color VARCHAR(64) NULL,
  brand VARCHAR(64) NULL,
  description TEXT NOT NULL,
  location_found VARCHAR(255) NOT NULL,
  location_place_name VARCHAR(255) NULL,
  location_coords JSON NULL,
  date_found DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  drop_off_location VARCHAR(64) NOT NULL DEFAULT 'personnel_office',
  finder_contacts JSON NULL,
  user_id CHAR(36) NULL,
  status ENUM('searching', 'pending_room_confirm', 'found', 'claimed', 'expired') NOT NULL DEFAULT 'pending_room_confirm',
  room_handover_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  room_handover_confirmed_at DATETIME(3) NULL,
  room_handover_confirmed_by CHAR(36) NULL,
  room_handover_confirmed_by_name VARCHAR(255) NULL,
  handover_deadline_at DATETIME(3) NULL,
  expired_at DATETIME(3) NULL,
  matched_lost_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_found_items_tracking_code (tracking_code),
  KEY idx_found_items_user_created (user_id, created_at),
  KEY idx_found_items_status_created (status, created_at),
  KEY idx_found_items_status_date (status, date_found),
  KEY idx_found_items_pending_deadline (status, handover_deadline_at),
  KEY idx_found_items_category (category),
  KEY idx_found_items_matched_lost (matched_lost_id),
  KEY idx_found_items_updated (updated_at),
  CONSTRAINT fk_found_items_user FOREIGN KEY (user_id) REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_found_items_confirmed_by FOREIGN KEY (room_handover_confirmed_by) REFERENCES accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_dismissals (
  id CHAR(36) NOT NULL,
  lost_id CHAR(36) NOT NULL,
  found_id CHAR(36) NOT NULL,
  dismissed_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_dismissals_pair (lost_id, found_id),
  KEY idx_match_dismissals_found (found_id),
  KEY idx_match_dismissals_updated (updated_at),
  CONSTRAINT fk_match_dismissals_lost FOREIGN KEY (lost_id) REFERENCES lost_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_match_dismissals_found FOREIGN KEY (found_id) REFERENCES found_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_match_dismissals_by FOREIGN KEY (dismissed_by) REFERENCES accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cross links are added after both item tables exist.
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lost_items'
    AND CONSTRAINT_NAME = 'fk_lost_items_matched_found'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE lost_items ADD CONSTRAINT fk_lost_items_matched_found FOREIGN KEY (matched_found_id) REFERENCES found_items (id) ON DELETE SET NULL',
  'SET @fk_noop := 1'
);
PREPARE foundu_stmt FROM @fk_sql;
EXECUTE foundu_stmt;
DEALLOCATE PREPARE foundu_stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'found_items'
    AND CONSTRAINT_NAME = 'fk_found_items_matched_lost'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE found_items ADD CONSTRAINT fk_found_items_matched_lost FOREIGN KEY (matched_lost_id) REFERENCES lost_items (id) ON DELETE SET NULL',
  'SET @fk_noop := 1'
);
PREPARE foundu_stmt FROM @fk_sql;
EXECUTE foundu_stmt;
DEALLOCATE PREPARE foundu_stmt;
