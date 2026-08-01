# Handoff Log — Maruay_Employee

> บันทึกการเปลี่ยนแปลงทุกครั้งที่ทำงานกับโปรเจกต์นี้ **เรียงใหม่สุดไว้บนสุด**
> รูปแบบแต่ละ entry: วันที่ · ทำอะไร · ทำไม · ไฟล์/DB ที่แตะ · งานค้าง/ต่อไป
> คู่กับ `.claude/DEV_SETUP.md` (context ถาวร)

---

## 2026-08-01 — ตั้งค่าเชื่อมต่อ + วางระบบ handoff

**ทำอะไร**
- หาโค้ดเจอที่ GitHub `manrock186/Maruay_Employee` แล้ว clone เข้า cloud
- เชื่อม Supabase project **Maruay_Employee** (`okvkwvfrfyujngjqtcqw`) ผ่าน `.env.local`
- เพิ่ม `.gitignore` (repo เดิมไม่มีเลย → เสี่ยง commit node_modules/.env)
- เพิ่ม `.env.example` เป็น template
- `npm install` + `npm run build` ผ่าน ✅
- เช็ค security advisors: ไม่มี error (มีแต่ WARN)
- วางระบบ handoff: สร้าง `.claude/DEV_SETUP.md` + `.claude/HANDOFF.md`

**ทำไม**
- เตรียมให้พร้อมพัฒนาต่อ และกันลืม context ระหว่าง session

**ไฟล์ที่แตะ**
- เพิ่ม: `.gitignore`, `.env.local` (ไม่ commit), `.env.example`, `.claude/DEV_SETUP.md`, `.claude/HANDOFF.md`
- DB: ไม่มีการเปลี่ยนแปลง (อ่านอย่างเดียว)

**งานค้าง / ต่อไป**
- รอ user บอกว่าจะพัฒนาฟีเจอร์อะไรต่อ
- (ตัวเลือก) push ไฟล์ `.claude/` + `.gitignore` + `.env.example` ขึ้น GitHub เพื่อให้ถาวร

---

<!-- เพิ่ม entry ใหม่ไว้เหนือเส้นนี้ -->
