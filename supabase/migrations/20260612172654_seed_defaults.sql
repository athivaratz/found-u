INSERT INTO public.app_settings (id, settings) VALUES ('default', '{
  "ogTitle": "Found-U | ระบบแจ้งของหาย-ของเจอ",
  "ogDescription": "ระบบแจ้งของหายและของเจอสำหรับโรงเรียน โดยนร.บด.๒ - แจ้งง่าย ติดตามสะดวก",
  "aiRateLimitEnabled": true,
  "aiRateLimitPerMinute": 5,
  "aiRateLimitPerHour": 30,
  "aiRateLimitMessage": "คุณใช้งาน AI บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  "systemAiRateLimitEnabled": true,
  "systemAiRateLimitPerMinute": 20,
  "systemAiRateLimitPerHour": 100,
  "aiNerModel": "gemini-1.5-flash",
  "aiNerTemperature": 0.1,
  "aiNerTopP": 0.8,
  "aiNerMaxOutputTokens": 256,
  "aiMatchingModel": "gemini-1.5-flash",
  "aiMatchingTemperature": 0.1,
  "aiMatchingTopP": 0.8,
  "aiMatchingMaxOutputTokens": 200,
  "aiVisionModel": "gemini-1.5-flash",
  "aiVisionTemperature": 0.1,
  "aiVisionTopP": 0.8,
  "aiVisionMaxOutputTokens": 256,
  "mapsEnabled": true,
  "mapTileUrl": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  "mapAttribution": "© OpenStreetMap contributors",
  "mapDefaultCenter": {"lat": 13.7563, "lng": 100.5018},
  "mapDefaultZoom": 17,
  "mapSchoolBoundary": [],
  "mapEnforceFoundInSchool": true,
  "notifyOnNewReport": true,
  "notifyOnStatusChange": true,
  "requireApproval": false,
  "foundHandoverDeadlineEnabled": true,
  "foundHandoverDeadlineMinutes": 60,
  "autoDeleteDays": 30,
  "maxImageSize": 5,
  "compressionQuality": 0.8,
  "nfcEnabled": true,
  "nfcRequireLoginToReport": true
}'::jsonb) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories (value, label, icon, sort_order) VALUES
  ('wallet', 'กระเป๋าสตางค์', '💰', 1),
  ('phone', 'โทรศัพท์', '📱', 2),
  ('keys', 'กุญแจ', '🔑', 3),
  ('bag', 'กระเป๋า', '👜', 4),
  ('electronics', 'อิเล็กทรอนิกส์', '💻', 5),
  ('documents', 'เอกสาร', '📄', 6),
  ('clothing', 'เสื้อผ้า', '👕', 7),
  ('accessories', 'เครื่องประดับ', '💍', 8),
  ('other', 'อื่นๆ', '📦', 9)
ON CONFLICT (value) DO NOTHING;

INSERT INTO public.locations (value, label, sort_order) VALUES
  ('admin_office', 'ห้องธุรการ', 1),
  ('canteen', 'โรงอาหาร', 2),
  ('library', 'ห้องสมุด', 3),
  ('security', 'ห้องรปภ.', 4),
  ('building_1', 'ตึก 1', 5),
  ('building_2', 'ตึก 2', 6),
  ('field', 'สนามกีฬา', 7),
  ('parking', 'ลานจอดรถ', 8),
  ('other', 'อื่นๆ', 9)
ON CONFLICT (value) DO NOTHING;

INSERT INTO public.contact_types (value, label, icon, placeholder, sort_order) VALUES
  ('phone', 'เบอร์โทรศัพท์', '📞', '0812345678', 1),
  ('line', 'LINE ID', '💬', '@lineid', 2),
  ('instagram', 'Instagram', '📷', '@username', 3),
  ('facebook', 'Facebook', '📘', 'ชื่อ Facebook', 4),
  ('email', 'Email', '📧', 'email@example.com', 5)
ON CONFLICT (value) DO NOTHING;

INSERT INTO public.drop_off_locations (value, label, sort_order) VALUES
  ('personnel_office', 'ห้องบุคคล (ห้องปกครอง)', 1),
  ('admin_office', 'ห้องธุรการ', 2),
  ('canteen', 'โรงอาหาร', 3),
  ('library', 'ห้องสมุด', 4),
  ('security', 'ห้องรปภ.', 5),
  ('other', 'อื่นๆ', 6)
ON CONFLICT (value) DO NOTHING;;
