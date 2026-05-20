# ระบบจัดการพนักงาน — คู่มือ Deploy

> **เป้าหมาย:** ทำให้แอปออนไลน์ใช้งานได้จากทั้งมือถือและคอม โดยข้อมูล sync กันทันที
>
> **ไม่ต้องใช้ Terminal เลย** ทำผ่านเว็บล้วนๆ ใช้เวลาประมาณ 30–45 นาที

---

## สิ่งที่ต้องเตรียม

- ✅ บัญชี **Supabase** (มีแล้ว)
- ✅ บัญชี **Vercel** (มีแล้ว)
- ☐ บัญชี **GitHub** — ถ้ายังไม่มี สมัครฟรีที่ [github.com](https://github.com)

---

## ขั้นตอนภาพรวม

```
1. Supabase  →  สร้าง project + รัน SQL    (10 นาที)
2. GitHub    →  สร้าง repo + อัปไฟล์       (10 นาที)
3. Vercel    →  เชื่อม GitHub + deploy     (10 นาที)
4. ทดสอบ     →  สมัคร owner + ใช้งาน        (5 นาที)
```

---

# 🔵 ขั้นที่ 1: Supabase

### 1.1 สร้าง Project ใหม่

1. เปิด [supabase.com](https://supabase.com) → **Sign in**
2. ที่ dashboard กด **New Project**
3. กรอก:
   - **Name:** `employee-management` (หรือชื่อที่ชอบ)
   - **Database Password:** สร้าง password แล้วเก็บไว้ (ใช้ภายหลังตอน reset DB ได้)
   - **Region:** เลือก `Southeast Asia (Singapore)` หรือใกล้สุด
   - **Plan:** Free
4. กด **Create new project** → รอประมาณ 1–2 นาที

### 1.2 รัน SQL Setup

1. ที่แถบซ้าย กดไอคอน **SQL Editor** (รูปฐานข้อมูล `</>`)
2. กด **+ New query**
3. เปิดไฟล์ `SUPABASE_SETUP.sql` ในเครื่อง → คัดลอกเนื้อหา **ทั้งหมด**
4. **Paste** ลงในช่อง SQL Editor
5. กดปุ่ม **Run** (มุมขวาล่าง หรือ Ctrl+Enter)
6. รอจน success — จะเห็น "Success. No rows returned" หรือคล้ายๆ

> ✅ ตอนนี้ database พร้อมแล้ว — ตารางทั้งหมดถูกสร้าง พร้อมระบบ login และความปลอดภัย

### 1.3 ปิดการยืนยันอีเมล (แนะนำ — เพื่อให้สมัครได้ทันที)

1. แถบซ้าย → **Authentication** → **Sign In / Up** (หรือ **Providers**)
2. หา **Email** → กดเข้าไป
3. **ปิด** ตัวเลือก "Confirm email" (เลื่อน toggle ไปทางซ้าย)
4. กด **Save**

> ถ้าไม่ปิด คุณจะต้อง verify อีเมลก่อนใช้งานครั้งแรก (ก็ได้ แต่ยุ่งกว่า)

### 1.4 คัดลอก API Credentials

1. แถบซ้าย → **Settings** (รูปเฟือง) → **API**
2. จะเห็น 2 ค่าสำคัญ — **เปิดหน้านี้ค้างไว้** เดี๋ยวต้องใช้:
   - **Project URL** (ขึ้นต้นด้วย `https://...supabase.co`)
   - **anon public** (key ยาวๆ ขึ้นต้นด้วย `eyJ...`)

> ⚠️ **อย่าคัดลอก `service_role` key** — อันนั้นห้ามให้คนอื่นเห็นเด็ดขาด เราใช้แค่ anon key

---

# 🟣 ขั้นที่ 2: GitHub

### 2.1 สร้าง Repository ใหม่

1. เข้า [github.com](https://github.com) → Sign in
2. มุมขวาบน กด **+** → **New repository**
3. กรอก:
   - **Repository name:** `employee-management`
   - **Public** หรือ **Private** ก็ได้ (Private ปลอดภัยกว่า)
   - **อย่าติ๊ก** "Add a README" หรือ ".gitignore" (เพราะเรามีไฟล์ของตัวเอง)
4. กด **Create repository**

### 2.2 อัปโหลดไฟล์โปรเจค

หน้าที่เปิดถัดไปจะมีข้อความ "Quick setup — if you've done this kind of thing before"

1. มองหาลิงก์ **"uploading an existing file"** (สีฟ้า) → กดเข้าไป

2. หน้าใหม่จะมีกล่อง drop zone — ให้ทำดังนี้:

   **เปิด File Explorer (Windows) หรือ Finder (Mac) ไปที่โฟลเดอร์ที่แตกไฟล์ zip ของผม**

   **ลาก** ไฟล์และโฟลเดอร์ทั้งหมดมาวางในกล่อง drop zone:
   - `package.json`
   - `vite.config.js`
   - `tailwind.config.js`
   - `postcss.config.js`
   - `index.html`
   - `.env.example`
   - `.gitignore`
   - `README.md`
   - `SUPABASE_SETUP.sql`
   - **โฟลเดอร์ `src/`** ทั้งโฟลเดอร์ (มีไฟล์ `App.jsx`, `main.jsx`, `index.css`, `supabase.js` อยู่ข้างใน)

   > 💡 ลากทุกอย่างพร้อมกันได้เลย — เลือกทั้งหมดแล้วลากมาวาง

3. รอ upload เสร็จ (จะเห็นชื่อไฟล์ปรากฏ)

4. เลื่อนลงล่างสุด ในช่อง **Commit changes**:
   - ใส่ข้อความ: `Initial commit`
   - เลือก **Commit directly to main branch**
5. กด **Commit changes**

> ✅ ตอนนี้โค้ดอยู่บน GitHub แล้ว

---

# 🟢 ขั้นที่ 3: Vercel

### 3.1 Import Project จาก GitHub

1. เข้า [vercel.com](https://vercel.com) → Sign in
2. หน้า dashboard กด **Add New...** → **Project**
3. ในรายการ Git repository หา `employee-management` → กด **Import**
   - ถ้าไม่เห็น repo: กด **Adjust GitHub App Permissions** → อนุญาตให้ Vercel เข้าถึง repo

### 3.2 ตั้งค่า Environment Variables

ก่อนกด Deploy ให้ทำขั้นตอนนี้ก่อน — สำคัญที่สุด!

1. ในหน้า Configure Project เลื่อนลงหา **Environment Variables**
2. เพิ่ม 2 ตัวแปร (กลับไปดูที่หน้า Supabase Settings → API):

   **ตัวที่ 1:**
   - Name: `VITE_SUPABASE_URL`
   - Value: (paste Project URL จาก Supabase)

   **ตัวที่ 2:**
   - Name: `VITE_SUPABASE_ANON_KEY`
   - Value: (paste anon public key จาก Supabase)

   > ⚠️ ชื่อตัวแปรต้องตรงเป๊ะ — มี `VITE_` นำหน้า ห้ามผิด

3. ส่วนอื่นๆ ปล่อยตามค่า default (Vercel จะตรวจเจอว่าเป็น Vite อัตโนมัติ)

### 3.3 Deploy

1. กดปุ่ม **Deploy**
2. รอ 1–3 นาที จน build เสร็จ
3. จะเห็น "Congratulations!" พร้อม URL ของแอป
4. กด **Visit** หรือ **Continue to Dashboard** เพื่อดู URL

> 🎉 แอปของคุณออนไลน์แล้ว! URL จะเป็น `https://employee-management-xxxxx.vercel.app`

---

# 🎯 ขั้นที่ 4: ทดสอบใช้งาน

### 4.1 สมัครเป็น Owner

1. เปิด URL ที่ Vercel ให้
2. กดแท็บ **สมัครสมาชิก**
3. กรอกชื่อ, อีเมล, รหัสผ่าน → **สมัครสมาชิก**

   > **คนแรกที่สมัคร = เจ้าของระบบอัตโนมัติ** (ทำเองได้เลยไม่ต้องอนุมัติ)

4. ระบบจะให้เข้าใช้งานทันที (ถ้าปิด email confirmation ในขั้น 1.3)

### 4.2 ทดสอบ Cross-Device Sync

1. เปิด URL เดียวกันบนมือถือ → login ด้วยอีเมล/รหัสเดียวกัน
2. ลองเพิ่มธุรกิจในคอม → ดูที่มือถือ (ควรขึ้นใน <1 วินาที)
3. แก้ไขที่มือถือ → ดูในคอม

> ✨ ถ้า sync ทันที — ทุกอย่าง work เรียบร้อย

---

# 📌 การใช้งาน — Flow แนะนำ

1. **เพิ่มธุรกิจ** ที่หน้า "ธุรกิจและโซน"
2. **เพิ่มโซน** ใน business card (กดปุ่ม "เพิ่มโซน")
3. **เพิ่มตำแหน่ง** ที่หน้า "ตำแหน่ง" (มี checkbox "ไม่จำกัดโซน" สำหรับผู้จัดการที่ดูแลข้ามโซน)
4. **เพิ่มพนักงาน** ที่หน้า "พนักงาน"
5. ดู **แผนผังองค์กร** เพื่อตรวจสายบังคับบัญชา

---

# 🔐 ถ้าอยากเพิ่ม "หัวหน้าโซน" ทีหลัง

1. ให้เขา**สมัครสมาชิกเอง**ที่หน้าเว็บ → เขาจะอยู่ในสถานะ "รออนุมัติ"
2. คุณ (owner) เข้าหน้า **ผู้ใช้ระบบ** → กดปุ่มแก้ไขข้างชื่อเขา
3. เปลี่ยน role เป็น **หัวหน้าโซน** → เลือกธุรกิจและโซนให้
4. เขาจะเข้าใช้งานได้ทันที (เห็นเฉพาะพนักงานในโซนของตัวเอง)

---

# 🆘 Troubleshooting

### Build ผิดพลาดที่ Vercel
- เช็คว่า upload ไฟล์ครบทุกตัว โดยเฉพาะ `package.json` และโฟลเดอร์ `src/`
- เช็ค environment variables — ชื่อต้องตรง `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY`

### Login ไม่ได้ — "Invalid login credentials"
- ถ้าเพิ่งสมัคร — เช็คอีเมล (กล่อง spam) หาลิงก์ confirm
- หรือกลับไปขั้น 1.3 ปิด "Confirm email" ใน Supabase แล้วลองสมัครใหม่

### ข้อมูลไม่ sync ข้ามเครื่อง
- เช็คใน Supabase → Database → Replication → ดูว่ามีตารางอยู่ใน `supabase_realtime` publication
- ถ้าไม่มี ให้รัน SQL ส่วนท้ายอีกครั้ง (มีบรรทัด `alter publication supabase_realtime add table...`)

### "Missing Supabase credentials" ขึ้นในเว็บ
- Environment variables ยังไม่ถูกตั้ง → กลับไปที่ Vercel Project → Settings → Environment Variables → เพิ่มให้ครบ
- หลังเพิ่ม environment variable ใหม่ ต้อง **Redeploy** (ที่ Deployments tab → กดจุดสามจุด → Redeploy)

### อยากเปลี่ยน URL ของเว็บ
- Vercel Project → Settings → Domains → Add → ใส่ custom domain ของคุณ (ถ้ามี) หรือเปลี่ยนชื่อ `.vercel.app`

---

# 💡 หมายเหตุ

- **ค่าใช้จ่าย:** ฟรีหมดทั้ง Supabase, Vercel, GitHub (ในแพลน Free ที่กำลังใช้)
- **ข้อจำกัด Free tier:**
  - Supabase: 500MB database, 50,000 monthly active users
  - Vercel: 100GB bandwidth/เดือน
  - เพียงพอเหลือเฟือสำหรับการใช้งานภายในธุรกิจ
- **รูปพนักงาน** ตอนนี้เก็บเป็น base64 ในฐานข้อมูล (รูปจะถูก resize เหลือ 400px อัตโนมัติ) — เหมาะกับพนักงานหลักร้อยคน ถ้ามีพนักงานเยอะกว่านี้ค่อยย้ายไปใช้ Supabase Storage

---

**ทุกอย่างพร้อม — ขอให้สนุกกับการใช้งานครับ! 🌿**
