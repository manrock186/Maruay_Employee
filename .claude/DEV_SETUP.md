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

## โครงสร้างโค้ด (หลัง refactor step 2)
```
src/
  App.jsx      state + ops + routing + page component (~5,200 บรรทัด — รอ step 3)
  supabase.js  client + fromDB/toDB
  ui/index.jsx    Modal, FormField, FormActions, EmptyState, PageHeader, LoadingScreen,
                  Avatar, PillRadio, InfoItem, DetailBlock, EditorRow — ไม่ import โมดูลอื่นเลย
  components/     PushToggle, AuthScreen, PendingScreen, NotificationBell, ThemePicker, Sidebar
                  (Sidebar → ThemePicker + PushToggle)
  lib/         logic ล้วน ไม่มี JSX · ไม่มี circular import
    format.js     dispName, สัญชาติ, เหตุผลลาออก/ปรับเงินเดือน, ธีม
    probation.js  ทดลองงาน + proration
    business.js   1 คนหลายสังกัด (ตำแหน่ง/เงินเดือนแยกตามธุรกิจ)   → probation
    pools.js      คอมมิชชั่น / ค่าห้อง / งานเสริมประจำ / เบิกล่วงหน้า
    payroll.js    คำนวณเงินเดือน + buildPayrollDraft              → probation, business, pools
    print.js      สลิป + รายงานรวม                                → format, payroll
    storage.js    อัปโหลด/ลบ/signed URL เอกสาร + ย่อรูป
    push.js       web push (VAPID, subscribe/unsubscribe)
    order.js      ลำดับที่ลากจัดเอง + แผนก + ตัดคอลัมน์เงิน          → business
    hooks.js      useIsMobile, useDragReorder + คลาสตอนลาก
```

## Lint — รันทุกครั้งหลังย้ายโค้ด
`npm run lint` (ESLint flat config) เปิด 2 กฎ **ต้องมีทั้งคู่**:
- `no-undef` — จับ "ย้ายฟังก์ชันแล้วลืม import" (step 1 จับได้ 1 จุด)
- `react/jsx-no-undef` — จับ "ลืม import **component**" ซึ่ง `no-undef` **จับไม่ได้**
  เพราะชื่อที่อยู่ในตำแหน่ง JSX element (`<Foo />`) ไม่ถูกนับเป็น reference
  step 2 เกือบหลุด: `Sidebar` เรียก `<ThemePicker/>` `<PushToggle/>` โดยไม่ได้ import
  → lint เงียบ + `npm run build` ผ่าน + bundle ยัง tree-shake โมดูลทั้งสองทิ้ง
  → ถ้า deploy = **จอขาวทุกหน้าหลังล็อกอิน**

`npm run build` ไม่ใช่ safety net: rollup ถือว่า identifier ที่ไม่รู้จักเป็น global

