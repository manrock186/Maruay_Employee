# Handoff Log — Maruay_Employee

> บันทึกการเปลี่ยนแปลงทุกครั้งที่ทำงานกับโปรเจกต์นี้ **เรียงใหม่สุดไว้บนสุด**
> รูปแบบแต่ละ entry: วันที่ · ทำอะไร · ทำไม · ไฟล์/DB ที่แตะ · งานค้าง/ต่อไป
> คู่กับ `.claude/DEV_SETUP.md` (context ถาวร)

---

## 2026-08-30 — เปลี่ยนหน้าเงินเดือนจากจัดกลุ่มตาม "โซน" เป็น "แผนก"

**ทำอะไร** (user เปลี่ยนใจจากรอบก่อน — โซนยังอยู่ แค่ไม่ได้ใช้จัดกลุ่มหน้าเงินเดือนแล้ว)
- เพิ่มแนวคิด **แผนก** ตั้งที่ **ตำแหน่ง** (19 แถว) ไม่ใช่รายคน (32 แถว)
  พนักงานได้แผนกจากตำแหน่งที่ถืออยู่ *ในธุรกิจนั้นๆ* (ผ่าน `businessPositionId`) คนที่อยู่ 2 ธุรกิจจึงได้แผนกถูกต้องตามบริบท
  เหตุผลที่เลือกแบบนี้: ไล่ข้อมูลจริงแล้วไม่มีเคสที่คนตำแหน่งเดียวกันต้องอยู่คนละแผนก + คนใหม่ได้แผนกอัตโนมัติ
- หน้าเงินเดือนจัดกลุ่มตามแผนก ทั้งโหมด "กรอกเร็ว" และ "รายคน" · ลากสลับลำดับแผนก + ลำดับคนในแผนกได้
- ช่อง "แผนก" ในฟอร์มตำแหน่ง (free text + datalist) · badge แผนกในหน้าตำแหน่ง

**DB — migration `add_position_department` (apply บน production แล้ว)**
- `positions.department text` · seed จากชื่อตำแหน่งครบทั้ง 19 ตำแหน่ง ไม่มีตกหล่น
  รปภ.(6 ตำแหน่ง/5 คน) · ห้องอาหาร(3/9) · ช่าง(2/5) · บริหาร(3/3) · แม่บ้าน(3/3) · สำนักงาน(2/2)
- **`display_order.ref_id` เปลี่ยนจาก uuid → text** เพราะแผนกใช้ "ชื่อ" เป็นคีย์ (ไม่ใช่แถวที่มี id)
  kind check ขยายเป็น ('employee','zone','department') · seed ลำดับแผนก 6 แถว

**จุดที่ต้องระวังต่อ**
- ชื่อแผนกเป็น **คีย์ระดับ global ข้ามธุรกิจ** → datalist ในฟอร์มตำแหน่งต้องดึงจาก `allPositions`
  (ไม่ใช่ตำแหน่งเฉพาะธุรกิจ) ไม่งั้นจะพิมพ์ชื่อใกล้เคียงซ้ำ เช่น "ช่าง" vs "ช่างซ่อม" แล้วแยกเป็นคนละกลุ่มถาวร
- `reorderDepartments` union ชื่อแผนกจากทุกธุรกิจ + คีย์ที่มีใน display_order ก่อน merge
  ไม่งั้นลากในธุรกิจหนึ่งจะไปรีเซ็ตลำดับแผนกที่มีแต่ในอีกธุรกิจ
- เปลี่ยนชื่อแผนก = แถวเดิมใน display_order กลายเป็น orphan (กินสลอตแต่ไม่แสดงผล) ไม่พัง แต่ไม่ถูกลบเอง

**ตรวจแล้ว:** subagent review — ไล่ comparator ทั้ง 3 จุดให้ตรงกัน, เคส businessPositions override,
เคสตำแหน่งถูกลบ, แผนกที่ไม่เห็นข้ามธุรกิจ, drag hook กับ id ที่เป็นสตริงไทย, effect churn (drafts ไม่ถูกล้าง)

**งานค้าง:** refactor `src/App.jsx` (~6,400 บรรทัด) · โซนยังใช้จัดลำดับได้แต่ไม่มี UI ลากแล้ว (ลบทิ้งได้ถ้าไม่ใช้)

---

## 2026-08-28 (2) — หน้าเงินเดือน: จัดกลุ่มตามโซน + ลากสลับลำดับ (จำลำดับไว้)

**ทำอะไร**
- หน้าเงินเดือนจัดกลุ่มพนักงานตาม **โซน** มีหัวข้อโซนคั่น ทั้งโหมด "กรอกเร็ว" และ "รายคน"
  คนที่ไม่มีโซน (หรือโซนอยู่คนละธุรกิจ) ไปกลุ่ม "ไม่ระบุโซน" ท้ายสุด
- **ลากสลับลำดับได้**: คนภายในโซนเดียวกัน + สลับลำดับตัวโซนเอง (ข้ามโซนไม่ได้ — โซนของคนแก้ที่หน้าพนักงาน)
  · เดสก์ท็อป: ลากไอคอนจุดหน้าชื่อ · มือถือ: แตะค้าง 350ms ที่หัวการ์ด (ปัดนิ้วก่อนครบ = เลื่อนหน้าจอปกติ)
- ลำดับ **ทุกคนเห็นเหมือนกัน และใช้ทุกหน้า** (state `employees`/`zones` ถูกเรียงที่ต้นทางครั้งเดียว)

**DB — ใช้ migration `add_display_order_table` (apply บน production แล้ว)**
ตารางใหม่ `public.display_order (kind, ref_id, position, updated_at)` PK = (kind, ref_id)
- RLS: อ่านได้ทุกคนที่ล็อกอิน / เขียนได้ owner + business_manager + zone_manager
- อยู่ใน `supabase_realtime` publication → จัดลำดับที่เครื่องหนึ่ง เครื่องอื่นเห็นทันที
- seed ลำดับเริ่มต้นจาก created_at แล้ว (32 คน / 3 โซน) หน้าจอจึงไม่สลับตอน deploy
- **ทำไมไม่ใช้ `employees.sort_order`:** trigger `log_audit` เก็บ row เต็มทุก UPDATE (มีรูป base64 ~56KB/คน)
  → ลากทีเดียว audit_log บวมเป็น MB + realtime ยิง payload หนักไปทุกเครื่อง
- DDL เพิ่มไว้ใน `SUPABASE_SETUP.sql` แล้ว

**โค้ด** (`src/App.jsx`)
- `sortByOrder` / `orderRowsToMap` / `applySubsetOrder` — module-level
- `employeesRaw`/`zonesRaw` = state ดิบ, `employees`/`zones` = useMemo ที่เรียงแล้ว (ชื่อเดิม โค้ดที่เหลือไม่ต้องแก้)
- `useDragReorder` — เขียนเองด้วย Pointer Events ไม่เพิ่ม dependency (HTML5 DnD ใช้บนมือถือไม่ได้)
  · long-press 350ms + ขยับเกิน 8px ก่อนครบ = ยกเลิก (ผู้ใช้ตั้งใจสกrolล)
  · บล็อกสกrolลระหว่างลากด้วย native `touchmove` (passive:false) ผูกตั้งแต่ `pointerdown` — ผูกทีหลังไม่ทัน
    browser ตัดสินใจไปแล้ว จะได้ `cancelable=false`
  · `touch-action:none` ใส่เฉพาะไอคอนจุด (เป้าเล็ก) ไม่ใส่พื้นที่ใหญ่ ไม่งั้นแถบนั้นสกrolลไม่ได้
- `ops.displayOrder.set/reorder` — optimistic + upsert เฉพาะแถวที่เปลี่ยน + rollback ถ้า error

**ตรวจแล้ว:** review 3 รอบด้วย subagent เจอและแก้ไปทั้งหมด 9 จุด ที่สำคัญ:
conditional hook ใน PayrollPage (React crash ตอนเลือก "ทุกธุรกิจ"), ลากแล้วค่าที่พิมพ์ค้างหาย,
touchmove listener ค้างถาวรทำให้ทั้งแอปสกrolลไม่ได้, timer/userSelect ค้างตอน unmount

**งานค้าง:** refactor `src/App.jsx` (ตอนนี้ ~6,300 บรรทัด) · UI/UX จุดอื่นรอ user ระบุ

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
