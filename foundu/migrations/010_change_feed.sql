-- One row per table that GET /api/changes may name.
-- updated_at moves on insert, update, and delete. MAX(updated_at) on the
-- source table misses deletes, so the poll reads this table.
-- Platform tables (sessions, rate_limits, login_attempts, ai_slots,
-- ai_credentials, schema_migrations) are not in the feed.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE IF NOT EXISTS change_feed (
  table_name VARCHAR(64) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO change_feed (table_name, updated_at) VALUES
  ('accounts', UTC_TIMESTAMP(3)),
  ('admin_whitelist', UTC_TIMESTAMP(3)),
  ('agent_chat_logs', UTC_TIMESTAMP(3)),
  ('ai_usage', UTC_TIMESTAMP(3)),
  ('activity_logs', UTC_TIMESTAMP(3)),
  ('app_settings', UTC_TIMESTAMP(3)),
  ('articles', UTC_TIMESTAMP(3)),
  ('categories', UTC_TIMESTAMP(3)),
  ('contact_types', UTC_TIMESTAMP(3)),
  ('drop_off_locations', UTC_TIMESTAMP(3)),
  ('error_logs', UTC_TIMESTAMP(3)),
  ('found_items', UTC_TIMESTAMP(3)),
  ('help_pages', UTC_TIMESTAMP(3)),
  ('help_sections', UTC_TIMESTAMP(3)),
  ('locations', UTC_TIMESTAMP(3)),
  ('lost_items', UTC_TIMESTAMP(3)),
  ('match_dismissals', UTC_TIMESTAMP(3)),
  ('nfc_found_reports', UTC_TIMESTAMP(3)),
  ('nfc_tags', UTC_TIMESTAMP(3));

DROP TRIGGER IF EXISTS cf_accounts_ai;
CREATE TRIGGER cf_accounts_ai
AFTER INSERT ON accounts
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'accounts';

DROP TRIGGER IF EXISTS cf_accounts_au;
CREATE TRIGGER cf_accounts_au
AFTER UPDATE ON accounts
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'accounts';

DROP TRIGGER IF EXISTS cf_accounts_ad;
CREATE TRIGGER cf_accounts_ad
AFTER DELETE ON accounts
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'accounts';

DROP TRIGGER IF EXISTS cf_admin_whitelist_ai;
CREATE TRIGGER cf_admin_whitelist_ai
AFTER INSERT ON admin_whitelist
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'admin_whitelist';

DROP TRIGGER IF EXISTS cf_admin_whitelist_au;
CREATE TRIGGER cf_admin_whitelist_au
AFTER UPDATE ON admin_whitelist
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'admin_whitelist';

DROP TRIGGER IF EXISTS cf_admin_whitelist_ad;
CREATE TRIGGER cf_admin_whitelist_ad
AFTER DELETE ON admin_whitelist
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'admin_whitelist';

DROP TRIGGER IF EXISTS cf_agent_chat_logs_ai;
CREATE TRIGGER cf_agent_chat_logs_ai
AFTER INSERT ON agent_chat_logs
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'agent_chat_logs';

DROP TRIGGER IF EXISTS cf_agent_chat_logs_au;
CREATE TRIGGER cf_agent_chat_logs_au
AFTER UPDATE ON agent_chat_logs
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'agent_chat_logs';

DROP TRIGGER IF EXISTS cf_agent_chat_logs_ad;
CREATE TRIGGER cf_agent_chat_logs_ad
AFTER DELETE ON agent_chat_logs
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'agent_chat_logs';

DROP TRIGGER IF EXISTS cf_ai_usage_ai;
CREATE TRIGGER cf_ai_usage_ai
AFTER INSERT ON ai_usage
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'ai_usage';

DROP TRIGGER IF EXISTS cf_ai_usage_au;
CREATE TRIGGER cf_ai_usage_au
AFTER UPDATE ON ai_usage
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'ai_usage';

DROP TRIGGER IF EXISTS cf_ai_usage_ad;
CREATE TRIGGER cf_ai_usage_ad
AFTER DELETE ON ai_usage
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'ai_usage';

DROP TRIGGER IF EXISTS cf_activity_logs_ai;
CREATE TRIGGER cf_activity_logs_ai
AFTER INSERT ON activity_logs
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'activity_logs';

DROP TRIGGER IF EXISTS cf_activity_logs_au;
CREATE TRIGGER cf_activity_logs_au
AFTER UPDATE ON activity_logs
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'activity_logs';

DROP TRIGGER IF EXISTS cf_activity_logs_ad;
CREATE TRIGGER cf_activity_logs_ad
AFTER DELETE ON activity_logs
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'activity_logs';

DROP TRIGGER IF EXISTS cf_app_settings_ai;
CREATE TRIGGER cf_app_settings_ai
AFTER INSERT ON app_settings
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'app_settings';

DROP TRIGGER IF EXISTS cf_app_settings_au;
CREATE TRIGGER cf_app_settings_au
AFTER UPDATE ON app_settings
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'app_settings';

DROP TRIGGER IF EXISTS cf_app_settings_ad;
CREATE TRIGGER cf_app_settings_ad
AFTER DELETE ON app_settings
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'app_settings';

DROP TRIGGER IF EXISTS cf_articles_ai;
CREATE TRIGGER cf_articles_ai
AFTER INSERT ON articles
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'articles';

DROP TRIGGER IF EXISTS cf_articles_au;
CREATE TRIGGER cf_articles_au
AFTER UPDATE ON articles
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'articles';

DROP TRIGGER IF EXISTS cf_articles_ad;
CREATE TRIGGER cf_articles_ad
AFTER DELETE ON articles
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'articles';

DROP TRIGGER IF EXISTS cf_categories_ai;
CREATE TRIGGER cf_categories_ai
AFTER INSERT ON categories
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'categories';

DROP TRIGGER IF EXISTS cf_categories_au;
CREATE TRIGGER cf_categories_au
AFTER UPDATE ON categories
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'categories';

DROP TRIGGER IF EXISTS cf_categories_ad;
CREATE TRIGGER cf_categories_ad
AFTER DELETE ON categories
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'categories';

DROP TRIGGER IF EXISTS cf_contact_types_ai;
CREATE TRIGGER cf_contact_types_ai
AFTER INSERT ON contact_types
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'contact_types';

DROP TRIGGER IF EXISTS cf_contact_types_au;
CREATE TRIGGER cf_contact_types_au
AFTER UPDATE ON contact_types
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'contact_types';

DROP TRIGGER IF EXISTS cf_contact_types_ad;
CREATE TRIGGER cf_contact_types_ad
AFTER DELETE ON contact_types
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'contact_types';

DROP TRIGGER IF EXISTS cf_drop_off_locations_ai;
CREATE TRIGGER cf_drop_off_locations_ai
AFTER INSERT ON drop_off_locations
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'drop_off_locations';

DROP TRIGGER IF EXISTS cf_drop_off_locations_au;
CREATE TRIGGER cf_drop_off_locations_au
AFTER UPDATE ON drop_off_locations
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'drop_off_locations';

DROP TRIGGER IF EXISTS cf_drop_off_locations_ad;
CREATE TRIGGER cf_drop_off_locations_ad
AFTER DELETE ON drop_off_locations
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'drop_off_locations';

DROP TRIGGER IF EXISTS cf_error_logs_ai;
CREATE TRIGGER cf_error_logs_ai
AFTER INSERT ON error_logs
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'error_logs';

DROP TRIGGER IF EXISTS cf_error_logs_au;
CREATE TRIGGER cf_error_logs_au
AFTER UPDATE ON error_logs
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'error_logs';

DROP TRIGGER IF EXISTS cf_error_logs_ad;
CREATE TRIGGER cf_error_logs_ad
AFTER DELETE ON error_logs
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'error_logs';

DROP TRIGGER IF EXISTS cf_found_items_ai;
CREATE TRIGGER cf_found_items_ai
AFTER INSERT ON found_items
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'found_items';

DROP TRIGGER IF EXISTS cf_found_items_au;
CREATE TRIGGER cf_found_items_au
AFTER UPDATE ON found_items
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'found_items';

DROP TRIGGER IF EXISTS cf_found_items_ad;
CREATE TRIGGER cf_found_items_ad
AFTER DELETE ON found_items
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'found_items';

DROP TRIGGER IF EXISTS cf_help_pages_ai;
CREATE TRIGGER cf_help_pages_ai
AFTER INSERT ON help_pages
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'help_pages';

DROP TRIGGER IF EXISTS cf_help_pages_au;
CREATE TRIGGER cf_help_pages_au
AFTER UPDATE ON help_pages
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'help_pages';

DROP TRIGGER IF EXISTS cf_help_pages_ad;
CREATE TRIGGER cf_help_pages_ad
AFTER DELETE ON help_pages
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'help_pages';

DROP TRIGGER IF EXISTS cf_help_sections_ai;
CREATE TRIGGER cf_help_sections_ai
AFTER INSERT ON help_sections
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'help_sections';

DROP TRIGGER IF EXISTS cf_help_sections_au;
CREATE TRIGGER cf_help_sections_au
AFTER UPDATE ON help_sections
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'help_sections';

DROP TRIGGER IF EXISTS cf_help_sections_ad;
CREATE TRIGGER cf_help_sections_ad
AFTER DELETE ON help_sections
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'help_sections';

DROP TRIGGER IF EXISTS cf_locations_ai;
CREATE TRIGGER cf_locations_ai
AFTER INSERT ON locations
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'locations';

DROP TRIGGER IF EXISTS cf_locations_au;
CREATE TRIGGER cf_locations_au
AFTER UPDATE ON locations
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'locations';

DROP TRIGGER IF EXISTS cf_locations_ad;
CREATE TRIGGER cf_locations_ad
AFTER DELETE ON locations
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'locations';

DROP TRIGGER IF EXISTS cf_lost_items_ai;
CREATE TRIGGER cf_lost_items_ai
AFTER INSERT ON lost_items
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'lost_items';

DROP TRIGGER IF EXISTS cf_lost_items_au;
CREATE TRIGGER cf_lost_items_au
AFTER UPDATE ON lost_items
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'lost_items';

DROP TRIGGER IF EXISTS cf_lost_items_ad;
CREATE TRIGGER cf_lost_items_ad
AFTER DELETE ON lost_items
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'lost_items';

DROP TRIGGER IF EXISTS cf_match_dismissals_ai;
CREATE TRIGGER cf_match_dismissals_ai
AFTER INSERT ON match_dismissals
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'match_dismissals';

DROP TRIGGER IF EXISTS cf_match_dismissals_au;
CREATE TRIGGER cf_match_dismissals_au
AFTER UPDATE ON match_dismissals
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'match_dismissals';

DROP TRIGGER IF EXISTS cf_match_dismissals_ad;
CREATE TRIGGER cf_match_dismissals_ad
AFTER DELETE ON match_dismissals
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'match_dismissals';

DROP TRIGGER IF EXISTS cf_nfc_found_reports_ai;
CREATE TRIGGER cf_nfc_found_reports_ai
AFTER INSERT ON nfc_found_reports
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'nfc_found_reports';

DROP TRIGGER IF EXISTS cf_nfc_found_reports_au;
CREATE TRIGGER cf_nfc_found_reports_au
AFTER UPDATE ON nfc_found_reports
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'nfc_found_reports';

DROP TRIGGER IF EXISTS cf_nfc_found_reports_ad;
CREATE TRIGGER cf_nfc_found_reports_ad
AFTER DELETE ON nfc_found_reports
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'nfc_found_reports';

DROP TRIGGER IF EXISTS cf_nfc_tags_ai;
CREATE TRIGGER cf_nfc_tags_ai
AFTER INSERT ON nfc_tags
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'nfc_tags';

DROP TRIGGER IF EXISTS cf_nfc_tags_au;
CREATE TRIGGER cf_nfc_tags_au
AFTER UPDATE ON nfc_tags
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'nfc_tags';

DROP TRIGGER IF EXISTS cf_nfc_tags_ad;
CREATE TRIGGER cf_nfc_tags_ad
AFTER DELETE ON nfc_tags
FOR EACH ROW
UPDATE change_feed SET updated_at = UTC_TIMESTAMP(3) WHERE table_name = 'nfc_tags';
