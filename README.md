# TFL+ Workspace

> Workspace management platform — Task tracking · Notes · Documents · Facebook Live Analytics — ในไฟล์เดียว

[![Live](https://img.shields.io/badge/Live-tfl--notion.vercel.app-7c3aed?style=flat-square)](https://tfl-notion.vercel.app)
[![Stack](https://img.shields.io/badge/Stack-HTML%20%2B%20Vercel%20%2B%20Neon-blue?style=flat-square)](#tech-stack)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](#license)

---

## ⚡ Quick Demo

```bash
git clone https://github.com/tafulaoplus/TFLNotion.git
cd TFLNotion
npm install
npm run init-db   # สร้างตารางใน Neon
npm run dev       # เปิด http://localhost:3000
```

หรือใช้ online ได้เลย → **[tfl-notion.vercel.app](https://tfl-notion.vercel.app)**

---

## 📑 สารบัญ

- [ฟีเจอร์หลัก](#-ฟีเจอร์หลัก)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [การติดตั้ง](#-การติดตั้ง)
- [การใช้งาน](#-การใช้งาน)
- [Roles & Permissions](#-roles--permissions)
- [API Reference](#-api-reference)
- [ฐานข้อมูล](#-ฐานข้อมูล)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)

---

## 🚀 ฟีเจอร์หลัก

### 📋 Task Management
- **Database View** — ตารางแบบ Notion พร้อมแก้ inline · drag-reorder · resize columns
- **Kanban Board** — ลากการ์ดสลับสถานะ
- **Checklist** — มุมมอง todo list checkbox
- **Date Grouping** — จัดกลุ่มตามวันครบกำหนด + ย่อ/ขยายได้
- **Cell Editing** — แก้ status/priority/type/assignees ผ่าน dropdown · พิมพ์ tag ใหม่ + Enter เพิ่มได้
- **Quick Actions** — คัดลอกงาน (เป็นวันนี้) · ลบงาน
- **Emoji Picker** — เลือก emoji ให้แต่ละงาน

### 👥 Team & Auth
- **3 Roles** — Admin · Social · Member
- **PIN Login** — 6 หลัก พร้อม on-screen keypad
- **Profile** — แก้ชื่อ + อัปโหลดรูป (auto-crop) + เปลี่ยนสี + reset PIN

### 📝 Notes (Google Keep Style)
- 12 สีให้เลือก + pin to top + search
- Masonry layout (4→3→2→1 columns responsive)
- **Per-user** (แต่ละคนเห็นโน้ตของตัวเอง)

### 📂 Documents Library
- จัดการเอกสาร (icon + name + creator + workspace)
- เชื่อมกับ Google Drive (OAuth)

### 🎥 Facebook Live Analytics
**Manual Entry** (`/fbLive`)
- บันทึก Live แต่ละครั้งครบทุก field (views, reactions, comments, retention, ages, distribution)
- **Executive Weekly Report** — KPI cards, 7-day trend line chart, demographics, engagement, active time
- Export PDF / CSV
- Period filter: ทั้งหมด · 3 · 7 · 28 วัน · custom date range picker

**Auto Analyzer** (`/fbLiveAuto`)
- ดึง Live data จาก Facebook Graph API
- Rule-based analyzer (sentiment + keywords + insights)
- Save to Live สด list

### 🌓 UI/UX
- **Light / Dark mode toggle** (Netlify-style navy theme)
- Responsive (มือถือ / iPad / PC)
- Hamburger menu สำหรับ mobile
- Smooth animations (collapse, drag, transitions)
- Sidebar persistence (จดจำหน้าที่อยู่)

### 💾 Data Sync
- **Neon Postgres** — primary online DB (real cross-device sync)
- **localStorage** — offline cache
- **Firebase** (optional fallback)
- **Export/Import JSON** — หลายไฟล์ + dedupe by ID
- **Auto-poll** ทุก 30 วินาที สำหรับ updates จาก client อื่น

---

## 🛠 Tech Stack

| Layer | Tech |
|---|---|
| **Frontend** | Single HTML file — vanilla JS + CSS variables (no build step) |
| **Charts** | Inline SVG (custom rendered) |
| **PDF** | jsPDF + html2canvas (lazy-loaded CDN) |
| **Backend** | Vercel Serverless Functions (Node 18 ESM) |
| **Database** | Neon Postgres + `@neondatabase/serverless` |
| **Hosting** | Vercel (auto-deploy from GitHub) |
| **Fonts** | Anuphan + IBM Plex Sans Thai + Inter (Google Fonts) |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (any device)                                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  index.html (vanilla JS + CSS)                        │  │
│  │  · UI rendering                                        │  │
│  │  · localStorage cache (offline)                       │  │
│  │  · 30s polling for remote updates                     │  │
│  └────────────┬──────────────────────────────────────────┘  │
└───────────────┼─────────────────────────────────────────────┘
                │ HTTPS
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Vercel Edge / Serverless                                    │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ /api/health      │  │ /api/workspace   │  GET / POST     │
│  │ /api/init-db     │  │ /api/seed        │                 │
│  └────────┬─────────┘  └────────┬─────────┘                 │
└───────────┼─────────────────────┼───────────────────────────┘
            │                     │ @neondatabase/serverless
            ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Neon Postgres (ap-southeast-1)                             │
│  · workspace_snapshot (JSONB full-state sync)               │
│  · users · tasks · documents · notes · live_sessions        │
│  · opts · workspace_meta                                     │
└─────────────────────────────────────────────────────────────┘
```

**Sync model:** Frontend `saveAll()` → debounced POST `/api/workspace` → Neon. Other clients poll `/api/workspace` every 30s; if `updated_at` ใหม่ → apply changes locally.

---

## 📦 การติดตั้ง

### ความต้องการ
- **Node.js 18+** ([download](https://nodejs.org/))
- **Neon Postgres** account ([free signup](https://neon.tech/))
- **Vercel** account ([free signup](https://vercel.com/)) — สำหรับ deploy

### Setup ทีละขั้น

#### 1. Clone & Install
```bash
git clone https://github.com/tafulaoplus/TFLNotion.git
cd TFLNotion
npm install
```

#### 2. ตั้งค่า Environment
สร้างไฟล์ `.env.local` ที่ root:
```env
DATABASE_URL=postgresql://user:pass@host.neon.tech/db?sslmode=require
INIT_DB_SECRET=optional-secret-for-init-endpoint
```

> 🔒 `.env.local` ถูก gitignore แล้ว — ปลอดภัย

#### 3. สร้างตาราง
```bash
npm run init-db
```

ผลลัพธ์:
```
✅ Connected to "neondb"
✅ Schema applied successfully
📊 Tables:
   workspaces           1 row
   users                0 rows
   tasks                0 rows
   opts                 10 rows  ← seeded
   ...
```

#### 4. รัน Local
```bash
npm run dev
```
เปิด http://localhost:3000

#### 5. Deploy
```bash
npm run deploy
```
หรือ push ไป GitHub → Vercel auto-deploy

---

## 🎯 การใช้งาน

### ครั้งแรก
1. เปิดเว็บ → เลือก user → ตั้ง PIN 6 หลัก → ยืนยัน
2. Admin (Tafu Lao Plus) สามารถ:
   - เพิ่ม/ลบ members + เปลี่ยน roles
   - ดูงานทั้งหมด
   - reset PIN ของคนอื่น

### Roles & Permissions

| Menu | Member | Social | Admin |
|---|:---:|:---:|:---:|
| ภาพรวม | ✓ | ✓ | ✓ |
| ไลบรารี | ✓ | ✓ | ✓ |
| เอกสาร (Drive) | ✓ | ✓ | ✓ |
| Note | ✓ | ✓ | ✓ |
| ติดตามงาน | ✓ | ✓ | ✓ |
| งานของฉัน | ✓ | ✓ | ✓ |
| **Facebook → Live** | — | ✓ | ✓ |
| **Facebook → Live AI** | — | ✓ | ✓ |
| งานทั้งหมด | — | — | ✓ |
| จัดการสมาชิก | — | — | ✓ |

---

## 🔌 API Reference

### `GET /api/health`
ทดสอบการเชื่อมต่อ Neon
```json
{ "ok": true, "db": "neondb", "now": "2026-05-15T...", "version": "PostgreSQL 16.x" }
```

### `GET /api/workspace`
ดึง workspace state ทั้งหมด
```json
{
  "ok": true, "exists": true,
  "updatedAt": "2026-05-15T...",
  "users": [...], "tasks": [...], "documents": [...],
  "notes": [...], "liveSessions": [...], "opts": {...}
}
```

### `POST /api/workspace`
บันทึก workspace state
```bash
curl -X POST https://tfl-notion.vercel.app/api/workspace \
  -H "Content-Type: application/json" \
  -d '{"users":[...],"tasks":[...],"_updatedBy":"alice"}'
```

### `POST /api/init-db`
สร้างตาราง (ใช้ครั้งเดียว) — ตั้ง `INIT_DB_SECRET` ใน env เพื่อกัน
```bash
curl -X POST https://tfl-notion.vercel.app/api/init-db?secret=YOUR_SECRET
```

### `POST /api/seed`
ฉีด baseline data ถ้า workspace ว่าง (4 users + 10 opts)

---

## 🗄 ฐานข้อมูล

9 ตารางใน Neon Postgres — ดูเต็มที่ [`db/schema.sql`](db/schema.sql)

| Table | Purpose |
|---|---|
| `workspaces` | Multi-tenant root |
| `users` | สมาชิก + role + avatar + PIN |
| `tasks` | งาน + assignees (JSONB) |
| `documents` | Library docs |
| `notes` | Google Keep notes (per user) |
| `live_sessions` | Facebook Live + audience JSONB |
| `opts` | Tag definitions (status/priority/type) |
| `workspace_meta` | nextIds, columnWidths |
| `workspace_snapshot` | Full JSONB sync state (primary) |

**Auto-update triggers** — `updated_at` อัปเดตเองทุก UPDATE
**Indexes** — tasks(due/status/assignees GIN), notes(user_id), live_sessions(date/presenter)

---

## 🚀 Deployment

### Vercel (แนะนำ)
1. Push code ไป GitHub
2. ไปที่ [vercel.com/new](https://vercel.com/new) → Import repo
3. Framework Preset: **Other**
4. Environment Variables:
   - `DATABASE_URL` — Neon connection string
   - `INIT_DB_SECRET` — (optional) protect /api/init-db
5. Deploy

หลัง deploy:
- `GET /api/health` ทดสอบ
- `POST /api/init-db` สร้างตาราง 1 ครั้ง
- เริ่มใช้งานได้เลย

### Custom Domain
Vercel → Project Settings → Domains → Add domain

---

## 🔧 Troubleshooting

### `[Neon] Not available`
- ไม่ได้รันบน Vercel (อาจเปิดด้วย `file://`) — ใช้ `npm run dev` หรือ deploy
- ตรวจ `/api/health` ว่าตอบ 200

### `DATABASE_URL not set`
- ตรวจ `.env.local` หรือ Vercel env vars
- ใช้ pooled connection string (มี `-pooler.` ใน hostname)

### `relation "workspaces" does not exist`
- ยังไม่ได้รัน `npm run init-db` หรือ POST `/api/init-db`

### ข้อมูลซ้ำหลัง import
- ระบบ dedupe by ID อยู่แล้ว → แต่ถ้า ID ต่างกัน รายการเดียวกัน จะซ้ำ
- แก้: ใช้ Export ก่อน Import แบบ replace

### Vercel rate limit
- Free tier: 100GB-Hours/month
- แอปนี้ใช้น้อยมาก (~100KB/request)

---

## 📁 โครงสร้างไฟล์

```
TFLNotion/
├── index.html              ← เว็บแอปทั้งหมด (single file)
├── api/
│   ├── _db.js              ← Neon connection
│   ├── health.js           ← GET ทดสอบ
│   ├── workspace.js        ← GET/POST sync
│   ├── init-db.js          ← POST สร้างตาราง
│   └── seed.js             ← POST baseline data
├── db/
│   └── schema.sql          ← Full SQL schema
├── scripts/
│   └── init-db.mjs         ← CLI init script
├── package.json
├── vercel.json
├── .gitignore
└── .env.local              ← (gitignored) DATABASE_URL
```

---

## 🎨 Screenshots

> หน้า Dashboard, Task Board, Live Analytics, Notes, Dark mode

(ใส่ภาพ screenshot ภายหลัง)

---

## 🤝 Contributing

โปรเจกต์ภายในทีม TFL+ — ติดต่อ tafu@tfl.com สำหรับ access

---

## 📝 License

MIT © 2026 TFL+ Workspace

---

## 🔗 Links

- 🌐 **Live demo:** https://tfl-notion.vercel.app
- 📚 **Database docs:** [README-DATABASE.md](README-DATABASE.md)
- 🚀 **Deploy guide:** [DEPLOY.md](DEPLOY.md)
- 🗄 **Neon dashboard:** https://console.neon.tech/
- ▲ **Vercel dashboard:** https://vercel.com/dashboard
