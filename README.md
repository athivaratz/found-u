# Found-U

เว็บแอปสำหรับแจ้งของหาย–ของเจอภายในโรงเรียน

**เวอร์ชันปัจจุบัน:** `0.1.2.2b` (Beta)

---

## บทนำ

Found-U ช่วยให้ผู้ทำของหายและผู้พบเจอประสานงานผ่านระบบเดียว ลดขั้นตอนกระดาษและการติดตามที่ล่าช้า รองรับมือถือเป็นหลัก (mobile-first) และอัปเดตสถานะแบบ Real-time

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

## เทคโนโลยี (Tech Stack)

| ชั้น | เทคโนโลยี | หมายเหตุ |
|------|-----------|----------|
| Framework | [Next.js](https://nextjs.org/) **16.1** (App Router) | `next dev` / `next build` |
| UI | [React](https://react.dev/) **19.2** | Client components |
| ภาษา | [TypeScript](https://www.typescriptlang.org/) **5.9** | Strict typing |
| สไตล์ | [Tailwind CSS](https://tailwindcss.com/) **4.1** | `@tailwindcss/postcss` |
| Runtime / Package manager | [Bun](https://bun.sh/) **1.3** | แนะนำสำหรับ dev |
| Backend / DB | [Firebase](https://firebase.google.com/) **12** | Auth, Firestore, Storage |
| Server SDK | [Firebase Admin](https://firebase.google.com/docs/admin/setup) **12.7** | API routes, rate limit |
| แผนที่ | [Leaflet](https://leafletjs.com/) **1.9** | OpenStreetMap tiles |
| AI | Google Gemini API | Vision + NER (`GEMMA_API_KEY`) |
| ที่เก็บไฟล์ (ทางเลือก) | Cloudflare R2 | ผ่าน AWS S3 SDK |
| อื่นๆ | `browser-image-compression`, `lucide-react`, `next-themes` | บีบอัดรูป, ไอคอน, dark mode |

## โครงสร้างโปรเจกต์ (ย่อ)

```
app/
  found/          แจ้งของเจอ (+ GPS, กล้อง, AI Vision)
  lost/           แจ้งของหาย
  tracking/       ติดตามด้วยรหัส
  list/           รายการสาธารณะ
  admin/          แผงผู้ดูแล (items, users, matching, settings, AI, …)
  api/            vision, ner, match, storage, ai/models
components/       UI, layout, map, camera, dialogs
lib/              firestore, vision, ner, matching, geolocation, …
contexts/         auth, data
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

**Current version:** `0.1.2.2b` (Beta)

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

## Tech Stack

See the table in the Thai section above. Core: **Next.js 16**, **React 19**, **TypeScript 5.9**, **Tailwind CSS 4**, **Firebase 12**, **Leaflet**, **Gemini API**, **Bun**.


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
