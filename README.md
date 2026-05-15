# TFL+ Workspace

แอปพลิเคชันจัดการงาน + ทีมในไฟล์เดียว (Single HTML) — มี Kanban, Database View, Notes แบบ Google Keep, จัดการสมาชิก, Google Drive integration, และ Real-time sync ผ่าน Firebase

![Deploy with Vercel](https://vercel.com/button)

## 🎯 ฟีเจอร์หลัก

- 📋 **Task Management** — Kanban Board + Database Table + Checklist
- 👥 **Team Management** — Admin/Member roles + PIN 6 หลัก
- 📝 **Notes** — แบบ Google Keep (per-user)
- 📂 **Google Drive Integration** — เก็บไฟล์ใน Drive folder
- 🔄 **Real-time Sync** — ผ่าน Firebase Firestore (ทำงานพร้อมกันหลายคน)
- 📱 **Responsive** — มือถือ / iPad / PC
- 🔐 **PIN Security** — แต่ละ user มีรหัส 6 หลัก
- 💾 **Persistent** — เก็บข้อมูลใน localStorage + Firebase

---

## 🚀 Quick Start (5 นาที)

### Step 1: ตั้งค่า Firebase (สำหรับ Real-time Sync)

> หากไม่ต้องการ sync ข้ามอุปกรณ์ ข้ามไป Step 2 ได้เลย (ใช้ localStorage อย่างเดียว)

1. ไปที่ **https://console.firebase.google.com**
2. กด **"Add project"** / **"สร้างโปรเจกต์"** → ตั้งชื่อ เช่น `tfl-workspace`
3. ปิด Google Analytics (ไม่จำเป็น) → กด **Create Project**
4. หน้า Project Overview → กดไอคอน `</>` (Web)
5. ตั้งชื่อ app เช่น "TFL Workspace Web" → **Register app**
6. **คัดลอก config** ที่ Firebase แสดง:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "xxxxx.firebaseapp.com",
     projectId: "xxxxx",
     storageBucket: "xxxxx.appspot.com",
     messagingSenderId: "123456",
     appId: "1:123:web:abc..."
   };
   ```
7. เปิดไฟล์ **`index.html`** → ค้นหาคำว่า `FIREBASE_CONFIG` → วางค่าจาก Firebase ลงไป:
   ```javascript
   const FIREBASE_CONFIG = {
     apiKey: "AIzaSy...",          // ← วางจาก Firebase
     authDomain: "xxxxx.firebaseapp.com",
     projectId: "xxxxx",
     storageBucket: "xxxxx.appspot.com",
     messagingSenderId: "123456",
     appId: "1:123:web:abc..."
   };
   ```
8. ใน Firebase Console → เมนูซ้าย **Build** → **Firestore Database** → **Create database** → เลือก location ใกล้ๆ (เช่น asia-southeast1) → **Start in test mode** → **Enable**

### Step 2: Upload to GitHub

```bash
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/USERNAME/tfl-workspace.git
git branch -M main
git push -u origin main
```

หรือใช้วิธีง่ายๆ ผ่านเว็บ GitHub:
1. ไปที่ https://github.com/new สร้าง repo ใหม่
2. กด **"uploading an existing file"**
3. ลากไฟล์ `index.html` + `README.md` วาง → Commit

### Step 3: Deploy บน Vercel

1. ไปที่ https://vercel.com → Sign in ด้วย GitHub
2. **Add New → Project**
3. เลือก repo ที่เพิ่งสร้าง
4. Framework Preset: **Other** (ปล่อยค่า default ทั้งหมด)
5. กด **Deploy** → รอ ~30 วินาที
6. ✅ ได้ URL เช่น `https://tfl-workspace-xxx.vercel.app`

### Step 4: เพิ่ม Vercel URL ใน Firebase

1. กลับไป **Firebase Console** → Authentication (ถ้ามี) หรือ Project Settings
2. ที่ Authorized domains → Add domain → ใส่ URL Vercel ของคุณ

หากใช้ **Google Drive integration**:
1. ไปที่ https://console.cloud.google.com
2. APIs & Services → Credentials → OAuth 2.0 Client ID
3. **Authorized JavaScript origins** → Add: `https://tfl-workspace-xxx.vercel.app`

---

## 🔐 Firestore Security Rules

### โหมด Test (ใช้ได้ 30 วัน)
Firebase สร้างให้อัตโนมัติ — ใครก็อ่าน/เขียนได้ ใช้ทดสอบเฉยๆ

### โหมด Production (แนะนำหลัง 30 วัน)
ใน Firebase Console → Firestore Database → **Rules** → วาง:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // เปิดให้อ่าน/เขียนได้ทุกคน — สำหรับทีมเล็ก/ส่วนตัว
    // เปลี่ยน workspace ID ในโค้ดเพื่อให้แต่ละทีมแยกข้อมูล
    match /workspaces/{workspaceId} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ **คำเตือนความปลอดภัย**: rules นี้ไม่มี authentication ใครรู้ URL ก็เข้าได้  
> ความปลอดภัยจริงๆ คือ:
> - URL ของ Vercel ที่ไม่ได้แชร์ออกไป
> - PIN 6 หลักของแต่ละ user
> - Workspace ID (เปลี่ยนให้ unique)
>
> หากต้องการความปลอดภัยสูงสุด → เพิ่ม Firebase Authentication (ต้องเขียนโค้ดเพิ่ม)

---

## 👤 การใช้งานครั้งแรก

1. เปิด URL Vercel → หน้า Login แสดง 4 user default
2. เลือก user → กด **เข้าสู่ระบบ**
3. ระบบถาม PIN ใหม่ → ตั้ง 6 หลัก → ยืนยันอีกครั้ง
4. เข้าสู่ระบบสำเร็จ

### Admin Default
- **Tafu Lao Plus** (`tafu@tfl.com`) เป็น Admin

### Member Default
- noungning, paylay, Noii VINUTDA

### เพิ่ม Member ใหม่
- หน้า Login → ปุ่ม **"+ เพิ่มสมาชิก"**
- หรือ Admin login → ADMIN → จัดการสมาชิก → **+ เพิ่มสมาชิก**

---

## 📦 ไฟล์ในโปรเจกต์

```
tfl-workspace/
├── index.html        ← เว็บแอป (single file)
├── README.md         ← คู่มือนี้
├── .gitignore        ← Git ignore rules
└── firestore.rules   ← Firebase security rules (optional)
```

---

## 🛠️ การแก้ปัญหา

### ข้อมูลไม่ sync ข้ามอุปกรณ์
- ตรวจสอบ FIREBASE_CONFIG ในไฟล์ — ค่าทุก field ต้องมี
- เปิด DevTools (F12) → Console → ดู `[Sync] Firebase connected` ไหม
- ถ้าเห็น `[Sync] Firebase not configured` = ยังไม่ได้ตั้งค่า

### Console error "Missing or insufficient permissions"
- Firestore Rules ผิด → ใช้ test mode หรือใส่ rules ตามที่เขียนด้านบน

### Google Drive integration ไม่ทำงาน
- ต้องอยู่บน `https://` (Vercel) ไม่ใช่ `file://`
- เพิ่ม Vercel URL ใน Google Cloud Console → OAuth → Authorized origins

### PIN ลืม
- Admin → จัดการสมาชิก → คลิกการ์ดสมาชิก → ปุ่ม **รีเซ็ต PIN** → user จะตั้งใหม่ตอนล็อกอินครั้งถัดไป

### ข้อมูลหายหลังอัพเดต Vercel
- ใช้ฟังก์ชัน **Export ข้อมูล (.json)** ก่อน deploy ใหม่ — เก็บ JSON ไว้ → Import กลับเข้าหลัง deploy

---

## 🔄 การอัปเดต

1. แก้ไข `index.html`
2. `git add . && git commit -m "Update" && git push`
3. Vercel auto-deploy ภายใน ~30 วินาที

---

## 📊 Workspace ID (สำหรับหลายทีม)

ถ้ามีหลายทีมต้องการแยกข้อมูล:

```javascript
const FIREBASE_WORKSPACE = 'tfl-workspace-default';  // เปลี่ยนเป็นชื่อทีม
```

แต่ละทีมใช้ workspace ID ต่างกัน → ข้อมูลแยกกันโดยสิ้นเชิง

---

## 💬 ติดต่อ / สนับสนุน

ถ้าเจอปัญหา หรือต้องการฟีเจอร์เพิ่ม สามารถแจ้งได้
