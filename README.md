# Found-U

เว็บแอปสำหรับแจ้งของหาย–ของเจอภายในโรงเรียน

**เวอร์ชันปัจจุบัน:** `0.2b`

**Production:** [foundu.forum](https://foundu.forum) · [foundu.bodin2.ac.th](https://foundu.bodin2.ac.th)

---

## บทนำ

Found-U ช่วยให้ผู้ทำของหายและผู้พบเจอประสานงานผ่านระบบเดียว ลดขั้นตอนกระดาษและการติดตามที่ล่าช้า รองรับมือถือเป็นหลัก (mobile-first) และอัปเดตสถานะแบบ Real-time

### v0.2b — Supabase Auth & Backend

- ย้ายจาก **Firebase** มาใช้ **Supabase** (PostgreSQL + Auth + Realtime + RLS)
- ระบบล็อกอินนักเรียน/แอดมินด้วย **เลขประจำตัว + รหัสผ่าน** เป็นช่องทางหลัก
- รองรับ **Passkeys (WebAuthn)** และ **PIN** หลังล็อกอินรหัสผ่านครั้งแรก
- ยกเลิก Google OAuth แล้ว
- ที่เก็บรูปภาพยังใช้ **Cloudflare R2** (ไม่เปลี่ยน)
- Validation ด้วย **Zod** ทุก API route หลัก

### v0.1.3beta — NFC Tag

- ลงทะเบียน NFC Tag (NTAG214/215/216) พร้อมข้อมูลเจ้าของ
- เขียน URL ลงแท็ก + ล็อก Read-Only (Android Chrome)
- พิมพ์ QR Code สำหรับ iOS/Safari
- แจ้งพบของผ่านสแกน/QR และฝากข้อความถึงเจ้าของ
- แจ้งของหายจาก Tag (เลือกสร้าง Lost Item ได้)

## ปัญหาที่พบ (Pain Point)

กระบวนการของหายแบบเดิมในโรงเรียนมักกระจัดกระจาย ติดตามสถานะยาก และใช้เวลานานในการจับคู่เจ้าของกับของที่พบ

## สิ่งที่ระบบทำ

- แจ้ง **ของหาย** และ **ของเจอ** พร้อมรูป ตำแหน่ง และช่องทางติดต่อ
- **Tracking Code** สำหรับตรวจสอบสถานะ
- **จับคู่อัตโนมัติ** ระหว่างรายการ lost / found
- **แผนที่** ปักพิกัด และกำหนดขอบเขตโรงเรียน (ตรวจ GPS บนหน้าแจ้งของเจอ)
- **AI วิเคราะห์รูป** (Vision) เดาชื่อ หมวดหมู่ สี ยี่ห้อ จากภาพถ่าย
- **AI แยกข้อมูลจากข้อความ** (NER) สำหรับรายการของหาย
- **แผงผู้ดูแล** จัดการรายการ ผู้ใช้ การตั้งค่า moderation และทดสอบ AI
- **NFC Tag** ลงทะเบียนแท็ก สแกน/QR แจ้งพบ และฝากข้อความถึงเจ้าของ

## การยืนยันตัวตน (Auth)

| วิธี | นักเรียน | แอดมิน | หมายเหตุ |
|------|---------|--------|----------|
| เลขประจำตัว + รหัสผ่าน | ✓ | — | ช่องทางหลัก ครั้งแรกต้องใช้วิธีนี้ |
| เลขแอดมิน 5 หลัก + รหัสผ่าน | — | ✓ | ช่องทางหลักสำหรับแอดมิน |
| Passkey | ✓ | ✓ | ลงทะเบียนหลังล็อกอินรหัสผ่านแล้ว |
| PIN | ✓ | ✓ | ตั้งค่าได้หลังล็อกอินรหัสผ่านแล้ว |

**ลำดับที่ถูกต้อง:** ล็อกอินรหัสผ่าน → (ถ้าต้องการ) ลงทะเบียน Passkey / ตั้ง PIN → ใช้วิธีอื่นได้

## เทคโนโลยี (Tech Stack)

| ชั้น | เทคโนโลยี | หมายเหตุ |
|------|-----------|----------|
| Framework | [Next.js](https://nextjs.org/) **16.1** (App Router) | `next dev` / `next build` |
| UI | [React](https://react.dev/) **19.2** | Client components |
| ภาษา | [TypeScript](https://www.typescriptlang.org/) **5.9** | Strict typing |
| สไตล์ | [Tailwind CSS](https://tailwindcss.com/) **4.1** | `@tailwindcss/postcss` |
| Runtime / Package manager | [Bun](https://bun.sh/) **1.3** | แนะนำสำหรับ dev |
| Backend / DB | [Supabase](https://supabase.com/) | PostgreSQL, Auth, Realtime, RLS |
| Auth | Supabase Auth | Password, Passkeys, PIN, synthetic email domain |
| WebAuthn client | `@simplewebauthn/browser` | พิธีการ Passkey ฝั่งเบราว์เซอร์ |
| Validation | [Zod](https://zod.dev/) **4** | API request / input schemas |
| แผนที่ | [Leaflet](https://leafletjs.com/) **1.9** | OpenStreetMap tiles |
| AI | Google Gemini API | Vision + NER (`GEMMA_API_KEY`) |
| ที่เก็บไฟล์ | Cloudflare R2 | ผ่าน AWS S3 SDK |
| อื่นๆ | `browser-image-compression`, `lucide-react`, `next-themes`, `framer-motion` | บีบอัดรูป, ไอคอน, dark mode, motion |

## โครงสร้างโปรเจกต์ (ย่อ)

```
app/
  (app)/          หน้าหลักหลังล็อกอิน (home, found, lost, list, settings, …)
  admin/          แผงผู้ดูแล (items, users, students, matching, AI, NFC, …)
  api/            REST API (auth, vision, ner, match, storage, nfc, …)
  auth/callback/  Auth callback
  login/          ล็อกอิน เปลี่ยนรหัส รีเซ็ตรหัส
  nfc/            ลงทะเบียน/แท็กของฉัน/แจ้งพบ NFC
components/       UI, layout, map, camera, dialogs
contexts/         auth, data (Realtime)
lib/
  database.ts     CRUD + subscriptions (แทน Firestore เดิม)
  supabase/       client, server, admin, passkey-auth, auth-session
  auth-eligibility.ts   กฎ secondary auth (Passkey / PIN)
  student-auth-server.ts  ล็อกอินรหัสผ่าน, PIN, scrypt
  validations/    Zod schemas
```

## ทีมของเรา

- [Athivaratz](https://www.instagram.com/athivaratz)
- [Almond](https://www.instagram.com/athivaratz)
- [Prim](https://www.instagram.com/aeridesrosea.v)

## ที่ปรึกษา

- [ratchanon_roj](https://www.instagram.com/ratchanon_roj)
- อาจารย์อภิชาติ พูลสวัสดิ์

## ข้อมูลเพิ่มเติม

- ความปลอดภัยและการรายงานช่องโหว่: [SECURITY.md](SECURITY.md)
- สิทธิ์การใช้งาน: [LICENSE](LICENSE)

---

## Introduction

Found-U is a smart school lost-and-found web app for finders and reporters with artificial intelligence included.

**Current version:** `0.2b` (Beta)

**Production:** [foundu.forum](https://foundu.forum) · [foundu.bodin2.ac.th](https://foundu.bodin2.ac.th)

## What's New in v0.2b

- Migrated from **Firebase** to **Supabase** (PostgreSQL, Auth, Realtime, RLS)
- Primary login: **student ID + password** (students) or **5-digit admin ID + password** (admins)
- **Passkeys** and **PIN** available only after a successful password login
- Google OAuth has been removed
- Image storage remains on **Cloudflare R2**
- **Zod** validation on API routes

## Pain Point

Traditional school lost-and-found workflows are slow, fragmented, and hard to track.

## What It Does

- Report **lost** and **found** items with photos, location, and contacts
- **Tracking codes** for status lookup
- **Automatic matching** between lost and found listings
- **Maps** with optional school boundary enforcement on found reports
- **AI vision** to suggest item fields from photos
- **AI NER** to extract fields from free-text lost reports
- **Admin dashboard** for items, users, settings, moderation, and AI testing
- **NFC tags** for register, scan/QR found reports, and owner messaging

## Tech Stack

See the table in the Thai section above. Core: **Next.js 16**, **React 19**, **TypeScript 5.9**, **Tailwind CSS 4**, **Supabase**, **Leaflet**, **Gemini API**, **Cloudflare R2**, **Bun**.


## Our Team

- [Athivaratz](https://www.instagram.com/athivaratz)
- [Almond](https://www.instagram.com/athivaratz)
- [Prim](https://www.instagram.com/aeridesrosea.v)

## Adviser

- [ratchanon_roj](https://www.instagram.com/ratchanon_roj)
- อาจารย์อภิชาติ พูลสวัสดิ์ (Instructor)

## Other Details

- Security: [SECURITY.md](SECURITY.md)
- License: [LICENSE](LICENSE)

---

Made with ❤️ by [Athivaratz](https://www.instagram.com/athivaratz) & Team
