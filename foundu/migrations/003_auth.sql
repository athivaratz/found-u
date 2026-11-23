-- Sessions, passkey challenges, login lockout, and fixed-window counters.
-- Passkey challenges are rows with kind passkey_login or passkey_register
-- and a 5 minute expires_at. The cookie stores a random token. The table
-- stores SHA-256 of that token, hex, in token_hash.
-- rate_limits is one upsert: INSERT ... ON DUPLICATE KEY UPDATE hits = hits + 1.
-- login_attempts is the lockout log. PIN: 5 failures locks that account 15 minutes.
-- Password and passkey: 20 failures from one IP locks that IP for an hour.
-- Cron deletes expired sessions, old attempts, and old rate-limit windows.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  account_id CHAR(36) NULL,
  kind ENUM('browser', 'passkey_login', 'passkey_register') NOT NULL DEFAULT 'browser',
  csrf_token CHAR(64) NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  challenge_json JSON NULL,
  ai_verified_until DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_account (account_id, revoked_at),
  KEY idx_sessions_expires (expires_at),
  KEY idx_sessions_kind_expires (kind, expires_at),
  CONSTRAINT fk_sessions_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id CHAR(5) NULL,
  account_id CHAR(36) NULL,
  ip VARCHAR(45) NOT NULL,
  kind ENUM('password', 'pin', 'passkey') NOT NULL,
  succeeded TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_login_attempts_student (student_id, kind, succeeded, created_at),
  KEY idx_login_attempts_ip (ip, succeeded, created_at),
  KEY idx_login_attempts_account (account_id, created_at),
  KEY idx_login_attempts_created (created_at),
  CONSTRAINT fk_login_attempts_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  scope VARCHAR(64) NOT NULL,
  subject VARCHAR(128) NOT NULL,
  window_start DATETIME(3) NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, subject, window_start),
  KEY idx_rate_limits_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS passkey_lookup (
  credential_id VARCHAR(512) NOT NULL,
  student_id CHAR(5) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (credential_id),
  KEY idx_passkey_lookup_student (student_id),
  CONSTRAINT fk_passkey_lookup_student FOREIGN KEY (student_id) REFERENCES accounts (student_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_whitelist (
  email VARCHAR(255) NOT NULL,
  added_by CHAR(36) NULL,
  added_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  note VARCHAR(500) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (email),
  KEY idx_admin_whitelist_updated (updated_at),
  CONSTRAINT fk_admin_whitelist_added_by FOREIGN KEY (added_by) REFERENCES accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
