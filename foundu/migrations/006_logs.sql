-- Activity and error logs. Students can insert through the app. They cannot
-- read or delete. Admins read. Cleanup is the cron job, not a user grant.
-- Block events are sampled here later. Do not log every 429.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS activity_logs (
  id CHAR(36) NOT NULL,
  action VARCHAR(255) NOT NULL,
  action_type VARCHAR(64) NULL,
  target_type VARCHAR(64) NULL,
  target_id VARCHAR(64) NULL,
  target_name VARCHAR(255) NULL,
  user_name VARCHAR(255) NULL,
  details JSON NULL,
  user_id CHAR(36) NULL,
  user_email VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_activity_logs_created (created_at),
  KEY idx_activity_logs_user_created (user_id, created_at),
  KEY idx_activity_logs_updated (updated_at),
  CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS error_logs (
  id CHAR(36) NOT NULL,
  message TEXT NOT NULL,
  stack MEDIUMTEXT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  source ENUM('client', 'server', 'api', 'database', 'unknown') NOT NULL DEFAULT 'unknown',
  url VARCHAR(2048) NULL,
  user_id CHAR(36) NULL,
  user_email VARCHAR(255) NULL,
  user_agent VARCHAR(512) NULL,
  metadata JSON NULL,
  resolved TINYINT(1) NOT NULL DEFAULT 0,
  resolved_at DATETIME(3) NULL,
  resolved_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_error_logs_created (created_at),
  KEY idx_error_logs_resolved_created (resolved, created_at),
  KEY idx_error_logs_user (user_id),
  KEY idx_error_logs_updated (updated_at),
  CONSTRAINT fk_error_logs_user FOREIGN KEY (user_id) REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_error_logs_resolved_by FOREIGN KEY (resolved_by) REFERENCES accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
