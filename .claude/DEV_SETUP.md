# Maruay_Employee — Dev Setup & Context

> **อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง** เพื่อไม่ให้ลืม context
> คู่กับ `.claude/HANDOFF.md` (บันทึกการเปลี่ยนแปลงทุกครั้ง เรียงใหม่สุดไว้บน)

## App
- **Repo:** https://github.com/manrock186/Maruay_Employee (public)
- **Stack:** Vite 5 + React 18 + Tailwind 3 — โค้ดหลักไฟล์เดียว `src/App.jsx` (~6,000 บรรทัด)
- **Supabase client:** `src/supabase.js` — อ่าน `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
  มี helper `fromDB` (snake→camel) และ `toDB` (camel→snake)
- **Deploy:** Vercel → https://maruay-employee.vercel.app (env vars ตั้งใน Vercel dashboard)
- **DB setup script:** `SUPABASE_SETUP.sql` ที่ root ของ repo

## Supabase
- **Org:** manrock186 (`jhrkyqptsqfgmadncpiq`)
- **Project:** Maruay_Employee — ref `okvkwvfrfyujngjqtcqw`, region ap-northeast-1 (Tokyo)
- **URL:** https://okvkwvfrfyujngjqtcqw.supabase.co
- **Anon key:** อยู่ใน `.env.local` (gitignored). Publishable key: `sb_publishable_s7eT238IKsKrqXYPMiPonw_xgt-KSaB`
- โปรเจกต์ `maruay-property` (`baaneymhepuljonpqldl`) แยกกัน **ไม่เกี่ยว** กับแอปนี้

## Local dev
```
npm install
npm run dev      # localhost:5173
npm run build    # ยืนยันแล้วว่า build ผ่าน — bundle ~655 kB
```
มี `.env.local` + `.env.example` แล้ว, เพิ่ม `.gitignore` แล้ว (repo เดิมไม่มี)

## Database schema (public, 29 tables, เปิด RLS ทุกตาราง)
- **Core:** businesses, zones, positions, employees, user_profiles
- **Payroll:** payrolls, payroll_items, salary_changes, commission_pools, room_rent_pools, advance_pools, recurring_task_pools, recurring_task_pay, public_holidays
- **Integration:** integration_secrets (ไม่มี policy; edge function property-feed อ่าน) → RPC employee_pool2_feed ฝั่ง maruay-property (docs/property_feed.sql) · lib/propertyFeed.js map เข้าฟอร์ม tenant_rent
- **Commission pool 2:** commission_pool2_config (id=1: sections/rates + form_id ของฟอร์มผู้เช่า) · commission_pool2 (ต่องวด: inputs ยอดใส่เอง, bonuses, results snapshot `source: app|excel`) — ดู lib/pool2.js, pages/Pool2Page.jsx · หน้าคอมดึงยอดรายคนไปลงช่องคอม 2 ของธุรกิจหลัก
- **Commission settings:** commission_settings (ต่อธุรกิจ: utility = รายการสาธารณูปโภครายจ่าย/รายรับ/วิธีหัก — ดู lib/utility.js)
- **Data forms:** data_forms, data_form_submissions (แบบฟอร์มข้อมูลประจำเดือนที่ผู้จัดการกรอก → ประกอบคิดคอม)
- **Order:** display_order (ลำดับพนักงาน/โซน/แผนก)
- **Ops:** contractors, contractor_visits, expense_requests, app_settings
- **System:** notifications, notification_reads, push_subscriptions, audit_log

Multi-tenant: scope ด้วย `business_id` + `zone_id`. RLS ใช้ SECURITY DEFINER helper fns
(current_business_ids, current_zone_ids, current_role, can_manage_payroll, is_system_viewer ฯลฯ)

## ข้อควรรู้ตอนทำงานผ่าน Cloud (Cowork)
- Cloud sandbox ต่อตรงไป `*.supabase.co` ทาง HTTP ไม่ได้ (egress allowlist) → รัน/ทดสอบแอปที่เครื่อง/เบราว์เซอร์
- แก้ DB จาก cloud ใช้ Supabase MCP: `apply_migration` / `execute_sql` / `get_advisors`
- โค้ดอยู่ GitHub (public) → clone เข้า cloud, แก้, แล้ว push กลับ

## Security advisors (ทั้งหมดระดับ WARN ยังไม่บล็อก — ค่อยปรับทีหลัง)
- `function_search_path_mutable` บางฟังก์ชัน → ตั้ง `search_path`
- SECURITY DEFINER helper fns เรียกได้จาก anon/authenticated (น่าจะตั้งใจสำหรับ RLS — ทบทวน)
- extension `pg_net` อยู่ใน schema public
- Auth: leaked-password protection ปิดอยู่ (HaveIBeenPwned) → เปิดได้ใน Auth settings

## สูตรเงินเดือน — วันหยุด (ตั้งแต่ ต.ค. 2569)
- `หยุดเกิน = หยุดจริง − โควต้า` · + = หัก / − = ได้เพิ่ม · `ค่าแรง/วัน = payrolls.salary_rate ÷ 30` (คงที่ 30 ตาม Excel เดิม)
- `salary_rate` = เงินเดือน **เต็มเดือน** ของงวด (ทดลองงาน → เงินทดลอง) — **ไม่ใช่** `base_salary` ที่ถูกเฉลี่ยตามวันเริ่มงาน
- ช่อง "หยุดจริง" ตั้งต้น = โควต้า และช่องว่างตอนบันทึก = โควต้า (`takenOrQuota`) — ห้ามให้ว่าง = 0 เพราะจะกลายเป็นได้เงินเพิ่มเท่าโควต้า
- รูปแบบวันหยุด (`employees.holiday_scheme`): `fixed` ใช้ `holiday_quota` · `calendar` นับ `holiday_weekdays` (0=อา…6=ส) + `public_holidays` (ไม่นับซ้ำวันที่ตรงกับวันหยุดประจำสัปดาห์) ดู `lib/holidays.js`
- `holiday_quota` เป็น **integer** ทั้ง payrolls/employees → ช่องโควต้า step 1 + `Math.round` ตอนบันทึก (หยุดจริงเป็น numeric ใส่ครึ่งวันได้)
- สถิติวันหยุดในหน้าพนักงาน **ไม่เก็บซ้ำ** — คำนวณจากแถว payrolls ของคนนั้น (`ops.payroll.listByEmployee` + `holidayStats`)
- คนที่รับเงินเดือน 2 ธุรกิจ: โควต้า/หยุดจริงอยู่ในแถวของ **ทุก** ธุรกิจ → กรอกวันหยุดที่ธุรกิจหลักที่เดียว อีกธุรกิจปล่อยตั้งต้น (= โควต้า ไม่มีผล)

## คอมมิชชั่น ก้อนที่ 1 (POS) — สูตร (ตั้งแต่ ต.ค. 2569) · `lib/commission.js`
- กองกลาง = กำไร Loyverse (หักต้นทุนแล้ว) − รายการหัก (น้ำไฟรวม, น้ำไฟที่ขาดทุน, ช้อนส้อม …) · กองกลางติดลบ → คอมจาก % = 0 และบันทึกไม่ได้
- คอม 1 = กองกลาง × % (`employees.commission_pct` เป็นค่าตั้งต้น) · entry.amount = ยอดที่ **กำหนดเอง** เท่านั้น (null = คิดจาก % ทุกครั้ง) · base1 = ยอดที่ใช้จริง
- รวม = คอม 1 + คอม 2 (ก้อน 2 ร้านค้า ยังใส่มือ) → **หลังหัก = รวม × (30 − หยุดเกินสิทธิ) ÷ 30** (30 คงที่ ไม่ตามวันจริง — user ตัดสินใจ)
- หยุดเกินสิทธิ = `holidayBalance(payroll).excess` ของงวดนั้น ถ้าทำเงินเดือนแล้ว (อ่านอย่างเดียว) · ยังไม่ทำ → กรอกใน entry
- ส่วนที่หายจากคนหยุด → แบ่งเท่ากันให้คนใน **แผนกเดียวกัน** (employeeDepartment) ที่ไม่ได้หยุดและมีคอม · ไม่มีคนรับ = คงไว้กับบริษัท (unassigned)
- บันทึกคอม → `ops.commission.syncToPayroll` อัปเดต `payrolls.commission` ของแถวงวดนั้นที่ **ยังไม่ปิดงวด** ให้ตรง final (ไม่งั้นคอมเข้าเฉพาะคนที่ยังไม่ทำเงินเดือน)
  ก่อนบันทึกดึงเงินเดือนล่าสุดเทียบก่อน ถ้าเปลี่ยนให้กดบันทึกใหม่ · หน้าเงินเดือนใช้ `commissionEntryTotal(entry)` (final ถ้ามี ไม่งั้น amount+amount2 สำหรับ pool เก่า)
- ผู้บริหาร 2 คน (#038, #039) เป็นพนักงานในระบบ ตำแหน่ง "ผู้บริหาร" แผนกบริหาร ไม่จำกัดโซน — คอม 10% คนละ

## สิทธิ์ "ไม่เห็นเงินเดือน" (user_profiles.can_manage_payroll = false) — เคาะกับ user 2026-10-02
- **ซ่อน:** เงินเดือน · คอมมิชชั่น · เบิกเงิน (เมนู + route ใน App.jsx + RLS `can_access_advances` ต้องมีสิทธิ์เงินเดือน)
- **เห็น:** ค่าห้องพนักงาน (RLS `can_access_roomrent` — BM ที่เมนูเปิด) · งานเสริมประจำ แต่ไม่มีเงิน — **ปิดระดับ DB**: ค่าจ้างอยู่ตาราง `recurring_task_pay`
  (RLS เฉพาะมีสิทธิ์เงินเดือน) `tasks` jsonb ไม่มี defaultPay/amount แล้ว · `ops.recurringTask` รวม/แยกเงินให้ (`mergeRecurringPay`/`splitRecurringPay`)
  · trigger `trg_copy_recurring_pay` คัดลอกค่าจ้างให้พูลเดือนใหม่ (คนสร้างอาจไม่มีสิทธิ์) · `canSeePay=false` ยังซ่อนช่องเงินใน UI ด้วย
- หน้าผู้ใช้ระบบ: ตัวเลือกเมนู "เบิกเงิน" ขึ้นเฉพาะคนมีสิทธิ์เงินเดือน · "ค่าห้องพนักงาน" ขึ้นทุก BM

## คอมมิชชั่น: นำเข้า Loyverse ตัดรายการ "รายวัน"
- `EXCLUDE_KEYWORDS = ['รายวัน']` ใน `lib/commission.js` — ชื่อสินค้า/หมวดที่มีคำนี้ไม่เอามารวมกำไร โชว์ในกล่องนำเข้าว่าตัดอะไรไป (เก็บใน pos_import.excluded)

## แบบฟอร์มข้อมูลประจำเดือน (data_forms) — ตั้งแต่ 2026-10-02 · `lib/dataForms.js` · `pages/DataFormsPage.jsx` · `components/DataFormFields.jsx`
- **ทำไม:** คอมก้อน 1 ต้องใช้ตัวเลขจากผู้จัดการแต่ละคน (ค่าน้ำไฟจากบิล / ผู้เช่าเข้าออก + ค่าเช่าแต่ละตึก) — เจ้าของสร้างฟอร์มแล้ว **มอบหมายตามบัญชีผู้ใช้**
  (`assignee_user_id`) เปลี่ยนคนกรอกได้โดยไม่แก้ฟอร์ม · phase 1 คีย์มือ (`source=manual`) · phase 2 ดึงจาก maruay-property (`source=maruay-property`, โครง answers เดียวกัน)
- **เมนู:** "ส่งข้อมูล" (`myforms`) โชว์ให้ใครก็ตามที่มีฟอร์ม active มอบหมายให้ (ไม่ขึ้นกับ role/allowed_views) + เจ้าของเสมอ (กรอกแทน/ตรวจ) · badge = ฟอร์มที่เดือนนี้ยังไม่กด "ส่ง"
  · "แบบฟอร์มข้อมูล" (`dataforms`) เจ้าของสร้าง/แก้ช่อง/มอบหมาย
- **ช่อง (fields jsonb):** number / text / date / textarea / table (คอลัมน์ number|text · แถวคงที่ หรือ rows ว่าง = ผู้กรอกเพิ่มแถวเอง) · **key ต้องคงที่** คำตอบเก่าผูกกับ key
- **ตารางแบบ Excel (`layout: 'ledger'`):** หน้าส่งข้อมูลโชว์ "ทั้งปี" — เดือนเป็นแถว รายการเป็นคอลัมน์ (หัวกลุ่มจาก `rows[].group`, `sub` = สถานที่, `hint` = ที่อยู่ใน tooltip)
  เดือนที่เลือกกรอกได้ เดือนอื่นอ่านอย่างเดียวจาก `ops.dataSubmission.listByForm(formId, year)` กดชื่อเดือนเพื่อย้าย · มือถือเริ่มที่มุมมอง "เฉพาะเดือนนี้" (รายการเป็นแถว)
  · `columns[].placeholder` ใช้ `{month}`/`{year}` (รอบเดือน) · `summaryRows: true` → หน้าคอมได้ชิป **รายแถว + รวมรายกลุ่ม** (บิลแต่ละบัญชี, ค่าไฟรวม) นอกจากผลรวมคอลัมน์
  · ฟอร์มค่าน้ำไฟของผู้จัดการตลาดใช้แบบนี้: 13 บัญชี (ไฟ 5 / น้ำ 5 / เน็ต 2 / โทร 1) × (รอบเดือน, ยอดสุทธิ) ตาม Excel เดิมของเขา — **ไม่เก็บชื่อเจ้าของบัญชี** (เป็นชื่อบุคคล) เก็บแค่เลขบัญชี/สถานที่/ที่อยู่ใน DB
- **หยอดได้ทุกเดือน:** ตารางทั้งปีทุกแถวแก้ได้ (บิลมาช้า/เร็ว รอบบิลไม่ตรงเดือน) — หน้าเก็บ `yearEdits {month: answers}` แล้ว upsert ทีละเดือนตอนบันทึก · "ส่ง" = เดือนที่แก้ทั้งหมดส่งด้วย · "บันทึก" = คงสถานะเดิม
- **กติกาคอม "ยอดล่าสุดที่มี"** (`latestNumericSummary` ใน lib): ตาราง ledger ใช้ค่าล่าสุดของแต่ละเซลล์ข้ามเดือน/ปี (หน้าคอมโหลด `listByFormYears` ปีก่อน/ปีนี้/ปีหน้า) ไม่สนว่าเป็นเดือนของงวดคอม
  → ชิปมีป้ายฟ้า "ต.ค. 69" ถ้ามาจากเดือนอื่น, "หลายเดือน" สำหรับยอดรวม, "ร่าง" ถ้าเดือนนั้นยังไม่กดส่ง · ช่องที่ไม่ใช่ ledger ใช้ค่าของงวดเท่านั้น
- **เตือนตัวเลขที่เคยใช้คิดคอมแล้ว:** deductions ของพูลคอมเก็บ `srcKey` (formId.field.row.col) + `srcPeriod` (YYYY-MM ของเดือนที่ยอดมา) · `ops.commission.listDeductionSources` ดึง 2 ปีทุกธุรกิจ
  → ชิปที่ srcKey@srcPeriod ตรงกับพูลงวดอื่น = สีแดง ⚠ "ใช้แล้ว มิ.ย. 69" + สรุปจำนวนบนกล่อง + confirm ก่อนใช้ซ้ำ (ยอดรวม "หลายเดือน" ไม่มี srcPeriod จึงไม่ถูกเช็ก)
  (`normalizeFields` ใช้ key ตามตำแหน่ง `f0/c0/r0` ถ้าไม่มี — ห้ามสุ่มใหม่) · เปลี่ยนตารางคงที่↔เพิ่มแถวเองหลังมีคนกรอก → ของเก่าแสดงไม่ได้ (UI เตือน)
- **Submission:** 1 แถวต่อ (form, ปี, เดือน) · `status` draft|submitted · "บันทึกร่าง" ไม่แตะ submitted_* · "ส่ง/ส่งอีกครั้ง" ตั้ง submitted_by/at · แก้หลังส่ง >1 นาที = ป้าย "แก้ไขหลังส่ง" (ทั้งสองหน้า)
  · ช่องโชว์ค่าเดือนก่อนเป็น placeholder (ดูเทียบ ไม่ถูกใช้)
- **หน้าคอม:** กล่อง "ข้อมูลจากผู้จัดการ" ในก้อน 1 — ฟอร์มของธุรกิจนั้น + ส่วนกลาง · ตัวเลข (ช่อง number + ผลรวมคอลัมน์ตัวเลขของตาราง) กดแล้วใส่/ทับรายการหัก
  จับคู่ด้วย `srcKey` (`formId.fieldKey[.colKey]`) ก่อน แล้วค่อยชื่อ · ร่างใช้ได้แต่ถาม confirm · deductions เก็บ srcKey ไปด้วย (ดึงชื่อเดือนก่อนก็ติดมา)
- **RLS:** `can_view_form(business, assignee)` = owner / ผู้ถูกมอบหมาย / BM มีสิทธิ์เงินเดือนเฉพาะธุรกิจที่ดูแล (ส่วนกลาง null เห็นได้) · data_forms เขียน owner เท่านั้น
  · submissions เขียน owner หรือ `is_form_assignee` (ฟอร์มต้อง active) · realtime เฉพาะ data_forms (handler upsert เพราะคนที่เพิ่งถูกมอบหมายได้ UPDATE ของแถวที่ไม่เคยมี)
  · ฟอร์มที่ถูกย้ายไปคนอื่นไม่ส่ง event มาหาคนเดิม → effect badge เช็ก id ที่ยังเห็นแล้วตัดออก + refetchCore ดึงทั้งตาราง

## TODO / ไอเดียพัฒนาต่อ
- `src/App.jsx` เป็นไฟล์ยักษ์ไฟล์เดียว → candidate สำหรับ refactor (code-split, แยก component)
- (เพิ่มรายการที่นี่เมื่อคิดออก)

## ⚠️ ห้ามใส่ PII ในไฟล์ที่ commit
Repo นี้ **public** — ห้ามเขียนชื่อ ชื่อเล่น เบอร์โทร เลขบัตร หรือข้อมูลระบุตัวตนของพนักงานจริง
ลงในโค้ด คอมเมนต์ placeholder `HANDOFF.md` `DEV_SETUP.md` หรือ commit message
ให้ใช้ **จำนวน / ตำแหน่ง / แผนก / id** แทน (เช่น "พนักงาน 8 คน สายช่าง" ไม่ใช่รายชื่อ)
git history ลบด้วย `git revert` ไม่ได้ ต้อง rewrite + force push ซึ่งกระทบทุกคนที่ clone ไปแล้ว

## โครงสร้างโค้ด (หลัง refactor step 3-4)
```
src/
  main.jsx     ReactDOM.createRoot + <ErrorBoundary> ครอบทั้งแอป
  App.jsx      ~915 บรรทัด — state + ops + realtime + routing เท่านั้น ไม่มี page component แล้ว
  supabase.js  client + fromDB/toDB
  lib/         logic ล้วน ไม่มี JSX · ไม่มี circular
    format · probation · business · holidays · pools · payroll · print · storage · push · order · hooks · commission · dataForms
    (payroll → holidays → probation · business → probation · commission/dataForms ไม่ import ใคร)
  ui/index.jsx    Modal, FormField, FormActions, EmptyState, PageHeader, LoadingScreen,
                  PageLoading, Avatar, PillRadio, InfoItem, DetailBlock, EditorRow
  components/     ErrorBoundary, PushToggle, AuthScreen, PendingScreen, NotificationBell,
                  ThemePicker, Sidebar   (Sidebar → ThemePicker + PushToggle)
                  DataFormFields (FieldInput/TableInput/AnswersView — ใช้ทั้ง DataFormsPage และ CommissionPage)
  pages/          14 ไฟล์ (DataFormsPage มี 2 หน้า: MyFormsPage + DataFormsAdminPage) — component ย่อยที่ใช้เฉพาะหน้านั้นอยู่ไฟล์เดียวกัน
                  (EmployeesPage มี ResignModal/SalaryRaise/DetailModal/IDCard/EmployeeForm/Doc*)
                  (PayrollPage มี PrintSlipsModal/PayrollEditor/QuickEntry/ItemsModal)
                  **ไม่มีหน้าไหน import หน้าอื่น และไม่มีหน้าไหน import App.jsx**
```

## Code splitting
`App.jsx` โหลด 14 หน้าแบบ `React.lazy` (ยกเว้น `Dashboard` ที่เป็นหน้าแรก) ห่อด้วย
`<ErrorBoundary><Suspense fallback={<PageLoading/>}>` · `vite.config.js` แยก `vendor-react` / `vendor-supabase`

| | ก่อน | หลัง |
|---|---|---|
| โหลดครั้งแรก | 668 kB (gzip 178) | ~450 kB (gzip 128) = app 89 + react 142 + supabase 219 |
| แต่ละหน้า | รวมอยู่ในก้อนเดียว | chunk แยก 3-67 kB โหลดตอนเปิดหน้านั้น |

**พื้นของ bundle คือ vendor** — `@supabase/supabase-js` 219 kB (ใช้ auth+realtime+storage ครบ)
กับ `react-dom` 142 kB ลดต่อไม่ได้ถ้าไม่เปลี่ยนไลบรารี · โค้ดแอปเองเหลือ 89 kB

**ErrorBoundary จำเป็นเพราะ lazy** — ถ้าโหลด chunk ไม่สำเร็จ React จะ throw ตอน render
ไม่มี boundary = unmount ทั้ง root = จอขาวถาวร เคสจริงคือ deploy ใหม่แล้วผู้ใช้ยังเปิดแอปค้าง
(PWA + service worker เป็น network-only) → ไฟล์ chunk เก่าหาย → กดเมนู → จอขาว
boundary จะรีโหลดให้อัตโนมัติ โดยจำ "เวลา" ที่รีโหลดล่าสุดใน sessionStorage เพื่อกันวนไม่รู้จบ

## Lint — รันทุกครั้งหลังย้ายโค้ด
`npm run lint` (ESLint flat config) เปิด 2 กฎ **ต้องมีทั้งคู่**:
- `no-undef` — จับ "ย้ายฟังก์ชันแล้วลืม import" (step 1 จับได้ 1 จุด)
- `react/jsx-no-undef` — จับ "ลืม import **component**" ซึ่ง `no-undef` **จับไม่ได้**
  เพราะชื่อที่อยู่ในตำแหน่ง JSX element (`<Foo />`) ไม่ถูกนับเป็น reference
  step 2 เกือบหลุด: `Sidebar` เรียก `<ThemePicker/>` `<PushToggle/>` โดยไม่ได้ import
  → lint เงียบ + `npm run build` ผ่าน + bundle ยัง tree-shake โมดูลทั้งสองทิ้ง
  → ถ้า deploy = **จอขาวทุกหน้าหลังล็อกอิน**

`npm run build` ไม่ใช่ safety net: rollup ถือว่า identifier ที่ไม่รู้จักเป็น global

