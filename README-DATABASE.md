# 🗄️ Neon Postgres — Setup Guide

โปรเจกต์นี้เชื่อมกับ Neon Postgres ผ่าน `@neondatabase/serverless`

## โครงสร้างไฟล์

```
tflwork/
├── api/
│   ├── _db.js          ← Database connection helper
│   ├── health.js       ← GET /api/health (test connection)
│   ├── workspace.js    ← GET/POST /api/workspace (snapshot sync)
│   └── init-db.js      ← POST /api/init-db (create tables)
├── db/
│   └── schema.sql      ← Full SQL schema (8 tables + seed data)
├── scripts/
│   └── init-db.mjs     ← CLI init script
├── package.json
├── vercel.json
└── .env.local          ← DATABASE_URL (gitignored)
```

## 1. ติดตั้ง Dependencies (ครั้งเดียว)

```bash
cd C:\Users\suntf\tfl-workspace
npm install
```

จะติดตั้ง:
- `@neondatabase/serverless` — Neon HTTP/WebSocket driver
- `dotenv` — โหลด `.env.local`

## 2. สร้างตาราง (Initialize Schema)

**ทางเลือก A: Local CLI** (ใช้ DATABASE_URL จาก `.env.local`)
```bash
npm run init-db
```

ผลลัพธ์:
```
🔄 Connecting to Neon...
✅ Connected to "neondb" at 2026-05-15 ...
🚀 Running schema.sql...
✅ Schema applied successfully
📊 Tables:
   documents              0 rows  · 9 cols
   live_sessions          0 rows  · 24 cols
   notes                  0 rows  · 9 cols
   opts                   10 rows · 7 cols   (seeded with default status/priority/type)
   tasks                  0 rows  · 14 cols
   users                  0 rows  · 10 cols
   workspace_meta         0 rows  · 4 cols
   workspace_snapshot     0 rows  · 4 cols
   workspaces             1 rows  · 3 cols   (seeded with 'default')
```

**ทางเลือก B: ผ่าน Vercel** (หลัง deploy)
```bash
curl -X POST https://YOUR_PROJECT.vercel.app/api/init-db
```

> **🔒 Security tip:** ตั้ง `INIT_DB_SECRET` ใน Vercel environment เพื่อกัน endpoint นี้
> ```bash
> curl -X POST "https://YOUR_PROJECT.vercel.app/api/init-db?secret=YOUR_SECRET"
> ```

## 3. ทดสอบ Connection

```bash
curl http://localhost:3000/api/health
# หรือบน Vercel:
curl https://YOUR_PROJECT.vercel.app/api/health
```

ผลลัพธ์:
```json
{
  "ok": true,
  "db": "neondb",
  "now": "2026-05-15T...",
  "version": "PostgreSQL 16.x"
}
```

## 4. Local Development

```bash
npm run dev
```

ใช้ `vercel dev` ที่จะ:
- Serve `index.html` ที่ `http://localhost:3000`
- Run `/api/*` endpoints
- โหลด `.env.local` อัตโนมัติ

## 5. Deploy to Vercel

```bash
npm run deploy
# หรือ push ไป GitHub แล้วเชื่อมกับ Vercel
```

> ✅ `DATABASE_URL` ตั้งไว้ใน Vercel env vars แล้ว — ไม่ต้องตั้งเพิ่ม

## 📊 ตารางในฐานข้อมูล (Schema)

| Table | Purpose |
|---|---|
| **workspaces** | Multi-tenant (currently 1 row: 'default') |
| **users** | สมาชิก + role + avatar + PIN |
| **tasks** | งาน + assignees (JSONB) + position |
| **documents** | Library docs |
| **notes** | Google Keep-style notes (per user) |
| **live_sessions** | Facebook Live + audience JSONB |
| **opts** | Tag definitions (status/priority/type) — seed ไว้แล้ว 10 row |
| **workspace_meta** | nextTaskId, columnWidths, settings |
| **workspace_snapshot** | Full JSONB snapshot (สำหรับ sync แบบ Firebase) |

ดูรายละเอียดเต็มที่ [`db/schema.sql`](db/schema.sql)

## 🔌 API Endpoints

### `GET /api/health`
ทดสอบการเชื่อมต่อฐานข้อมูล

### `GET /api/workspace`
ดึง workspace snapshot (full state)
```json
{ "ok": true, "exists": true, "updatedAt": "...", "users": [...], "tasks": [...] }
```

### `POST /api/workspace`
บันทึก workspace snapshot
```bash
curl -X POST https://YOUR.vercel.app/api/workspace \
  -H "Content-Type: application/json" \
  -d '{"users":[],"tasks":[],"_updatedBy":"alice"}'
```

### `POST /api/init-db`
สร้างตาราง (run schema.sql) — ใช้ครั้งเดียว

## 🎯 Next Steps (อยากให้ frontend ใช้ Neon แทน Firebase?)

ตอนนี้ frontend ยังใช้ **localStorage + Firebase** สำหรับ sync
ถ้าต้องการเปลี่ยนเป็น Neon บอกได้ — จะแก้ไฟล์ `index.html` ให้:
- เรียก `GET /api/workspace` แทน Firebase listener
- เรียก `POST /api/workspace` แทน Firestore set
- เก็บ localStorage เป็น offline cache

## 🔧 Troubleshooting

### `DATABASE_URL is not set`
- ตรวจ `.env.local` ว่ามี DATABASE_URL จริงไหม
- ตรวจ Vercel env vars ที่หน้า Project Settings → Environment Variables

### `Error: getaddrinfo ENOTFOUND`
- Connection string ผิด หรือเครือข่ายต่อ Neon ไม่ได้
- ใช้ pooled connection string (มี `-pooler` ในชื่อ host)

### `relation "workspaces" does not exist`
- ยังไม่ได้รัน `npm run init-db` หรือ `POST /api/init-db`

### Rate limit / Connection limit
- Neon Free Tier มี connection limit ~100
- ใช้ pooled connection string เสมอ (มี `-pooler.` ใน hostname)
