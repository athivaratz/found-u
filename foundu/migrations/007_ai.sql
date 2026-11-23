-- AI quota is a count of ai_usage in the last minute and the last hour,
-- per account and for the whole system. Cron deletes rows older than a few hours.
-- ai_slots is the concurrency lease. Take one by deleting expired rows, then
-- inserting if the live count is still under AI_MAX_CONCURRENCY. GET_LOCK
-- around that check is enough. There is no Redis.
-- ai_credentials holds sodium_crypto_secretbox ciphertext. Nonces are 24 bytes.
-- The row wins over env when it is present. Students never select this table.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS ai_usage (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  endpoint VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ai_usage_user_created (user_id, created_at),
  KEY idx_ai_usage_created (created_at),
  KEY idx_ai_usage_updated (updated_at),
  CONSTRAINT fk_ai_usage_user FOREIGN KEY (user_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id CHAR(36) NULL,
  token CHAR(36) NOT NULL,
  acquired_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_slots_token (token),
  KEY idx_ai_slots_expires (expires_at),
  KEY idx_ai_slots_account (account_id),
  CONSTRAINT fk_ai_slots_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_credentials (
  id VARCHAR(32) NOT NULL,
  provider ENUM('auto', 'gemini', 'openrouter', 'none') NOT NULL DEFAULT 'auto',
  gemini_ciphertext VARBINARY(1024) NULL,
  gemini_nonce BINARY(24) NULL,
  openrouter_ciphertext VARBINARY(1024) NULL,
  openrouter_nonce BINARY(24) NULL,
  openrouter_model VARCHAR(191) NULL,
  configured_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_chat_logs (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  session_id VARCHAR(64) NULL,
  provider VARCHAR(32) NOT NULL,
  model VARCHAR(191) NULL,
  settings_snapshot JSON NULL,
  routing JSON NULL,
  request_messages JSON NULL,
  response_parts JSON NULL,
  steps JSON NULL,
  truncated TINYINT(1) NOT NULL DEFAULT 0,
  finish_reason VARCHAR(64) NULL,
  error TEXT NULL,
  duration_ms INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_agent_chat_logs_created (created_at),
  KEY idx_agent_chat_logs_user_created (user_id, created_at),
  KEY idx_agent_chat_logs_session (session_id),
  KEY idx_agent_chat_logs_updated (updated_at),
  CONSTRAINT fk_agent_chat_logs_user FOREIGN KEY (user_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
