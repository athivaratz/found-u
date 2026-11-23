# ขึ้นเว็บจริง

ทำตามลำดับ ข้ามข้อที่ยังไม่ตอบจาก VisperHost ไม่ได้ โดยเฉพาะข้อ REMOTE_ADDR

เลือก PHP **8.3 หรือ 8.4** ใน Select PHP Version PHP 8.2 หมดอายุวันที่ 31 ธันวาคม 2026 แอปยังปฏิเสธตัวที่ต่ำกว่า 8.2.36 ไว้ แต่ไม่ควรอยู่บน 8.2 หลังวันนั้น

## ถาม VisperHost ก่อนลงมือ

ส่งรายการนี้ไปก่อนอัปโหลด คำตอบเปลี่ยนขั้นตอนด้านล่าง

1. หลัง Cloudflare แล้ว `REMOTE_ADDR` ใน PHP เป็นไอพีของ Cloudflare หรือถูกเขียนทับเป็นไอพีผู้เยี่ยม (mod_remoteip / Use Client IP) ถ้าถูกเขียนทับ บล็อก `Require ip` ใน `.htaccess` จะ 403 ทุกคน ต้องเอาบล็อกนั้นออกก่อน อ่าน `cloudflare.md`
2. Imunify360 มีกฎที่บล็อก `POST /api/agent/chat` เพราะเนื้อหาเป็น JSON ยาวไหม ถ้ามี ขอวิธี whitelist path นั้น ไม่งั้นแชทจะ 403 ทั้งที่ PHP ไม่ได้ทำงาน
3. เลือก PHP 8.3 หรือ 8.4 ได้ไหม และเปิดส่วนขยายเหล่านี้ได้ไหม: `sodium`, `gd`, `intl`, `mbstring`, `pdo_mysql`, `curl`, `apcu` (apcu ไม่มีก็ได้ แอปใช้ MariaDB แทน)
4. `exec` ถูกปิดอยู่ใช่ไหม แอปไม่ใช้ แต่ cron dump เขียนให้ทำงานโดยไม่เรียก `exec`
5. ค่าเหล่านี้เป็นเท่าไร และแก้ใน `.user.ini` ได้ไหม: `max_execution_time` (ต้องการอย่างน้อย 30), `memory_limit` (ต้องการอย่างน้อย 256M เพราะแฮชรหัสผ่าน), `upload_max_filesize` และ `post_max_size` (ต้องการอย่างน้อย 8M), `session.upload_progress.enabled` ต้องเป็น Off
6. โฮสต์อ่าน `.user.ini` ใน `public_html` ไหม
7. MariaDB รุ่นอะไร แอปทดสอบกับ 10.11 อย่าใช้ 10.6
8. cron ใน DirectAdmin ถี่สุดได้ทุกกี่นาที แอปใช้ทุก 5 นาที
9. เซิร์ฟเวอร์เรียก HTTPS ออกไปที่ `generativelanguage.googleapis.com`, `openrouter.ai`, `*.r2.cloudflarestorage.com` และ `challenges.cloudflare.com` ได้ไหม ถ้าออกเน็ตไม่ได้ แชท อัปโหลดรูป และ Turnstile จะพัง

## ขั้นตอน

1. สร้างฐานข้อมูลใน DirectAdmin จดชื่อฐาน ชื่อผู้ใช้ และรหัสผ่าน
2. เข้า phpMyAdmin เลือกฐานนั้น นำเข้า `foundu/migrations/all.sql` จาก zip นำเข้าครั้งเดียวพอ
3. อัปโหลด `foundu-release.zip` ใน File Manager แตกไฟล์ให้ได้สองโฟลเดอร์คู่กัน: `public_html/` และ `foundu/` โฟลเดอร์ `foundu` อยู่ข้าง `public_html` ไม่ใช่ข้างใน
4. คัดลอก `foundu/config/.env.php.example` เป็น `foundu/config/.env.php` กรอกค่าจริง แล้วตั้งสิทธิ์ไฟล์เป็น **600**
5. ค่าที่ต้องมีก่อนเปิดให้คนใช้: `APP_URL` (https และโดเมนจริง), `APP_KEY` (สุ่มยาว), `DATA_KEY` และ `LOOKUP_KEY` (คีย์ libsodium base64), `DB_*`, `R2_*`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `TURNSTILE_ENABLED=1` คีย์ AI ใส่อย่างน้อยหนึ่งตัวถ้าจะเปิดแชท
6. ใน Select PHP Version เลือก 8.3 หรือ 8.4 เปิดส่วนขยายข้อ 3
7. สร้างผู้ดูแล: ตั้ง `BOOTSTRAP_ADMIN_STUDENT_IDS` เป็นรหัส 5 หลักที่จะใช้ แล้วสมัครด้วยรหัสนั้น บัญชีแรกจะเป็น admin จากนั้นเอาค่านี้กลับเป็น `11111` หรือเว้นตามที่ตั้งใจ
8. ตั้ง cron ใน DirectAdmin

```
*/5 * * * * php ~/foundu/bin/cron.php
```

เส้นทางต้องตรงกับที่แตกไฟล์ ถ้าโฮสต์เรียก php คนละตัว ให้ใช้พาธเต็มของ PHP 8.3 หรือ 8.4 ที่แผงบอก

9. ทำ Cloudflare ตาม `cloudflare.md` DNS สีส้ม, SSL Full (strict), กฎ WAF, rate limit, แคช, Turnstile
10. ล้างแคช Cloudflare แล้วลองรายการด้านล่าง

## ลองหลังเปิด

- หน้าแรกและหน้าเข้าสู่ระบบโหลด
- สมัครบัญชีทดสอบ แล้วล็อกอิน ออกจากระบบ
- แจ้งของหายหนึ่งรายการ มีรูป มี Turnstile
- ค้นคำนั้นเจอรายการ และในรายการของคนอื่นไม่มีเบอร์โทร
- เปิดแชทหนึ่งข้อความ
- ดูใน R2 ว่ามีไฟล์แบ็กอัปหลังจาก cron รันครบหนึ่งรอบ (อาจใช้เวลาถึง 5 นาที และถ้ารายการเยอะอาจใช้หลายรอบ)
