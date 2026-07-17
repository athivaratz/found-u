-- Help pages CMS for /help/how-to-use and /help/new-school

CREATE TABLE public.help_pages (
  slug text PRIMARY KEY,
  title text NOT NULL,
  description text,
  intro text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.help_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug text NOT NULL REFERENCES public.help_pages(slug) ON DELETE CASCADE,
  section_type text NOT NULL DEFAULT 'step'
    CHECK (section_type IN ('step', 'note', 'faq')),
  audience text NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'student', 'admin')),
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX help_sections_page_slug_sort_idx
  ON public.help_sections (page_slug, sort_order);

ALTER TABLE public.help_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_sections ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.help_pages TO anon, authenticated;
GRANT SELECT ON public.help_sections TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.help_pages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.help_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_pages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_sections TO service_role;

CREATE POLICY help_pages_select ON public.help_pages
  FOR SELECT USING (true);
CREATE POLICY help_pages_write ON public.help_pages
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY help_sections_select ON public.help_sections
  FOR SELECT USING (true);
CREATE POLICY help_sections_write ON public.help_sections
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Public storage bucket for help guide images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'help-assets',
  'help-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'help_assets_public_read'
  ) THEN
    CREATE POLICY help_assets_public_read
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'help-assets');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'help_assets_service_write'
  ) THEN
    CREATE POLICY help_assets_service_write
      ON storage.objects FOR ALL
      TO service_role
      USING (bucket_id = 'help-assets')
      WITH CHECK (bucket_id = 'help-assets');
  END IF;
END $$;

-- Seed pages
INSERT INTO public.help_pages (slug, title, description, intro) VALUES
(
  'how-to-use',
  'คู่มือการใช้งาน Found-U',
  'วิธีแจ้งของหาย ของเจอ ติดตามสถานะ ใช้แท็ก NFC และผู้ช่วย AI',
  'คู่มือนี้ช่วยให้นักเรียนและบุคลากรใช้งาน Found-U ได้ครบตั้งแต่เข้าสู่ระบบจนถึงการติดตามของคืน เลือกแท็บตามบทบาทของคุณด้านล่าง'
),
(
  'new-school',
  'นำ Found-U ไปใช้ในโรงเรียนของคุณ',
  'ขั้นตอนติดตั้ง Found-U ให้โรงเรียนใหม่ผ่าน Vercel และ Supabase',
  'Found-U ออกแบบให้โรงเรียนอื่นนำไปติดตั้งใช้งานเองได้ โดยไม่ต้องพึ่งพาทีมพัฒนาเดิม ทำตามขั้นตอนด้านล่างเพื่อ Deploy และตั้งค่าระบบครั้งแรก'
);

-- Seed: how-to-use (student + all)
INSERT INTO public.help_sections (page_slug, section_type, audience, title, body, sort_order) VALUES
(
  'how-to-use', 'step', 'student', 'เข้าสู่ระบบครั้งแรก',
  'เปิดเว็บ Found-U ของโรงเรียน แล้วกรอกเลขประจำตัวนักเรียนพร้อมรหัสผ่านตั้งต้นที่โรงเรียนแจ้ง

เมื่อเข้าสำเร็จครั้งแรก ระบบจะให้ตั้งรหัสผ่านใหม่ของตนเอง และแนะนำให้ตั้ง PIN 6 หลัก

ภายหลังสามารถลงทะเบียน Passkey (ลายนิ้วมือหรือ Face ID) ได้จากหน้าตั้งค่าความปลอดภัย',
  10
),
(
  'how-to-use', 'step', 'student', 'หน้าหลักและเมนูลัด',
  'หลังเข้าสู่ระบบ คุณจะเห็นปุ่มลัดสำหรับแจ้งของหายและแจ้งของเจอ

แถบนำทางด้านล่างใช้สลับระหว่างหน้าหลัก ผู้ช่วย AI รายการสาธารณะ และการจัดการ NFC Tag

รองรับทั้งมือถือและคอมพิวเตอร์ พร้อม Dark Mode',
  20
),
(
  'how-to-use', 'step', 'student', 'แจ้งของหาย',
  'กดปุ่ม "แจ้งของหาย" แล้วกรอกชื่อสิ่งของ หมวดหมู่ คำอธิบาย สถานที่ วันที่ และช่องทางติดต่อ

สามารถพิมพ์บรรยายเหตุการณ์เป็นข้อความอิสระ ให้ AI (NER) สกัดข้อมูลลงฟอร์มให้อัตโนมัติ

ปักหมุดสถานที่บนแผนที่ แล้วกดบันทึก ระบบจะออก Tracking Code ให้ทันที',
  30
),
(
  'how-to-use', 'step', 'student', 'แจ้งของเจอ',
  'กดปุ่ม "แจ้งของเจอ" แล้วถ่ายหรืออัปโหลดรูปของที่พบ

AI Vision จะวิเคราะห์และกรอกชื่อสิ่งของ หมวดหมู่ สี และยี่ห้อให้อัตโนมัติ — ควรตรวจทานก่อนบันทึก

ระบุสถานที่พบพร้อมพิกัด GPS ระบบจะตรวจว่าอยู่ภายในขอบเขตโรงเรียนหรือไม่ (Geofencing)',
  40
),
(
  'how-to-use', 'step', 'all', 'ตรวจสอบสถานะด้วย Tracking Code',
  'ไปที่หน้า "ติดตาม" แล้วกรอกรหัสติดตามที่ได้รับ

ดูสถานะได้โดยไม่ต้องเข้าสู่ระบบ เช่น กำลังตามหา เจอแล้ว รับคืนแล้ว หรือหมดอายุ

ข้อมูลติดต่อของอีกฝ่ายจะถูกซ่อนไว้จนกว่าจะยืนยันตรงกัน เพื่อความเป็นส่วนตัว',
  50
),
(
  'how-to-use', 'step', 'student', 'ลงทะเบียนและใช้แท็ก NFC',
  'ไปที่หน้า NFC แล้วกดลงทะเบียนแท็กใหม่ (รองรับ NTAG213/215/216)

บน Android ที่รองรับ Web NFC ให้แนบแท็กกับโทรศัพท์เพื่อเขียน URL และล็อก Read-only

บน iOS ให้ใช้ QR Code ที่ระบบสร้างให้แทน เมื่อมีคนสแกน ระบบจะแจ้งเตือนเจ้าของได้ทันที',
  60
),
(
  'how-to-use', 'step', 'student', 'ใช้งานผู้ช่วย AI',
  'ไปที่หน้า "ผู้ช่วย" แล้วพิมพ์สิ่งที่ต้องการ เช่น ตามหาของ แจ้งรายการ หรือวิเคราะห์รูป

ผู้ช่วยจะเลือกใช้เครื่องมือที่เหมาะสมเอง เช่น ค้นหา แจ้งของหาย/เจอ จับคู่ หรือเช็ครหัสติดตาม

คุยให้ครบในแชทเดียวได้ โดยไม่ต้องสลับหลายหน้า',
  70
),
(
  'how-to-use', 'step', 'admin', 'เข้าสู่ระบบแอดมิน',
  'ใช้เลขประจำตัวแอดมิน 5 หลักคู่กับรหัสผ่านเป็นช่องทางหลัก

หลังเข้าสู่ระบบ เปิด /admin เพื่อเข้าแผงผู้ดูแล

รองรับ Passkey และ PIN เหมือนผู้ใช้ทั่วไปหลังตั้งค่าแล้ว',
  80
),
(
  'how-to-use', 'step', 'admin', 'จัดการรายการและผู้ใช้',
  'ที่แผงแอดมิน สามารถดู อนุมัติ อัปเดตสถานะ และจับคู่รายการของหาย-ของเจอได้

นำเข้ารายชื่อนักเรียนจากไฟล์ CSV และจัดการสิทธิ์บัญชีผู้ใช้

กลั่นกรองเนื้อหา (Moderation) และระงับผู้ใช้ที่ไม่เหมาะสมได้เมื่อจำเป็น',
  90
),
(
  'how-to-use', 'step', 'admin', 'ตั้งค่า AI แผนที่ และระบบ',
  'เลือกโมเดล Gemini ปรับ Temperature และกำหนด Rate Limit ทั้งระดับผู้ใช้และระบบ

กำหนดขอบเขตโรงเรียน (Geofence) บนแผนที่แบบ Interactive

ดู Error Log และ Activity Log การใช้งาน AI แบบ Real-time',
  100
),
(
  'how-to-use', 'faq', 'all', 'ลืมรหัสผ่านต้องทำอย่างไร?',
  'ติดต่อครูหรือบุคลากรที่เป็นแอดมินของโรงเรียน เพื่อขอรีเซ็ตรหัสผ่านผ่านแผงผู้ดูแล

หากเคยตั้ง PIN ไว้ บางกรณีสามารถใช้ PIN ช่วยรีเซ็ตรหัสผ่านได้ตามที่ระบบรองรับ',
  110
),
(
  'how-to-use', 'faq', 'all', 'ทำไมแจ้งของเจอไม่ได้เมื่ออยู่นอกโรงเรียน?',
  'ระบบใช้ Geofencing เพื่อรับเฉพาะพิกัดภายในขอบเขตที่แอดมินกำหนด

หากคุณอยู่ภายในโรงเรียนแล้วยังไม่ผ่าน ให้เปิด GPS ของอุปกรณ์และอนุญาตตำแหน่งในเบราว์เซอร์',
  120
),
(
  'how-to-use', 'faq', 'student', 'iPhone ใช้แท็ก NFC ได้ไหม?',
  'การเขียนข้อมูลลงแท็กผ่านเว็บรองรับเฉพาะ Android ที่ใช้ Chrome พร้อม Web NFC

ผู้ใช้ iOS สามารถพิมพ์หรือสแกน QR Code ที่ระบบสร้างให้แทนได้',
  130
);

-- Seed: new-school
INSERT INTO public.help_sections (page_slug, section_type, audience, title, body, sort_order) VALUES
(
  'new-school', 'step', 'all', 'Clone และ Deploy ด้วย Vercel',
  'เข้าไปที่ Repository ของ Found-U บน GitHub แล้วกดปุ่ม Deploy with Vercel

ล็อกอินด้วยบัญชี GitHub หรือ Vercel ของโรงเรียน

เลือกติดตั้ง Integration ของ Supabase และเลือก Region เป็น Southeast Asia (Singapore) เพื่อรองรับ Free Plan แล้วกด Deploy',
  10
),
(
  'new-school', 'step', 'all', 'ตั้งค่าระบบครั้งแรกด้วย Setup Wizard',
  'เมื่อ Deploy สำเร็จ เปิด URL ของโปรเจกต์แล้วต่อท้ายด้วย /setup

ทำตาม Wizard 3 ขั้น ได้แก่ ข้อมูลโรงเรียน การตั้งค่า AI และการสร้างบัญชีแอดมินคนแรก

หลังเสร็จแล้วจะเข้าแผงแอดมินได้ทันที โดยไม่ต้องแก้โค้ด',
  20
),
(
  'new-school', 'step', 'all', 'นำเข้ารายชื่อนักเรียน',
  'เข้าสู่ระบบด้วยบัญชีแอดมิน แล้วไปที่หน้าจัดการนักเรียน

อัปโหลดไฟล์ CSV ตามรูปแบบที่ระบบกำหนด

นักเรียนจะเข้าสู่ระบบด้วยเลขประจำตัวและรหัสผ่านตั้งต้นได้หลังนำเข้าสำเร็จ',
  30
),
(
  'new-school', 'step', 'all', 'ตั้งค่าแผนที่และขอบเขตโรงเรียน',
  'ไปที่หน้าแผนที่และ GPS ในแผงแอดมิน

วาดขอบเขตโรงเรียนบนแผนที่แบบ Interactive

ขอบเขตนี้ใช้ตรวจ Geofence เมื่อมีคนแจ้งของเจอ',
  40
),
(
  'new-school', 'step', 'all', '(ทางเลือก) Fork เพื่อรับอัปเดตจากต้นทาง',
  'เมื่อพร้อม sync อัปเดตจากโค้ดหลัก ให้ Fork Repository ต้นทางบน GitHub

ใน Vercel ไปที่ Settings → Git แล้วเปลี่ยนเชื่อมต่อไปยัง fork ของคุณ

จากนั้นใช้ Sync fork บน GitHub แล้ว Vercel จะ deploy อัตโนมัติ Migration ของฐานข้อมูลรันหลัง deploy โดยข้อมูลเดิมไม่หาย',
  50
),
(
  'new-school', 'note', 'all', 'ตัวแปรสภาพแวดล้อมที่ควรรู้',
  '- ค่าจาก Supabase (URL, anon key, service role) มักถูกใส่ให้อัตโนมัติตอน Deploy ผ่าน Vercel Integration
- ใส่ NEXT_PUBLIC_APP_URL หลังรู้โดเมนจริงของโรงเรียน
- คีย์ AI (Gemini / OpenRouter) ตั้งผ่าน Setup Wizard หรือ env ก็ได้
- Storage: ถ้าไม่ใส่ R2 ระบบจะใช้ Supabase Storage แทน',
  60
),
(
  'new-school', 'faq', 'all', 'เลือก Free Plan ของ Supabase ไม่ได้?',
  'ลองเปลี่ยน Region เป็น Singapore และเช็กว่า organization ยังมีโควตา free project เหลือ (จำกัดประมาณ 2 โปรเจกต์ต่อ org)

หรือสร้างโปรเจกต์ฟรีที่ supabase.com แล้วเชื่อมแบบ Connect existing ในขั้นตอน Deploy',
  70
),
(
  'new-school', 'faq', 'all', 'เจอ 500 หรือ /setup?reason=missing_env?',
  'แปลว่ายังไม่มี env จาก Supabase Integration หรือมีค่า placeholder หลงเหลืออยู่

ตรวจ Project Settings ของ Vercel ให้ครบ แล้ว Redeploy ใหม่',
  80
),
(
  'new-school', 'faq', 'all', 'นักเรียนเข้าใช้งานอย่างไรหลังติดตั้ง?',
  'เปิดเว็บเบราว์เซอร์แล้วเข้า URL ของโรงเรียน เช่น https://your-project.vercel.app

ไม่ต้องติดตั้งแอปเพิ่ม สามารถเพิ่มไปยังหน้าจอหลักของมือถือได้หากต้องการ

รายละเอียดการใช้งานรายวันดูได้ที่หน้าคู่มือการใช้งาน',
  90
);
