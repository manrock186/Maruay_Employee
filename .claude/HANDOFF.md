# Handoff Log — Maruay_Employee

> บันทึกการเปลี่ยนแปลงทุกครั้งที่ทำงานกับโปรเจกต์นี้ **เรียงใหม่สุดไว้บนสุด**
> รูปแบบแต่ละ entry: วันที่ · ทำอะไร · ทำไม · ไฟล์/DB ที่แตะ · งานค้าง/ต่อไป
> คู่กับ `.claude/DEV_SETUP.md` (context ถาวร)

---

## 2026-08-28 — แก้บั๊ก "กดบันทึกแล้วหน้าจอไม่เปลี่ยน"

**อาการ:** หน้า "แก้ไขข้อมูลพนักงาน" (และหน้าอื่นที่ใช้ ops.*.update) กดบันทึกแล้ว UI ไม่อัปเดต
ทั้งที่ข้อมูลเข้า DB จริง (ยืนยันจาก `audit_log`: UPDATE ของ owner ลงครบทุกครั้ง)

**สาเหตุ:** แอปพึ่ง Supabase Realtime `postgres_changes` เป็นทางเดียวในการ refresh state หลังเขียน
ถ้า realtime หลุด/ช้า/ถูก RLS กรอง → state ไม่ขยับ และ `updateRow` เดิมไม่ได้ `.select()`
จึงแยกไม่ออกระหว่าง "สำเร็จ" กับ "RLS บล็อก แก้ 0 แถว" (Postgres ไม่ throw error ในกรณีหลัง)

**แก้อะไร** (`src/App.jsx` ไฟล์เดียว, +100/-9)
- `syncLocal(table, action, row, id)` — insert/update/delete อัปเดต React state ทันทีหลังเขียนสำเร็จ ไม่รอ realtime
- `updateRow` ใช้ `.select()` แล้ว; ถ้าได้ 0 แถว = ไม่มีสิทธิ์/ไม่มีแถวนั้น → alert แทนที่จะเงียบ
- `syncLocal` delete ทำ cascade ใน state ตาม FK จริงของ DB
  (ลบธุรกิจ → ล้าง zones/positions/employees/notifications; ลบโซน → `employees.zoneId = null`;
   ลบตำแหน่ง → null `positionId`/`parentId`; ลบพนักงาน → null `managerId`)
- `refetchCore()` — ดึงข้อมูลหลักใหม่เมื่อกลับมาที่แท็บ (throttle 30 วิ) และเมื่อ realtime ต่อกลับได้
  พร้อม seq/epoch guard กันผลลัพธ์เก่ามาทับสิ่งที่เพิ่งบันทึก + retry แบบมีเพดาน 3 ครั้ง
- `canPayRef` — สิทธิ์ดูเงินเดือนเปลี่ยนได้โดย role ไม่เปลี่ยน; closure ใน useEffect เดิมเห็นค่าเก่า
  ทำให้ตัดคอลัมน์เงินผิด (โชว์ 0 ทั้งระบบ หรือรั่วให้คนที่เพิ่งถูกยึดสิทธิ์) → ย้ายไปอ่านจาก ref
- ย้าย `stripEmployeePay` / `stripPositionPay` เป็น module-level ใช้ร่วมกันทุกทางเข้าข้อมูล

**ไฟล์ที่แตะ:** `src/App.jsx` เท่านั้น · DB: ไม่แก้ · build ผ่าน (656 kB)

**ตรวจแล้ว:** review 3 รอบด้วย subagent — ไล่ FK/RLS/policy จริงบน Supabase, เช็ค StrictMode,
race condition, retry runaway, ผู้เรียก `updateRow` ทุกจุด — รอบสุดท้ายไม่พบ defect

**งานค้าง:**
- refactor `src/App.jsx` (5,998 บรรทัด) → แยก lib/ui/components/pages + React.lazy (คาด bundle เหลือ ~250-300 kB)
- UI/UX: รอ user ระบุจุดที่จะปรับ
- ยังไม่ได้ยืนยัน root cause ว่า realtime พังจริงไหม (cloud ต่อ supabase.co ไม่ได้) — แต่ fix ครอบทั้งสองกรณี

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
