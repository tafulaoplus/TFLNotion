# 🚀 คู่มือ Deploy (สำหรับเพื่อนที่ขึ้นเว็บให้)

> เป้าหมาย: ขึ้นเว็บออนไลน์ ใช้งานหลายคนพร้อมกัน ข้อมูล sync แบบ real-time

**เวลาที่ใช้: ~10-15 นาที**

---

## ✅ Checklist

- [ ] Step 1: สร้าง Firebase Project
- [ ] Step 2: Copy Firebase Config มาวางในไฟล์
- [ ] Step 3: เปิด Firestore Database
- [ ] Step 4: Upload code ขึ้น GitHub
- [ ] Step 5: Deploy ผ่าน Vercel
- [ ] Step 6: Test ว่า Sync ใช้งานได้

---

## Step 1: สร้าง Firebase Project (2 นาที)

1. เปิด **https://console.firebase.google.com**
2. กด **"Add project"** หรือ **"เพิ่มโครงการ"**
3. ตั้งชื่อ → เช่น `tfl-workspace` → Continue
4. **ปิด** Google Analytics → Continue
5. รอสร้างเสร็จ → Continue
6. หน้าแรกของ Project → กดไอคอน **`</>`** (Web)
7. ตั้ง nickname เช่น "TFL Web" → **Register app**
8. **คัดลอก** config ตรงนี้ (เก็บไว้ก่อน):
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "...firebaseapp.com",
     projectId: "...",
     storageBucket: "...appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
9. กด **Continue to console**

---

## Step 2: วาง Config ในไฟล์ (1 นาที)

1. เปิดไฟล์ **`index.html`** ด้วย Notepad / VS Code
2. กด `Ctrl+F` ค้นหา: `FIREBASE_CONFIG`
3. หาส่วนนี้ (ประมาณบรรทัด 1130):
   ```javascript
   const FIREBASE_CONFIG = {
     apiKey: "",
     authDomain: "",
     projectId: "",
     storageBucket: "",
     messagingSenderId: "",
     appId: ""
   };
   ```
4. **วางค่าจาก Firebase ลงไป** ระหว่างเครื่องหมายคำพูด `""`:
   ```javascript
   const FIREBASE_CONFIG = {
     apiKey: "AIzaSy...",                        // ← วางตรงนี้
     authDomain: "xxx.firebaseapp.com",          // ← วางตรงนี้
     projectId: "xxx",                            // ← วางตรงนี้
     storageBucket: "xxx.appspot.com",           // ← วางตรงนี้
     messagingSenderId: "123456",                 // ← วางตรงนี้
     appId: "1:123:web:abc..."                   // ← วางตรงนี้
   };
   ```
5. **Save ไฟล์**

---

## Step 3: เปิด Firestore Database (2 นาที)

1. ใน Firebase Console → เมนูซ้าย **Build** → **Firestore Database**
2. กด **Create database**
3. เลือก **Location**: `asia-southeast1 (Singapore)` (ใกล้ไทยที่สุด)
4. เลือก **Start in test mode** → Next → **Enable**
5. รอ ~30 วินาที จนสร้างเสร็จ

> ⚠️ Test mode ใช้ได้ 30 วัน หลังจากนั้นต้องอัปเดต Rules
> (ดู `firestore.rules` ในโปรเจกต์)

---

## Step 4: Upload ขึ้น GitHub (3 นาที)

### วิธีง่าย — ผ่านเว็บ GitHub
1. ไปที่ **https://github.com/new**
2. Repository name: `tfl-workspace` (หรือชื่ออะไรก็ได้)
3. **Public** หรือ **Private** ก็ได้
4. กด **Create repository**
5. หน้าถัดไป → กด **"uploading an existing file"**
6. ลากไฟล์ทั้งหมดในโฟลเดอร์ (index.html, README.md, ฯลฯ) มาวาง
7. Commit changes

### วิธีผ่าน Command Line
```bash
cd path/to/tfl-workspace
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/USERNAME/tfl-workspace.git
git branch -M main
git push -u origin main
```

---

## Step 5: Deploy บน Vercel (3 นาที)

1. ไปที่ **https://vercel.com**
2. **Sign in with GitHub** → อนุญาตให้ Vercel เข้าถึง repos
3. กด **Add New → Project**
4. หา repo `tfl-workspace` → กด **Import**
5. ตั้งค่า:
   - **Project Name**: tfl-workspace (หรือชื่ออะไรก็ได้)
   - **Framework Preset**: `Other`
   - ✅ ปล่อยค่าอื่นเป็น default
6. กด **Deploy**
7. รอ ~30 วินาที → ✅ ได้ URL เช่น `https://tfl-workspace.vercel.app`

---

## Step 6: Test การใช้งาน (1 นาที)

1. เปิด URL Vercel บน **Chrome**
2. เลือก user → ตั้ง PIN → เข้าระบบ
3. **เพิ่มงานใหม่ 1 รายการ**
4. เปิด URL เดียวกันบน **Edge** (หรือมือถือ)
5. Login user เดียวกัน หรือคนละ user ก็ได้
6. **✅ ต้องเห็นงานที่เพิ่งสร้างจาก Chrome ทันที**

ถ้าเห็น → 🎉 sync ใช้งานได้
ถ้าไม่เห็น → เปิด DevTools (F12) → Console → ตรวจสอบ error

---

## 🔧 การอัปเดตในอนาคต

1. แก้ไข `index.html`
2. push ขึ้น GitHub:
   ```bash
   git add .
   git commit -m "Update"
   git push
   ```
3. Vercel จะ **auto-deploy** ภายใน ~30 วินาที — ไม่ต้องทำอะไรเพิ่ม

---

## ❓ ปัญหาที่อาจเจอ

### "Permission denied" บน Firestore
→ ใช้ Test Mode หรือ apply rules จาก `firestore.rules`

### Sync ไม่ทำงาน
- เช็คว่า FIREBASE_CONFIG ใส่ครบทุก field
- เปิด Console (F12) ดู `[Sync] Firebase connected`

### ข้อมูลเก่ายังอยู่หลัง Deploy
- เคลียร์ localStorage: DevTools → Application → Local Storage → Clear

### Google Drive integration
- ต้องเพิ่ม Vercel URL ใน Google Cloud Console → OAuth Authorized origins

---

## 🆘 ติดต่อ

ถ้าติดขัดตรงไหน ดู `README.md` หรือถามผู้พัฒนา
