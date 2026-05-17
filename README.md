# TFL+ Workspace

> 🐴 แพลตฟอร์มจัดการทีมและธุรกิจครบวงจร — ออกแบบเฉพาะสำหรับทีม **TFL+ / หวยพัฒนาลาว**

[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://tfl-notion.vercel.app)
[![Database](https://img.shields.io/badge/DB-Neon%20Postgres-blue?logo=postgresql)](https://neon.tech)
[![License](https://img.shields.io/badge/License-Private-red)]()
[![Made by](https://img.shields.io/badge/Made%20by-SunTFL%2B-7c3aed)]()

**🌐 Production:** https://tfl-notion.vercel.app

---

## 🎯 ภาพรวม

Single-page HTML application ที่รวมทุกความสามารถสำหรับทีม TFL+ ไว้ในที่เดียว — จัดการงาน, ระบบลงเวลา, สรุปยอดขายหวย, Social Media Management, ออกพื้นที่ + อีเว้นท์ — sync ข้ามทุกอุปกรณ์ผ่าน Neon Postgres

## ✨ ฟีเจอร์หลัก

### 📋 จัดการงาน
- Task Board แบบ Kanban + Database View + Calendar
- รายการตรวจสอบ (Checklist)
- Drag & Drop จัดลำดับ
- มอบหมายหลายคน · กำหนดความสำคัญ · กำหนดเวลา
- ติดตามความคืบหน้าเรียลไทม์
- งานของฉัน / งานทั้งหมด (admin)

### 🕐 ระบบลงเวลา
- เช็คอิน/เช็คเอาท์ ด้วย GPS + แผนที่ Leaflet
- จำกัดระยะการเช็คอิน (รัศมีจากบริษัท)
- ถ่ายภาพยืนยันตอนเช็คอิน/ออก
- คำนวณ **มาสาย / ออกก่อนเวลา / OT** อัตโนมัติ
- ระบบขอลา + อนุมัติ + แนบเอกสาร
- ตารางเวลาทำงานต่อ Role ต่อวัน (7 วัน)
- วันหยุดพิเศษ / เทศกาล
- Calendar Heatmap ภาพรวมเดือน
- Ranking: มาสายที่สุด · ดีเด่น
- **Import จาก Excel** (ไฟล์สแกนนิ้ว)
- Admin จัดการ/แก้ไข/ยกเลิก check-in ของคนอื่น

### 📍 ออกพื้นที่ / อีเว้นท์
- บันทึกกิจกรรม (booth / field / event / visit)
- พิกัด GPS + Google Maps link
- ผู้รับผิดชอบหลายคน
- บันทึกผลงาน: สมาชิกใหม่ · ของแจก · ค่าใช้จ่าย (น้ำมัน/อาหาร/เดินทาง/เช่า) · แนบใบเสร็จ
- Dashboard สวยงาม: KPI · ranking · กราฟเปรียบเทียบ
- Export PDF รายงาน

### 📅 ปฏิทินทีม
- มุมมองรายเดือน · drag-drop ย้ายวัน
- รวมกิจกรรมออกพื้นที่ทุกคน
- Filter ตามสมาชิก (admin)

### 🎰 หวยพัฒนาลาว (Admin)
- บันทึกยอดขาย/รางวัล/งวด/เลขที่ออก
- แยกตามจำนวนหลัก (1-6 ตัว) · ขายได้ + ถูกรางวัล
- **เป้ายอดขาย 3 ระดับ** (งวด / เดือน / ปี)
- **ระบบเปรียบเทียบ** (เดือน vs เดือนก่อน, YoY, งวดล่าสุด vs ก่อนหน้า)
- **กราฟวิเคราะห์เชิงลึก** — รายวัน/สัปดาห์/เดือน · margin % · prize payouts
- **Insight อัจฉริยะ** (rule-based) — best period, growth, streak
- Import Excel + Export PDF/Excel
- งวดที่ขายดีที่สุด + medal ranking

### 📘 Facebook
- **Live Analytics** — ดึงข้อมูล Live จาก Graph API พร้อม manual entry
- **Live AI · Auto Fetch** — วิเคราะห์ Live แบบมืออาชีพ (Demographics, Engagement, Time)
- **Post Manager** — สร้างโพสต์ (text/image/video/reel/link) + ตั้งเวลา + Draft + Calendar
- ทุก action ใช้ Page Access Token ที่ admin ตั้งไว้ครั้งเดียว

### 📊 Social Analytics
- Dashboard รวมข้อมูล Facebook / Instagram / TikTok / YouTube (TT/YT รอ API)
- ผู้ติดตาม · การเข้าถึง · การมีส่วนร่วม
- กราฟ trend รายวัน · Donut chart สัดส่วน
- คอนเทนต์ยอดนิยม · ข้อมูลผู้ชม (เพศ + อายุ)

### 🔌 Integrations Hub (Admin only)
- จุดเดียวจัดการการเชื่อมต่อ Facebook / Instagram / TikTok (soon) / YouTube (soon) / Google Drive
- เชื่อมต่อครั้งเดียว — sync ผ่าน Neon ทุก user เห็นและใช้ได้

### 📝 Note + เอกสาร
- Note แบบ Google Keep (per-user, สี, pin)
- Google Drive integration (admin set credentials)

### 👥 จัดการสมาชิก (Admin)
- 3 Role: Admin / Social / Member
- รหัส PIN per-user (Admin ดูได้/รีเซ็ตได้)
- Avatar ปรับแต่งได้ + สีประจำตัว
- Activity Log — ทุก action ทุกคน

### 🔔 แจ้งเตือนอัจฉริยะ
- In-app + Browser Notification API
- เตือนงานครบกำหนด · เลยกำหนด · มอบหมายงานใหม่ · คำขอลา
- กระดิ่งบน topbar ทุกหน้า

### ☁️ Cross-device Sync
- ทุกข้อมูลเก็บใน **Neon Postgres** (workspace_snapshot JSONB)
- Poll ทุก 10 วินาที + sync ทันทีเมื่อมีการเปลี่ยน
- Offline mode รองรับ (localStorage cache)
- Manual upload/download ผ่าน UI

### 🎨 UI/UX
- Dark Mode (default) / Light Mode toggle
- Responsive — ทำงานบน Desktop / Tablet / Mobile
- Mobile overflow menu (⋯)
- Sidebar drag-reorder (admin)
- PWA-ready (Add to Home Screen)
- Custom favicon + Apple touch icon

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JS · HTML · CSS (single-file ~800KB) |
| **Hosting** | Vercel (auto-deploy from `main`) |
| **Database** | Neon Postgres (Serverless) via `@neondatabase/serverless` |
| **API** | Vercel Serverless Functions (Node 18+) |
| **Maps** | Leaflet + OpenStreetMap (free) |
| **Excel** | SheetJS (xlsx) — Import/Export |
| **PDF** | Browser print (no library needed) |
| **Sync** | JSONB snapshot + 10s polling |

## 📁 Project Structure

```
tfl-workspace/
├── index.html              ← Main app (single-file SPA)
├── api/
│   ├── _db.js              ← Neon connection helper
│   ├── health.js           ← GET /api/health
│   ├── workspace.js        ← GET/POST snapshot (with slim-mode for oversized)
│   ├── wipe-snapshot.js    ← POST to reset
│   ├── init-db.js          ← POST to create schema
│   └── seed.js             ← POST baseline data
├── db/
│   └── schema.sql          ← Postgres schema (workspace_snapshot)
├── scripts/
│   └── init-db.mjs         ← CLI: npm run init-db
├── backups/                ← Local zip backups (gitignored)
├── backup.ps1              ← One-click backup script
├── ws-light.png            ← Logo (light mode)
├── ws-dark.png             ← Logo (dark mode) + favicon
├── lao-lottery.png         ← Lottery brand logo
├── package.json
├── vercel.json
└── .env.local              ← DATABASE_URL (gitignored)
```

## 🚀 Setup & Deploy

### Local Development

```bash
# 1. Clone
git clone https://github.com/tafulaoplus/TFLNotion
cd tfl-workspace

# 2. Install
npm install

# 3. Set DATABASE_URL in .env.local
echo 'DATABASE_URL=postgresql://...' > .env.local

# 4. Init schema (first time)
npm run init-db

# 5. Run
npm run dev          # Vercel dev on localhost:3000
```

### Deploy

ทุก commit ที่ push ไปยัง `main` branch จะ auto-deploy ผ่าน Vercel

```bash
git add -A
git commit -m "feat: ..."
git push origin main
```

หรือ manual:
```bash
npm run deploy       # vercel --prod
```

### Backup

```powershell
.\backup.ps1         # สร้าง zip ใน backups/
```

## 📊 Roles & Permissions

| Role | สิทธิ์ |
|------|------|
| **Admin** | ทุกเมนู · จัดการสมาชิก · เชื่อมต่อแพลตฟอร์ม · งานทั้งหมด · Activity Log · ยอดขาย · ลบประวัติเช็คอินคนอื่น · อนุมัติลา · Reset workspace |
| **Social** | ทุกเมนูปกติ + เมนู Social (Live / Post Manager / Social Analytics) |
| **Member** | เมนูพื้นฐาน (ภาพรวม · ระบบลงเวลา · งานของฉัน · Note · เอกสาร · ออกพื้นที่ของตัวเอง · ปฏิทิน) |

## 🗄️ Database Schema

ใช้ pattern **single JSONB snapshot** เพื่อให้ sync ง่าย:

```sql
CREATE TABLE workspace_snapshot (
  workspace_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,           -- ทุกข้อมูลของ workspace
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);
```

ข้อมูลที่เก็บใน `data` JSONB:
- users · tasks · documents · notes · opts · liveSessions
- salesEvents · activityLog · notifications · attendanceRecords
- leaveRequests · attendanceSettings · attendanceHolidays
- lotterySales · lotterySettings
- fbDrafts · fbConnection · googleDriveSettings
- columnWidths · nextTaskId · nextDocId

มี slim-mode auto-strip ฟิลด์หนัก (base64 receipts) ถ้า > 2MB

## 🔐 Environment Variables

| Variable | Where | Required |
|----------|-------|----------|
| `DATABASE_URL` | Vercel + `.env.local` | ✅ Yes |
| `INIT_DB_SECRET` | Vercel | ⚪ Optional (ปกป้อง /api/init-db) |

## 🐛 Known Issues / Roadmap

- ⏳ TikTok Business API integration (รอ App Review)
- ⏳ YouTube Data API v3 + OAuth flow
- ⏳ Real-time WebSocket (ปัจจุบันใช้ polling 10s)
- ⏳ Calendar shared across users (sidebar order ปัจจุบัน per-browser)

## 💜 Credits

Made with love by **SunTFL+** — สำหรับทีม TFL+ และหวยพัฒนาลาว

© 2026 TFL+ Workspace · All rights reserved
