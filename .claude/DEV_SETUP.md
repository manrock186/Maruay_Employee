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
