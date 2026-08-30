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

## Database schema (public, 20 tables, เปิด RLS ทุกตาราง)
- **Core:** businesses, zones, positions, employees, user_profiles
- **Payroll:** payrolls, payroll_items, salary_changes, commission_pools, room_rent_pools, advance_pools, recurring_task_pools
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
    format · probation · business · pools · payroll · print · storage · push · order · hooks
  ui/index.jsx    Modal, FormField, FormActions, EmptyState, PageHeader, LoadingScreen,
                  PageLoading, Avatar, PillRadio, InfoItem, DetailBlock, EditorRow
  components/     ErrorBoundary, PushToggle, AuthScreen, PendingScreen, NotificationBell,
                  ThemePicker, Sidebar   (Sidebar → ThemePicker + PushToggle)
  pages/          13 หน้า หน้าละไฟล์ — component ย่อยที่ใช้เฉพาะหน้านั้นอยู่ไฟล์เดียวกัน
                  (EmployeesPage มี ResignModal/SalaryRaise/DetailModal/IDCard/EmployeeForm/Doc*)
                  (PayrollPage มี PrintSlipsModal/PayrollEditor/QuickEntry/ItemsModal)
                  **ไม่มีหน้าไหน import หน้าอื่น และไม่มีหน้าไหน import App.jsx**
```

## Code splitting
`App.jsx` โหลด 12 หน้าแบบ `React.lazy` (ยกเว้น `Dashboard` ที่เป็นหน้าแรก) ห่อด้วย
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

