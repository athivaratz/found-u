-- Objects we have agreed to let a browser upload.
-- The key also carries the account id (avatars/{accountId}/…).
-- This row is the copy delete checks. Both have to match.
-- Not in change_feed: the browser does not poll it.
-- Deleting the account removes the row. The R2 object is a separate delete.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS storage_objects (
  object_key VARCHAR(512) NOT NULL,
  account_id CHAR(36) NOT NULL,
  purpose ENUM('avatar', 'found', 'blog', 'help', 'branding') NOT NULL,
  content_type VARCHAR(64) NOT NULL,
  bytes INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (object_key),
  KEY idx_storage_objects_account (account_id, created_at),
  CONSTRAINT fk_storage_objects_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
