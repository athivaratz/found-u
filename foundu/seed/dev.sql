-- Local starter data. Same category, location, contact, and drop-off values
-- the current forms already know. Re-running does not overwrite a row that
-- is already there, so an admin edit survives a second `make seed`.
-- No admin user and no passwords in this file.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';

INSERT INTO categories (id, value, label, icon, sort_order)
SELECT UUID(), 'wallet', 'กระเป๋าสตางค์', '💰', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE value = 'wallet');
INSERT INTO categories (id, value, label, icon, sort_order)
SELECT UUID(), 'phone', 'โทรศัพท์', '📱', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE value = 'phone');
INSERT INTO categories (id, value, label, icon, sort_order)
SELECT UUID(), 'keys', 'กุญแจ', '🔑', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE value = 'keys');
INSERT INTO categories (id, value, label, icon, sort_order)
SELECT UUID(), 'bag', 'กระเป๋า', '👜', 4 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE value = 'bag');
INSERT INTO categories (id, value, label, icon, sort_order)
SELECT UUID(), 'electronics', 'อิเล็กทรอนิกส์', '💻', 5 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE value = 'electronics');
INSERT INTO categories (id, value, label, icon, sort_order)
SELECT UUID(), 'documents', 'เอกสาร', '📄', 6 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE value = 'documents');
INSERT INTO categories (id, value, label, icon, sort_order)
SELECT UUID(), 'clothing', 'เสื้อผ้า', '👕', 7 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE value = 'clothing');
INSERT INTO categories (id, value, label, icon, sort_order)
SELECT UUID(), 'accessories', 'เครื่องประดับ', '💍', 8 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE value = 'accessories');
INSERT INTO categories (id, value, label, icon, sort_order)
SELECT UUID(), 'other', 'อื่นๆ', '📦', 9 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE value = 'other');

INSERT INTO locations (id, value, label, sort_order)
SELECT UUID(), 'admin_office', 'ห้องธุรการ', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE value = 'admin_office');
INSERT INTO locations (id, value, label, sort_order)
SELECT UUID(), 'canteen', 'โรงอาหาร', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE value = 'canteen');
INSERT INTO locations (id, value, label, sort_order)
SELECT UUID(), 'library', 'ห้องสมุด', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE value = 'library');
INSERT INTO locations (id, value, label, sort_order)
SELECT UUID(), 'security', 'ห้องรปภ.', 4 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE value = 'security');
INSERT INTO locations (id, value, label, sort_order)
SELECT UUID(), 'building_1', 'ตึก 1', 5 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE value = 'building_1');
INSERT INTO locations (id, value, label, sort_order)
SELECT UUID(), 'building_2', 'ตึก 2', 6 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE value = 'building_2');
INSERT INTO locations (id, value, label, sort_order)
SELECT UUID(), 'field', 'สนามกีฬา', 7 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE value = 'field');
INSERT INTO locations (id, value, label, sort_order)
SELECT UUID(), 'parking', 'ลานจอดรถ', 8 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE value = 'parking');
INSERT INTO locations (id, value, label, sort_order)
SELECT UUID(), 'other', 'อื่นๆ', 9 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE value = 'other');

INSERT INTO contact_types (id, value, label, icon, placeholder, sort_order)
SELECT UUID(), 'phone', 'เบอร์โทรศัพท์', '📞', '0812345678', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_types WHERE value = 'phone');
INSERT INTO contact_types (id, value, label, icon, placeholder, sort_order)
SELECT UUID(), 'line', 'LINE ID', '💬', '@lineid', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_types WHERE value = 'line');
INSERT INTO contact_types (id, value, label, icon, placeholder, sort_order)
SELECT UUID(), 'instagram', 'Instagram', '📷', '@username', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_types WHERE value = 'instagram');
INSERT INTO contact_types (id, value, label, icon, placeholder, sort_order)
SELECT UUID(), 'facebook', 'Facebook', '📘', 'ชื่อ Facebook', 4 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_types WHERE value = 'facebook');
INSERT INTO contact_types (id, value, label, icon, placeholder, sort_order)
SELECT UUID(), 'email', 'Email', '📧', 'email@example.com', 5 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_types WHERE value = 'email');

INSERT INTO drop_off_locations (id, value, label, sort_order)
SELECT UUID(), 'personnel_office', 'ห้องบุคคล (ห้องปกครอง)', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM drop_off_locations WHERE value = 'personnel_office');
INSERT INTO drop_off_locations (id, value, label, sort_order)
SELECT UUID(), 'admin_office', 'ห้องธุรการ', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM drop_off_locations WHERE value = 'admin_office');
INSERT INTO drop_off_locations (id, value, label, sort_order)
SELECT UUID(), 'canteen', 'โรงอาหาร', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM drop_off_locations WHERE value = 'canteen');
INSERT INTO drop_off_locations (id, value, label, sort_order)
SELECT UUID(), 'library', 'ห้องสมุด', 4 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM drop_off_locations WHERE value = 'library');
INSERT INTO drop_off_locations (id, value, label, sort_order)
SELECT UUID(), 'security', 'ห้องรปภ.', 5 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM drop_off_locations WHERE value = 'security');
INSERT INTO drop_off_locations (id, value, label, sort_order)
SELECT UUID(), 'other', 'อื่นๆ', 6 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM drop_off_locations WHERE value = 'other');

INSERT INTO app_settings (id, settings)
SELECT 'default', '{
  "ogTitle": "Found-U | ระบบแจ้งของหาย-ของเจอ",
  "ogDescription": "ระบบแจ้งของหายและของเจอสำหรับโรงเรียน โดยนร.บด.๒ - แจ้งง่าย ติดตามสะดวก",
  "schoolName": "โรงเรียน",
  "aiRateLimitEnabled": true,
  "aiRateLimitPerMinute": 5,
  "aiRateLimitPerHour": 30,
  "aiRateLimitMessage": "คุณใช้งาน AI บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  "systemAiRateLimitEnabled": true,
  "systemAiRateLimitPerMinute": 20,
  "systemAiRateLimitPerHour": 100,
  "comingSoonEnabled": false,
  "comingSoonMessage": "พบกันเร็วๆนี้",
  "mapsEnabled": true,
  "mapTileUrl": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  "mapAttribution": "© OpenStreetMap contributors",
  "mapDefaultCenter": {"lat": 13.7563, "lng": 100.5018},
  "mapDefaultZoom": 17,
  "mapSchoolBoundary": [],
  "mapEnforceFoundInSchool": true,
  "foundHandoverDeadlineEnabled": true,
  "foundHandoverDeadlineMinutes": 60,
  "nfcEnabled": true,
  "nfcRequireLoginToReport": true
}' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE id = 'default');
