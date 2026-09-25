-- Rewrite the public new-school guide for manual deploy.
-- The first-run /setup wizard is gone; schema and the first admin are applied by hand.

UPDATE public.help_pages
SET
  description = 'ขั้นตอนติดตั้ง Found-U ให้โรงเรียนใหม่ผ่าน Vercel และ Supabase แล้วตั้งค่าด้วยมือ',
  intro = 'Found-U ติดตั้งได้เองโดยไม่ต้องใช้ตัวช่วยตั้งค่าบนเว็บ หลัง Deploy ให้รัน migration และสร้างบัญชีแอดมินจากเครื่องที่เชื่อม Supabase แล้วจึงเข้าสู่ระบบเพื่อตั้งชื่อโรงเรียนและคีย์ AI',
  updated_at = now()
WHERE slug = 'new-school';

UPDATE public.help_sections
SET
  title = 'รัน migration และสร้างบัญชีแอดมิน',
  body = 'จากเครื่องที่ลิงก์ Supabase CLI กับโปรเจกต์ของโรงเรียน รัน bun run db:push

จากนั้นสร้างแอดมินคนแรกด้วย bun run create:admin --student-id 11111 --password <password>

แอปไม่รัน migration ตอนบูต และไม่มีหน้าตั้งค่าอัตโนมัติ'
WHERE page_slug = 'new-school'
  AND title = 'ตั้งค่าระบบครั้งแรกด้วย Setup Wizard';

UPDATE public.help_sections
SET
  body = 'เมื่อพร้อม sync อัปเดตจากโค้ดหลัก ให้ Fork Repository ต้นทางบน GitHub

ใน Vercel ไปที่ Settings → Git แล้วเปลี่ยนเชื่อมต่อไปยัง fork ของคุณ

จากนั้นใช้ Sync fork บน GitHub แล้ว Vercel จะ deploy อัตโนมัติ หลังมี migration ใหม่ให้รัน bun run db:push อีกครั้ง ข้อมูลเดิมไม่หาย'
WHERE page_slug = 'new-school'
  AND title = '(ทางเลือก) Fork เพื่อรับอัปเดตจากต้นทาง';

UPDATE public.help_sections
SET
  body = '- ค่าจาก Supabase (URL, anon key, service role) มักถูกใส่ให้อัตโนมัติตอน Deploy ผ่าน Vercel Integration
- ใส่ NEXT_PUBLIC_APP_URL และ SCHOOL_AUTH_DOMAIN หลังรู้โดเมนจริงของโรงเรียน
- คีย์ AI (Gemini / OpenRouter) ตั้งในแผงแอดมินหรือใส่เป็น env ก็ได้
- Storage: ถ้าไม่ใส่ R2 ระบบจะใช้ Supabase Storage แทน
- Schema ใช้ bun run db:push แอปไม่ได้อ่าน POSTGRES_URL ตอนรัน'
WHERE page_slug = 'new-school'
  AND title = 'ตัวแปรสภาพแวดล้อมที่ควรรู้';

UPDATE public.help_sections
SET
  title = 'Deploy แล้วเข้าเว็บไม่ได้?',
  body = 'แปลว่ายังไม่มี env จาก Supabase Integration หรือมีค่า placeholder หลงเหลืออยู่

ตรวจ Project Settings ของ Vercel ให้ครบ NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY และ SUPABASE_SERVICE_ROLE_KEY แล้ว Redeploy

จากนั้นรัน bun run db:push และ bun run create:admin จากเครื่องที่ลิงก์โปรเจกต์'
WHERE page_slug = 'new-school'
  AND title = 'เจอ 500 หรือ /setup?reason=missing_env?';
