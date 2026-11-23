-- The live user table. profiles and student_accounts are not recreated.
-- A student may update display_name, photo_url, nickname, shown_name,
-- and has_seen_tutorial. Other columns, inserts, and deletes need
-- SET @foundu_allow_privileged = 1 on this connection. Clear it after.
-- The app connection is not persistent, so the flag dies with the request.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS accounts (
  id CHAR(36) NOT NULL,
  student_id CHAR(5) NULL,
  linked_uid CHAR(36) NULL,
  email VARCHAR(255) NOT NULL DEFAULT '',
  display_name VARCHAR(255) NOT NULL DEFAULT '',
  photo_url VARCHAR(2048) NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  nickname VARCHAR(100) NULL,
  shown_name VARCHAR(40) NULL,
  is_student_verified TINYINT(1) NOT NULL DEFAULT 0,
  auth_methods JSON NOT NULL DEFAULT ('[]'),
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  has_seen_tutorial TINYINT(1) NOT NULL DEFAULT 0,
  ban_status ENUM('none', 'banned', 'timeout') NOT NULL DEFAULT 'none',
  ban_reason VARCHAR(500) NULL,
  banned_at DATETIME(3) NULL,
  banned_by CHAR(36) NULL,
  timeout_until DATETIME(3) NULL,
  school_password_hash VARCHAR(255) NULL,
  current_password_hash VARCHAR(255) NULL,
  has_logged_in_once TINYINT(1) NOT NULL DEFAULT 0,
  pin_hash VARCHAR(255) NULL,
  passkey_credentials JSON NOT NULL DEFAULT ('[]'),
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  import_batch_id VARCHAR(64) NULL,
  grade_level VARCHAR(16) NULL,
  room_number VARCHAR(16) NULL,
  is_registered TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_student_id (student_id),
  KEY idx_accounts_linked_uid (linked_uid),
  KEY idx_accounts_email (email),
  KEY idx_accounts_status (status),
  KEY idx_accounts_updated (updated_at),
  CONSTRAINT fk_accounts_banned_by FOREIGN KEY (banned_by) REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT chk_accounts_student_id CHECK (student_id IS NULL OR student_id REGEXP '^[0-9]{5}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- linked_uid is indexed but not a foreign key. New rows point it at their
-- own id, and a self-reference on insert is more trouble than the check is worth.

DROP TRIGGER IF EXISTS accounts_bi_guard;
DROP TRIGGER IF EXISTS accounts_bu_guard;
DROP TRIGGER IF EXISTS accounts_bd_guard;

DELIMITER $$

CREATE TRIGGER accounts_bi_guard
BEFORE INSERT ON accounts
FOR EACH ROW
BEGIN
  IF IFNULL(@foundu_allow_privileged, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'account insert is not allowed';
  END IF;
END$$

CREATE TRIGGER accounts_bu_guard
BEFORE UPDATE ON accounts
FOR EACH ROW
BEGIN
  IF IFNULL(@foundu_allow_privileged, 0) <> 1 THEN
    IF NEW.role <> OLD.role
       OR NOT (NEW.pin_hash <=> OLD.pin_hash)
       OR NOT (NEW.current_password_hash <=> OLD.current_password_hash)
       OR NOT (NEW.school_password_hash <=> OLD.school_password_hash)
       OR NOT (NEW.student_id <=> OLD.student_id)
       OR NEW.is_student_verified <> OLD.is_student_verified
       OR NEW.ban_status <> OLD.ban_status
       OR NOT (NEW.ban_reason <=> OLD.ban_reason)
       OR NOT (NEW.banned_at <=> OLD.banned_at)
       OR NOT (NEW.banned_by <=> OLD.banned_by)
       OR NOT (NEW.timeout_until <=> OLD.timeout_until)
       OR NEW.status <> OLD.status
       OR NOT (NEW.passkey_credentials <=> OLD.passkey_credentials)
       OR NOT (NEW.email <=> OLD.email)
       OR NOT (NEW.linked_uid <=> OLD.linked_uid)
       OR NOT (NEW.grade_level <=> OLD.grade_level)
       OR NOT (NEW.room_number <=> OLD.room_number)
       OR NOT (NEW.import_batch_id <=> OLD.import_batch_id)
       OR NEW.is_registered <> OLD.is_registered
       OR NEW.has_logged_in_once <> OLD.has_logged_in_once
       OR NEW.must_change_password <> OLD.must_change_password
       OR NOT (NEW.auth_methods <=> OLD.auth_methods)
       OR NOT (NEW.first_name <=> OLD.first_name)
       OR NOT (NEW.last_name <=> OLD.last_name)
       OR NOT (NEW.created_at <=> OLD.created_at)
    THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'account change is not allowed';
    END IF;
  END IF;
END$$

CREATE TRIGGER accounts_bd_guard
BEFORE DELETE ON accounts
FOR EACH ROW
BEGIN
  IF IFNULL(@foundu_allow_privileged, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'account delete is not allowed';
  END IF;
END$$

DELIMITER ;
