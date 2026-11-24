-- NFC tags and found reports. Public resolve must not select contacts.
-- tag_uid is unique when it is set. Store NULL when there is no hardware id,
-- not an empty string. MariaDB treats each NULL as distinct.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS nfc_tags (
  id VARCHAR(32) NOT NULL,
  tag_uid VARCHAR(64) NULL,
  owner_id CHAR(36) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(64) NOT NULL,
  description TEXT NULL,
  contacts JSON NOT NULL DEFAULT ('[]'),
  status ENUM('active', 'lost', 'returned', 'disabled') NOT NULL DEFAULT 'active',
  read_only_locked TINYINT(1) NOT NULL DEFAULT 0,
  lost_item_id CHAR(36) NULL,
  last_found_report_id CHAR(36) NULL,
  ndef_written_at DATETIME(3) NULL,
  registered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_nfc_tags_tag_uid (tag_uid),
  KEY idx_nfc_tags_owner_registered (owner_id, registered_at),
  KEY idx_nfc_tags_lost_item (lost_item_id),
  KEY idx_nfc_tags_updated (updated_at),
  CONSTRAINT fk_nfc_tags_owner FOREIGN KEY (owner_id) REFERENCES accounts (id) ON DELETE CASCADE,
  CONSTRAINT fk_nfc_tags_lost_item FOREIGN KEY (lost_item_id) REFERENCES lost_items (id) ON DELETE SET NULL,
  CONSTRAINT chk_nfc_tags_uid CHECK (tag_uid IS NULL OR CHAR_LENGTH(tag_uid) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nfc_found_reports (
  id CHAR(36) NOT NULL,
  tag_id VARCHAR(32) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  finder_user_id CHAR(36) NOT NULL,
  finder_message TEXT NOT NULL,
  location_found VARCHAR(255) NULL,
  location_coords JSON NULL,
  finder_contacts JSON NULL,
  status ENUM('pending', 'viewed', 'resolved') NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_nfc_found_reports_owner_created (owner_id, created_at),
  KEY idx_nfc_found_reports_tag_created (tag_id, created_at),
  KEY idx_nfc_found_reports_finder_created (finder_user_id, created_at),
  KEY idx_nfc_found_reports_updated (updated_at),
  CONSTRAINT fk_nfc_found_reports_tag FOREIGN KEY (tag_id) REFERENCES nfc_tags (id) ON DELETE CASCADE,
  CONSTRAINT fk_nfc_found_reports_owner FOREIGN KEY (owner_id) REFERENCES accounts (id) ON DELETE CASCADE,
  CONSTRAINT fk_nfc_found_reports_finder FOREIGN KEY (finder_user_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'nfc_tags'
    AND CONSTRAINT_NAME = 'fk_nfc_tags_last_report'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE nfc_tags ADD CONSTRAINT fk_nfc_tags_last_report FOREIGN KEY (last_found_report_id) REFERENCES nfc_found_reports (id) ON DELETE SET NULL',
  'SET @fk_noop := 1'
);
PREPARE foundu_stmt FROM @fk_sql;
EXECUTE foundu_stmt;
DEALLOCATE PREPARE foundu_stmt;
