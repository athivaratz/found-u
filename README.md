# Found-U

เว็บแอปสำหรับแจ้งของหาย–ของเจอภายในโรงเรียน

**เวอร์ชันปัจจุบัน:** `0.3`

**Production:** [foundu.forum](https://foundu.forum) · [foundu.bodin2.ac.th](https://foundu.bodin2.ac.th)

---

## บทนำ

Found-U ช่วยให้ผู้ทำของหายและผู้พบเจอประสานงานผ่านระบบเดียว ลดขั้นตอนกระดาษและการติดตามที่ล่าช้า รองรับมือถือเป็นหลัก (mobile-first) และอัปเดตสถานะแบบ Real-time

### v0.3 — AI Agent & การค้นหาอัจฉริยะ

- **ผู้ช่วย AI** (`/assistant`) แชทแบบ tool-calling — ค้นหา แจ้งของหาย/เจอ จับคู่ วิเคราะห์รูป และตรวจ tracking code
- รองรับ **Gemini** และ **OpenRouter** พร้อม fallback อัตโนมัติ และตั้งค่า routing ผ่านแผงแอดมิน
- **ค้นหาแบบ fuzzy** ด้วย `pg_trgm` (Supabase RPC) สำหรับรายการของหายและ Agent
- **ความเป็นส่วนตัว** — ซ่อนข้อมูลติดต่อของผู้อื่นในหน้าติดตามสถานะและใน Agent (เจ้าของรายการ/แอดมินเท่านั้นที่เห็น)
- ประวัติแชท Agent เก็บในเบราว์เซอร์ด้วย **IndexedDB (Dexie)** พร้อม session และ memory facts
- แผงแอดมิน **AI Center** ขยาย: ตั้งค่า Agent, Gemini pipeline, OpenRouter, และ **Agent Debug Log**
- ปรับ UX การโหลด Auth — ไม่แสดง skeleton ซ้ำเมื่อมี session อยู่แล้ว

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
- **ผู้ช่วย AI (Agent)** สนทนาเพื่อค้นหา แจ้งรายการ จับคู่ และช่วยตรวจสอบสถานะ
- **ค้นหา fuzzy** ชื่อ/รายละเอียดสิ่งของด้วย `pg_trgm`
- **แผงผู้ดูแล** จัดการรายการ ผู้ใช้ การตั้งค่า moderation ทดสอบ AI และ debug log
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
| Backend / DB | [Supabase](https://supabase.com/) | PostgreSQL, Auth, Realtime, RLS, `pg_trgm` |
| Auth | Supabase Auth | Password, Passkeys, PIN, synthetic email domain |
| WebAuthn client | `@simplewebauthn/browser` | พิธีการ Passkey ฝั่งเบราว์เซอร์ |
| Validation | [Zod](https://zod.dev/) **4** | API request / input schemas |
| แผนที่ | [Leaflet](https://leafletjs.com/) **1.9** | OpenStreetMap tiles |
| AI (Pipeline) | Google Gemini API | Vision, NER, Matching (`GEMMA_API_KEY`) |
| AI (Agent) | [Vercel AI SDK](https://sdk.vercel.ai/) **7** | `@ai-sdk/google`, `@ai-sdk/openai`, tool loop |
| AI (Agent alt.) | [OpenRouter](https://openrouter.ai/) | Fallback / primary provider (`OPENROUTER_API_KEY`) |
| Chat storage | [Dexie](https://dexie.org/) **4** | IndexedDB สำหรับ session แชท Agent |
| ที่เก็บไฟล์ | Cloudflare R2 | ผ่าน AWS S3 SDK |
| อื่นๆ | `browser-image-compression`, `lucide-react`, `next-themes`, `framer-motion` | บีบอัดรูป, ไอคอน, dark mode, motion |

## โครงสร้างโปรเจกต์ (ย่อ)

```
app/
  (app)/          หน้าหลักหลังล็อกอิน (home, assistant, found, lost, list, tracking, settings, …)
  admin/          แผงผู้ดูแล (items, users, students, matching, AI, NFC, …)
  api/            REST API (auth, vision, ner, match, agent, storage, nfc, …)
  auth/callback/  Auth callback
  login/          ล็อกอิน เปลี่ยนรหัส รีเซ็ตรหัส
  nfc/            ลงทะเบียน/แท็กของฉัน/แจ้งพบ NFC
components/       UI, layout, map, camera, agent, dialogs
contexts/         auth, data (Realtime)
lib/
  agent/          Agent tools, prompts, provider routing, privacy
  chat/           Session/message storage, context window, memory
  database.ts     CRUD + subscriptions (แทน Firestore เดิม)
  supabase/       client, server, admin, passkey-auth, auth-session
  auth-eligibility.ts   กฎ secondary auth (Passkey / PIN)
  student-auth-server.ts  ล็อกอินรหัสผ่าน, PIN, scrypt
  validations/    Zod schemas
```

## Deploy โรงเรียนใหม่ (Fork + 1-Click)

> **ทำไมต้อง Fork?** ปุ่ม Deploy ของ Vercel สร้าง **clone** (repo แยก ไม่มี upstream) — sync อัปเดตจากเราไม่ได้  
> แนะนำ **Fork บน GitHub ก่อน** แล้ว deploy จาก fork ของคุณ → ใช้ **Sync fork** ดึงอัปเดตได้

[![Fork on GitHub](https://img.shields.io/badge/Fork-Found--U-181717?style=for-the-badge&logo=github)](https://github.com/bodin2/found-u/fork)

**ขั้นที่ 1 — Fork (1 คลิก)**  
กดปุ่มด้านบน → **Create fork** บน GitHub (ได้ repo `ชื่อคุณ/found-u` ที่เชื่อม upstream)

**ขั้นที่ 2 — Deploy**  
1. **ก็อปปี้** ลิงก์ด้านล่าง  
2. แทน `YOUR_GITHUB_USERNAME` ด้วยชื่อ GitHub ของคุณ (เช่น `school-admin`)  
3. วางในเบราว์เซอร์แล้ว Enter → ทำตามขั้นตอน Vercel (ติดตั้ง Supabase)

```
https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_GITHUB_USERNAME%2Ffound-u&project-name=found-u&repository-name=found-u&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%7D%5D
```

> **ทางเลือก:** [vercel.com/new](https://vercel.com/new) → Import → เลือก **`ชื่อคุณ/found-u`** → ติดตั้ง Supabase integration (Singapore + Free Plan)

ขั้นตอนสำหรับแอดมินโรงเรียน:

1. **Fork** repo บน GitHub (ขั้นที่ 1 ด้านบน)
2. **Deploy** — ก็อปปี้ลิงก์ขั้นที่ 2 แก้ชื่อ GitHub แล้วเปิดในเบราว์เซอร์
3. ติดตั้ง **Supabase** integration ตอน deploy (สร้างโปรเจกต์ DB อัตโนมัติ) — **ไม่ต้องกรอก env เพิ่ม** (`NEXT_PUBLIC_APP_URL` / `SCHOOL_AUTH_DOMAIN` ไม่บังคับ แอปใช้ `VERCEL_URL` ชั่วคราวได้)
4. รอ deploy เสร็จ → เปิด URL `https://<ชื่อโปรเจกต์>.vercel.app` → ทำ **Setup Wizard** 3 ขั้น
5. *(แนะนำหลัง deploy)* ไปที่ Vercel → **Settings → Environment Variables** ตั้งค่าให้ตรงโดเมนจริง แล้ว **Redeploy**:
   - `NEXT_PUBLIC_APP_URL` = `https://found-u-test.vercel.app`
   - `SCHOOL_AUTH_DOMAIN` = `found-u-test.vercel.app` (ไม่มี `https://`)
6. ล็อกอินด้วยเลขแอดมินที่สร้างใน Wizard → ใช้งานได้

### อัปเดตโค้ดจาก upstream (Sync)

เมื่อทีม Found-U ปล่อยเวอร์ชันใหม่:

1. GitHub → repo **`ชื่อคุณ/found-u`** → **Sync fork** (หรือ Pull request จาก upstream)
2. Vercel จะ **auto-deploy** เมื่อ push เข้า fork (ถ้าเชื่อม Git ไว้แล้ว)
3. ถ้าไม่ auto-deploy → Vercel → **Deployments** → **Redeploy**

**ถ้าเคย deploy ด้วยปุ่ม Clone เก่า** (repo ไม่มีปุ่ม Sync fork): [Fork](https://github.com/bodin2/found-u/fork) ใหม่ → Vercel → **Settings → Git** → เปลี่ยน repo เป็น fork ของคุณ → Redeploy

### เลือก Region และ Free Plan (Supabase)

เมื่อติดตั้ง Supabase ผ่าน Vercel ให้เลือก:

| รายการ | แนะนำ |
|--------|--------|
| **Region** | **Southeast Asia (Singapore)** — latency ดีสำหรับไทย และรองรับ **Free Plan** ได้ |
| **หลีกเลี่ยง** | Tokyo / Seoul (region เฉพาะบางตัว) — อาจขึ้นข้อความ *"Upgrade your plan to support your selected configuration"* และเลือก Free ไม่ได้ |
| **Plan** | **Supabase Free Plan ($0)** — เพียงพอสำหรับโรงเรียนขนาดเล็ก–กลาง |

ถ้าเลือก Free ไม่ได้:

1. เปลี่ยน Region เป็น **Singapore** แล้วลองใหม่
2. ตรวจว่า Supabase organization ยังมีช่อง free project ว่าง (จำกัด 2 โปรเจกต์ฟรีต่อ org)
3. หรือสร้าง project ฟรีที่ [supabase.com/dashboard](https://supabase.com/dashboard) (เลือก Singapore) แล้วกลับมา Vercel → **Connect existing Supabase account** (เมนู `...` ข้างปุ่ม Install)

Supabase integration จะ inject `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, และ `POSTGRES_URL_NON_POOLING` ให้อัตโนมัติ — ไม่ต้อง copy เอง

**ไม่บังคับตอน deploy:** `GEMMA_API_KEY`, `OPENROUTER_*`, `R2_*` — ตั้งผ่าน Setup Wizard หรือเพิ่มทีหลังใน Vercel env

### ค่า env หลัง Deploy (ไม่บังคับตอนกดปุ่มครั้งแรก)

| ตัวแปร | เมื่อไหร่ต้องใส่ | ตัวอย่าง |
|--------|------------------|---------|
| `NEXT_PUBLIC_APP_URL` | หลังรู้โดเมน Vercel แล้ว (แนะนำ) | `https://found-u-test.vercel.app` |
| `SCHOOL_AUTH_DOMAIN` | หลังรู้โดเมน Vercel แล้ว (แนะนำ) | `found-u-test.vercel.app` |

**อย่าใส่ `-`** เป็นค่า placeholder — ถ้ายังไม่รู้ URL **ไม่ต้องเพิ่มตัวแปรนี้เลย** แอปจะใช้ `VERCEL_URL` ของ Vercel ชั่วคราว

**สำคัญ:** ต้องมี env จาก **Supabase integration** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL_NON_POOLING`) — ถ้าไม่มี หน้า `/setup` จะขึ้น `missing_env`

**อาการ:** `500 MIDDLEWARE_INVOCATION_FAILED` + `/setup?reason=missing_env` = ยังไม่มี Supabase env หรือใส่ placeholder `-` แล้ว integration ไม่ครบ → แก้ env แล้ว redeploy

## ตัวแปรสภาพแวดล้อม (สำคัญ)

ดูตัวอย่างครบใน [`.env.example`](.env.example) — จัดกลุ่ม Required / Optional แล้ว

- **Required (Vercel + Supabase):** `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL_NON_POOLING`
- **แนะนำหลังรู้โดเมน:** `NEXT_PUBLIC_APP_URL`, `SCHOOL_AUTH_DOMAIN` (ไม่บังคับ deploy ครั้งแรก — ใช้ `VERCEL_URL` ชั่วคราวได้)
- **Optional — AI:** `GEMMA_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (หรือตั้งใน Setup Wizard)
- **Optional — Storage:** `R2_*` (production เดิมใช้ R2; deploy ใหม่ใช้ Supabase Storage อัตโนมัติถ้าไม่มี R2)
- **Search:** `SEARCH_USE_TRGM`, `SEARCH_SIMILARITY_THRESHOLD`, `AGENT_SEARCH_SIMILARITY_THRESHOLD`

## ทีมของเรา

- [Athivaratz](https://www.instagram.com/athivaratz)
- [Almond](https://www.instagram.com/ohzzl_)
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

**Current version:** `0.3`

**Production:** [foundu.forum](https://foundu.forum) · [foundu.bodin2.ac.th](https://foundu.bodin2.ac.th)

## What's New in v0.3

- **AI Agent** at `/assistant` with tool-calling (search, report, match, vision, tracking lookup)
- **Gemini + OpenRouter** providers with auto-fallback and admin routing controls
- **Fuzzy search** via `pg_trgm` (Supabase RPC) for items and agent queries
- **Privacy controls** — contact details hidden from non-owners on tracking and in agent responses
- **Local chat history** with Dexie (IndexedDB) sessions and memory facts
- Expanded **Admin AI Center** — agent settings, Gemini pipeline, OpenRouter, debug logs
- Smoother auth loading when a session is already available

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
- **AI Agent** conversational assistant for search, reports, matching, and status checks
- **Fuzzy search** for item names and descriptions
- **Admin dashboard** for items, users, settings, moderation, AI testing, and agent debug logs
- **NFC tags** for register, scan/QR found reports, and owner messaging

## Deploy a New School (Fork + 1-Click)

> **Why Fork?** Vercel's Deploy button **clones** the repo (no upstream link) — you cannot **Sync fork** for updates.  
> **Fork on GitHub first**, then deploy from **your fork** to pull updates from `bodin2/found-u` later.

[![Fork on GitHub](https://img.shields.io/badge/Fork-Found--U-181717?style=for-the-badge&logo=github)](https://github.com/bodin2/found-u/fork)

**Step 1 — Fork (1 click)**  
Click above → **Create fork** on GitHub (`your-username/found-u` with upstream link).

**Step 2 — Deploy**  
1. **Copy** the link below  
2. Replace `YOUR_GITHUB_USERNAME` with your GitHub username (e.g. `school-admin`)  
3. Paste in your browser and press Enter → follow Vercel (install Supabase)

```
https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_GITHUB_USERNAME%2Ffound-u&project-name=found-u&repository-name=found-u&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%7D%5D
```

> **Alternative:** [vercel.com/new](https://vercel.com/new) → Import → select **`your-username/found-u`** → install Supabase integration (Singapore + Free Plan)

1. **Fork** the repo on GitHub (step 1 above)
2. **Deploy** — copy the step 2 link, edit your GitHub username, open in browser
3. Install **Supabase** during deploy — **no extra env required** on first deploy (`VERCEL_URL` works until you set `NEXT_PUBLIC_APP_URL` / `SCHOOL_AUTH_DOMAIN`)
4. Wait for deploy → open `https://<project-name>.vercel.app` → complete the **3-step Setup Wizard**
5. *(Recommended)* Set env in Vercel → **Settings → Environment Variables** and **Redeploy**
6. Log in with the admin account you created

### Sync updates from upstream

When Found-U releases a new version:

1. GitHub → **`your-username/found-u`** → **Sync fork**
2. Vercel **auto-deploys** on push to your fork (if Git is connected)
3. If not → Vercel → **Deployments** → **Redeploy**

**If you deployed with the old Clone button** (no Sync fork): [Fork](https://github.com/bodin2/found-u/fork) again → Vercel → **Settings → Git** → switch repo to your fork → Redeploy

### Supabase region and Free Plan

When installing Supabase via Vercel:

| Setting | Recommendation |
|---------|----------------|
| **Region** | **Southeast Asia (Singapore)** — good latency for Thailand; supports **Free Plan** |
| **Avoid** | Tokyo / some specific regions — may show *"Upgrade your plan to support your selected configuration"* and disable Free |
| **Plan** | **Supabase Free Plan ($0)** — sufficient for small–medium schools |

If Free Plan is greyed out: switch region to **Singapore**, check your org still has a free project slot (max 2 per org), or create a free project at [supabase.com/dashboard](https://supabase.com/dashboard) and use **Connect existing Supabase account** in Vercel (`...` menu).

**Required env values (optional on first deploy — set after you know your `*.vercel.app` URL):**

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | `https://your-school.vercel.app` |
| `SCHOOL_AUTH_DOMAIN` | `your-school.vercel.app` |

Do **not** use `-` as a placeholder. If you do not know the URL yet, **omit these variables** — the app falls back to Vercel's `VERCEL_URL` until you set them.

Supabase integration vars are still required (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL_NON_POOLING`).

## Tech Stack

See the table in the Thai section above. Core: **Next.js 16**, **React 19**, **TypeScript 5.9**, **Tailwind CSS 4**, **Supabase**, **Vercel AI SDK**, **Gemini + OpenRouter**, **Dexie**, **Leaflet**, **Cloudflare R2** (or Supabase Storage on new deploys), **Bun**.

## Our Team

- [Athivaratz](https://www.instagram.com/athivaratz)
- [Almond](https://www.instagram.com/ohzzl_)
- [Prim](https://www.instagram.com/aeridesrosea.v)

## Adviser

- [ratchanon_roj](https://www.instagram.com/ratchanon_roj)
- อาจารย์อภิชาติ พูลสวัสดิ์ (Instructor)

## Other Details

- Security: [SECURITY.md](SECURITY.md)
- License: [LICENSE](LICENSE)

---

Made with ❤️ by [Athivaratz](https://www.instagram.com/athivaratz) & Team
