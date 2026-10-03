-- =====================================================================
-- ระบบจัดการพนักงาน — Supabase Setup
-- =====================================================================
-- วิธีใช้: Copy ทั้งไฟล์นี้ ไป paste ใน Supabase Dashboard → SQL Editor → Run
-- ทำครั้งเดียวเท่านั้น
-- =====================================================================

-- 1) TABLES
-- ---------------------------------------------------------------------

-- ตารางธุรกิจ
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- ตารางโซน
create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now()
);
create index if not exists zones_business_id_idx on public.zones(business_id);

-- ตารางตำแหน่ง (มีลำดับชั้น parent_id)
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  parent_id uuid references public.positions(id) on delete set null,
  cross_zone boolean default false,
  created_at timestamptz default now()
);
create index if not exists positions_business_id_idx on public.positions(business_id);

-- ตารางพนักงาน
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  manager_id uuid references public.employees(id) on delete set null,
  name text not null,
  photo text,
  phone text,
  email text,
  address text,
  start_date date,
  birth_date date,
  national_id text,
  emergency_contact text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists employees_business_id_idx on public.employees(business_id);
create index if not exists employees_zone_id_idx on public.employees(zone_id);

-- ตารางผู้ใช้ระบบ (เชื่อมกับ auth.users)
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'pending', -- 'owner', 'zone_manager', 'pending'
  business_id uuid references public.businesses(id) on delete set null,
  zone_id uuid references public.zones(id) on delete set null,
  created_at timestamptz default now()
);


-- 2) AUTO-PROMOTE FIRST USER TO OWNER
-- ---------------------------------------------------------------------
-- เมื่อมีคนสมัครสมาชิกคนแรก → กลายเป็น owner อัตโนมัติ
-- คนถัดไป → role = pending (รอเจ้าของอนุมัติ)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.user_profiles;
  insert into public.user_profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case when v_count = 0 then 'owner' else 'pending' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 3) HELPER FUNCTION
-- ---------------------------------------------------------------------
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where id = auth.uid();
$$;

create or replace function public.current_zone_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select zone_id from public.user_profiles where id = auth.uid();
$$;


-- 4) ROW-LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------
-- เปิด RLS ทุกตาราง — บังคับว่า request ต้อง login ก่อนถึงเข้าได้

alter table public.user_profiles enable row level security;
alter table public.businesses    enable row level security;
alter table public.zones         enable row level security;
alter table public.positions     enable row level security;
alter table public.employees     enable row level security;

-- user_profiles: ทุกคนเห็นโปรไฟล์ตัวเอง, owner เห็น/แก้ทุกคน
drop policy if exists "users_read_own_profile" on public.user_profiles;
create policy "users_read_own_profile" on public.user_profiles
  for select using (auth.uid() = id or public.current_role() = 'owner');

drop policy if exists "owner_update_profiles" on public.user_profiles;
create policy "owner_update_profiles" on public.user_profiles
  for update using (public.current_role() = 'owner');

drop policy if exists "owner_delete_profiles" on public.user_profiles;
create policy "owner_delete_profiles" on public.user_profiles
  for delete using (public.current_role() = 'owner' and id <> auth.uid());

-- businesses: owner ทำได้ทุกอย่าง, zone_manager อ่านเฉพาะธุรกิจของตัวเอง
drop policy if exists "owner_all_businesses" on public.businesses;
create policy "owner_all_businesses" on public.businesses
  for all using (public.current_role() = 'owner');

drop policy if exists "zm_read_business" on public.businesses;
create policy "zm_read_business" on public.businesses
  for select using (
    public.current_role() = 'zone_manager'
    and id = (select business_id from public.user_profiles where id = auth.uid())
  );

-- zones: owner ทุกอย่าง, zone_manager อ่านเฉพาะโซนตัวเอง
drop policy if exists "owner_all_zones" on public.zones;
create policy "owner_all_zones" on public.zones
  for all using (public.current_role() = 'owner');

drop policy if exists "zm_read_own_zone" on public.zones;
create policy "zm_read_own_zone" on public.zones
  for select using (
    public.current_role() = 'zone_manager'
    and id = public.current_zone_id()
  );

-- positions: owner ทุกอย่าง, zone_manager อ่านในธุรกิจของตัวเอง
drop policy if exists "owner_all_positions" on public.positions;
create policy "owner_all_positions" on public.positions
  for all using (public.current_role() = 'owner');

drop policy if exists "zm_read_positions" on public.positions;
create policy "zm_read_positions" on public.positions
  for select using (
    public.current_role() = 'zone_manager'
    and business_id = (select business_id from public.user_profiles where id = auth.uid())
  );

-- employees: owner ทุกอย่าง, zone_manager จัดการเฉพาะพนักงานในโซนตัวเอง
drop policy if exists "owner_all_employees" on public.employees;
create policy "owner_all_employees" on public.employees
  for all using (public.current_role() = 'owner');

drop policy if exists "zm_manage_zone_employees" on public.employees;
create policy "zm_manage_zone_employees" on public.employees
  for all using (
    public.current_role() = 'zone_manager'
    and zone_id = public.current_zone_id()
  );


-- 5) ENABLE REALTIME (sync ข้อมูลทันทีระหว่างเครื่อง)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.businesses;
alter publication supabase_realtime add table public.zones;
alter publication supabase_realtime add table public.positions;
alter publication supabase_realtime add table public.employees;
alter publication supabase_realtime add table public.user_profiles;


-- =====================================================================
-- เสร็จ! ตอนนี้พร้อมใช้แล้ว
-- คนแรกที่สมัครสมาชิกที่หน้าเว็บ จะกลายเป็น owner อัตโนมัติ
-- =====================================================================

-- ============================================================
-- DISPLAY ORDER — ลำดับการแสดงผลที่ผู้ใช้ลากจัดเอง (พนักงาน + โซน)
-- ------------------------------------------------------------
-- แยกเป็นตารางเล็กต่างหาก ไม่เก็บเป็น employees.sort_order เพราะ
--   1) trigger log_audit เก็บ row เต็มทุก UPDATE (มีรูป base64 ~56KB/คน)
--      → ลากทีเดียว audit_log บวมเป็น MB
--   2) employees อยู่ใน realtime publication → ลากทีเดียวยิง payload หนักไปทุกเครื่อง
-- ============================================================
create table if not exists public.display_order (
  kind        text        not null check (kind in ('employee', 'zone')),
  ref_id      uuid        not null,
  position    integer     not null,
  updated_at  timestamptz not null default now(),
  primary key (kind, ref_id)
);

create index if not exists display_order_kind_position_idx on public.display_order (kind, position);

alter table public.display_order enable row level security;

-- อ่านได้ทุกคนที่ล็อกอิน (ทุก role ต้องใช้เรียงลำดับ)
drop policy if exists display_order_read on public.display_order;
create policy display_order_read on public.display_order
  for select to authenticated using (true);

-- แก้ได้เฉพาะคนที่มีสิทธิ์เขียน
drop policy if exists display_order_write on public.display_order;
create policy display_order_write on public.display_order
  for all to authenticated
  using (public.current_role() in ('owner', 'business_manager', 'zone_manager'))
  with check (public.current_role() in ('owner', 'business_manager', 'zone_manager'));

alter publication supabase_realtime add table public.display_order;

-- ตั้งลำดับเริ่มต้นจากลำดับปัจจุบัน (created_at) เพื่อไม่ให้หน้าจอสลับตอน deploy ครั้งแรก
insert into public.display_order (kind, ref_id, position)
select 'employee', id, (row_number() over (order by created_at, id))::int from public.employees
on conflict (kind, ref_id) do nothing;

insert into public.display_order (kind, ref_id, position)
select 'zone', id, (row_number() over (order by created_at, id))::int from public.zones
on conflict (kind, ref_id) do nothing;

-- ============================================================
-- DEPARTMENT (แผนก) — ตั้งที่ "ตำแหน่ง" ไม่ใช่รายคน
-- พนักงานได้แผนกจากตำแหน่งของตนในธุรกิจนั้นๆ อัตโนมัติ
-- ใช้จัดกลุ่มในหน้าเงินเดือน
-- ============================================================
alter table public.positions add column if not exists department text;

-- ลำดับของแผนกใช้ "ชื่อแผนก" เป็นคีย์ (แผนกเป็น text ไม่ใช่แถวที่มี id)
-- → display_order.ref_id ต้องเป็น text ไม่ใช่ uuid
alter table public.display_order drop constraint if exists display_order_kind_check;
alter table public.display_order alter column ref_id type text using ref_id::text;
alter table public.display_order add constraint display_order_kind_check
  check (kind in ('employee', 'zone', 'department'));

-- ตั้งแผนกเริ่มต้นจากชื่อตำแหน่ง (แก้ทีหลังได้ที่หน้า "ตำแหน่ง")
update public.positions set department = case
  when name ilike '%รปภ%'                                then 'รปภ.'
  when name ilike '%แม่บ้าน%'                             then 'แม่บ้าน'
  when name ilike '%ช่าง%'                                then 'ช่าง'
  when name ilike '%ล้างจาน%' or name ilike '%โต๊ะอาหาร%'   then 'ห้องอาหาร'
  when name ilike '%บัญชี%' or name ilike '%marketing%'   then 'สำนักงาน'
  when name ilike '%ผู้จัดการ%'                           then 'บริหาร'
  else null
end
where department is null;

insert into public.display_order (kind, ref_id, position) values
  ('department', 'บริหาร', 1),
  ('department', 'สำนักงาน', 2),
  ('department', 'ห้องอาหาร', 3),
  ('department', 'ช่าง', 4),
  ('department', 'รปภ.', 5),
  ('department', 'แม่บ้าน', 6)
on conflict (kind, ref_id) do nothing;

-- ============ employee-docs: อ่าน/แก้/ลบ ได้เฉพาะ owner (migration employee_docs_owner_only_read) ============
drop policy if exists "auth read employee-docs" on storage.objects;
drop policy if exists "auth update employee-docs" on storage.objects;
drop policy if exists "auth delete employee-docs" on storage.objects;
drop policy if exists "auth upload employee-docs" on storage.objects;
create policy "owner read employee-docs" on storage.objects for select to authenticated
  using (bucket_id = 'employee-docs' and public."current_role"() = 'owner');
create policy "owner update employee-docs" on storage.objects for update to authenticated
  using (bucket_id = 'employee-docs' and public."current_role"() = 'owner')
  with check (bucket_id = 'employee-docs' and public."current_role"() = 'owner');
create policy "owner delete employee-docs" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-docs' and public."current_role"() = 'owner');
create policy "staff upload employee-docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-docs' and public."current_role"() in ('owner','business_manager','zone_manager'));

-- ============================================================
-- หยุดเกิน/ขาด + วันหยุดตามปฏิทิน + วันหยุดนักขัตฤกษ์ (migration holiday_balance_and_public_holidays)
-- ------------------------------------------------------------
-- สูตร: หยุดเกิน = หยุดจริง − โควต้า · + = หัก / − = ได้เพิ่ม · ค่าแรง/วัน = salary_rate ÷ 30
-- salary_rate = เงินเดือน "เต็มเดือน" ของงวด (ทดลองงาน → เงินทดลอง) แยกจาก base_salary ที่อาจถูกเฉลี่ยตามวันเริ่มงาน
-- ============================================================
alter table public.payrolls add column if not exists salary_rate numeric not null default 0;
alter table public.payrolls add column if not exists holiday_note text;
update public.payrolls set salary_rate = base_salary where salary_rate = 0;

-- รูปแบบวันหยุด: fixed = โควต้าคงที่ (holiday_quota) · calendar = วันในสัปดาห์ (0=อาทิตย์ … 6=เสาร์) + นักขัตฤกษ์
alter table public.employees add column if not exists holiday_scheme text not null default 'fixed'
  check (holiday_scheme in ('fixed', 'calendar'));
alter table public.employees add column if not exists holiday_weekdays integer[] not null default '{0,6}';
alter table public.employees add column if not exists holiday_include_public boolean not null default true;

-- วันหยุดนักขัตฤกษ์ — รายการกลางทั้งระบบ (เจ้าของแก้ที่หน้าตั้งค่า) · วันชดเชยต้องเพิ่มเองตามประกาศ
create table if not exists public.public_holidays (
  id            uuid        primary key default gen_random_uuid(),
  holiday_date  date        not null unique,
  name          text        not null,
  created_at    timestamptz not null default now()
);
alter table public.public_holidays enable row level security;
drop policy if exists public_holidays_read on public.public_holidays;
create policy public_holidays_read on public.public_holidays
  for select to authenticated using (true);
drop policy if exists public_holidays_write on public.public_holidays;
create policy public_holidays_write on public.public_holidays
  for all to authenticated
  using (public.current_role() in ('owner', 'business_manager'))
  with check (public.current_role() in ('owner', 'business_manager'));
alter publication supabase_realtime add table public.public_holidays;
-- (seed วันหยุดราชการไทย พ.ศ. 2569 จำนวน 22 วันทำไปแล้วใน migration — ปีถัดไปเพิ่มที่หน้าตั้งค่า)

-- ============================================================
-- คอมมิชชั่นก้อนที่ 1 — นำเข้าไฟล์ Loyverse (migration commission_pos_import)
-- ------------------------------------------------------------
-- pos_items  = รายการสินค้าจากไฟล์ "ยอดขายตามสินค้า" ของ Loyverse [{name, qty, net, cost, profit}] (เก็บไว้ดูย้อนหลัง)
-- pos_import = { fileName, importedAt, rows, qty, net, cost, profit }
-- entries แต่ละคนเพิ่ม: base1 (คอม1 ที่ใช้จริง), amount (เฉพาะที่กำหนดเอง, null = คิดจาก %), excessDays, forfeited, share, final
-- ============================================================
alter table public.commission_pools add column if not exists pos_items jsonb not null default '[]'::jsonb;
alter table public.commission_pools add column if not exists pos_import jsonb;

-- ============================================================
-- สิทธิ์ "ไม่เห็นเงินเดือน" (migration pay_visibility_roomrent_advances)
-- ------------------------------------------------------------
-- can_manage_payroll = false → ห้ามเข้า เงินเดือน / คอมมิชชั่น / เบิกเงิน · ค่าห้องพนักงาน + งานเสริมประจำ (UI ซ่อนยอดเงิน) ยังเข้าได้
-- can_access_advances(): owner หรือ BM ที่มีสิทธิ์เงินเดือน (+ เมนูเปิด)
-- can_access_roomrent(): owner หรือ มีสิทธิ์เงินเดือน หรือ BM ที่เมนู roomrent เปิด → policy bm_roomrent ใช้ฟังก์ชันนี้แทน can_manage_payroll()
-- ============================================================

-- ============================================================
-- งานเสริมประจำ: ค่าจ้างแยกตาราง recurring_task_pay (migration recurring_task_pay_split)
-- ------------------------------------------------------------
-- recurring_task_pools.tasks ไม่มีเงินแล้ว (id/name/headcount/assignments[].empId) · ค่าจ้างอยู่ใน recurring_task_pay
--   (pool_id, task_id, emp_id '' = ค่าตั้งต้นของงาน / uuid = เฉพาะคน, amount) · RLS: owner หรือ BM ที่ can_manage_payroll (ธุรกิจที่ดูแล)
-- → คนไม่มีสิทธิ์เงินเดือนเปิดหน้างานเสริมได้โดยไม่มียอดเงินส่งถึงเครื่องเลย
-- trigger trg_copy_recurring_pay (after insert, security definer): พูลเดือนใหม่คัดลอกค่าจ้างของ task_id เดิมจากเดือนก่อนให้
--   (คนสร้างพูลเดือนใหม่อาจไม่มีสิทธิ์เขียนตาราง pay)
-- แอป: ops.recurringTask.getByPeriod/upsert ใน App.jsx แยก/รวมเงินด้วย splitRecurringPay/mergeRecurringPay (lib/pools.js)
-- ============================================================
create table if not exists public.recurring_task_pay (
  pool_id   uuid    not null references public.recurring_task_pools(id) on delete cascade,
  task_id   text    not null,
  emp_id    text    not null default '',
  amount    numeric not null default 0,
  primary key (pool_id, task_id, emp_id)
);
alter table public.recurring_task_pay enable row level security;

-- ============================================================
-- แบบฟอร์มข้อมูลประจำเดือน (migration data_forms_monthly_submissions + data_forms_scope_payroll_bm_by_business)
-- ------------------------------------------------------------
-- เจ้าของสร้างฟอร์ม + มอบหมายผู้ใช้ (assignee_user_id) ให้กรอกทุกเดือน (เช่น ค่าน้ำไฟจากบิล / ผู้เช่าเข้าออก + ค่าเช่าแต่ละตึก)
-- → หน้าคอมมิชชั่นดึงตัวเลขไปใส่เป็นรายการหัก · phase 1 source = manual · phase 2 source = maruay-property (โครง answers เหมือนกัน)
-- fields jsonb: [{ key, label, type: number|text|date|textarea|table, unit, hint, required, columns:[{key,label,type}], rows:[{key,label}] }]
--   table ที่ rows ว่าง = ผู้กรอกเพิ่มแถวเอง · key ต้องคงที่ (คำตอบเก่าผูกกับ key) ดู lib/dataForms.js
-- answers jsonb: { [field.key]: value } · table แถวคงที่ = { [row.key]: { [col.key]: v } } · เพิ่มแถวเอง = [ { [col.key]: v } ]
-- RLS: can_view_form(business, assignee) = owner / ผู้ถูกมอบหมาย / BM มีสิทธิ์เงินเดือนเฉพาะธุรกิจที่ดูแล (ฟอร์มส่วนกลาง business_id null เห็นได้)
--   data_forms เขียนได้เฉพาะ owner · submissions เขียน owner หรือ is_form_assignee(form_id) (ฟอร์มต้อง active) · ลบ owner
-- (seed ฟอร์ม 2 ชุดทำใน migration — ปรับช่อง/คนกรอกได้ที่หน้า "แบบฟอร์มข้อมูล")
-- ============================================================
create table if not exists public.data_forms (
  id                uuid        primary key default gen_random_uuid(),
  key               text        not null unique,
  name              text        not null,
  description       text,
  business_id       uuid        references public.businesses(id) on delete set null,
  assignee_user_id  uuid        references public.user_profiles(id) on delete set null,
  fields            jsonb       not null default '[]'::jsonb,
  source            text        not null default 'manual' check (source in ('manual', 'maruay-property')),
  active            boolean     not null default true,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create table if not exists public.data_form_submissions (
  id            uuid        primary key default gen_random_uuid(),
  form_id       uuid        not null references public.data_forms(id) on delete cascade,
  period_year   integer     not null,
  period_month  integer     not null check (period_month between 1 and 12),
  answers       jsonb       not null default '{}'::jsonb,
  note          text,
  status        text        not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_by  uuid        references public.user_profiles(id) on delete set null,
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (form_id, period_year, period_month)
);
create index if not exists data_form_submissions_period_idx on public.data_form_submissions (period_year, period_month);

create or replace function public.is_form_assignee(f uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.data_forms where id = f and active = true and assignee_user_id = auth.uid());
$$;
create or replace function public.can_view_form(f_business uuid, f_assignee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and (role = 'owner' or f_assignee = auth.uid()
           or (coalesce(can_manage_payroll, false) = true and (f_business is null or f_business = any(coalesce(business_ids, '{}'::uuid[])))))
  );
$$;

alter table public.data_forms enable row level security;
alter table public.data_form_submissions enable row level security;
drop policy if exists data_forms_read on public.data_forms;
create policy data_forms_read on public.data_forms for select to authenticated using (public.can_view_form(business_id, assignee_user_id));
drop policy if exists data_forms_owner_insert on public.data_forms;
create policy data_forms_owner_insert on public.data_forms for insert to authenticated with check (public.current_role() = 'owner');
drop policy if exists data_forms_owner_update on public.data_forms;
create policy data_forms_owner_update on public.data_forms for update to authenticated using (public.current_role() = 'owner') with check (public.current_role() = 'owner');
drop policy if exists data_forms_owner_delete on public.data_forms;
create policy data_forms_owner_delete on public.data_forms for delete to authenticated using (public.current_role() = 'owner');
drop policy if exists data_form_submissions_read on public.data_form_submissions;
create policy data_form_submissions_read on public.data_form_submissions for select to authenticated
  using (exists (select 1 from public.data_forms f where f.id = form_id and public.can_view_form(f.business_id, f.assignee_user_id)));
drop policy if exists data_form_submissions_insert on public.data_form_submissions;
create policy data_form_submissions_insert on public.data_form_submissions for insert to authenticated
  with check (public.current_role() = 'owner' or public.is_form_assignee(form_id));
drop policy if exists data_form_submissions_update on public.data_form_submissions;
create policy data_form_submissions_update on public.data_form_submissions for update to authenticated
  using (public.current_role() = 'owner' or public.is_form_assignee(form_id))
  with check (public.current_role() = 'owner' or public.is_form_assignee(form_id));
drop policy if exists data_form_submissions_delete on public.data_form_submissions;
create policy data_form_submissions_delete on public.data_form_submissions for delete to authenticated using (public.current_role() = 'owner');
alter publication supabase_realtime add table public.data_forms;

-- ============================================================
-- ตั้งค่าคอมรายธุรกิจ: สาธารณูปโภค (migration commission_settings_utility) — ดู src/lib/utility.js
-- utility = { enabled, mode: 'excel'|'net'|'expense', expense: [{formId,fieldKey,rowKey,colKey}], income: [{formId,fieldKey,rowKey,colKey,divisor}] }
-- ============================================================
create table if not exists public.commission_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  utility     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.commission_settings enable row level security;
drop policy if exists commission_settings_read on public.commission_settings;
create policy commission_settings_read on public.commission_settings for select to authenticated
  using (public.current_role() = 'owner' or (public.can_manage_payroll() and business_id = any(public.current_business_ids())));
drop policy if exists commission_settings_insert on public.commission_settings;
create policy commission_settings_insert on public.commission_settings for insert to authenticated
  with check (public.current_role() = 'owner' or (public.can_manage_payroll() and business_id = any(public.current_business_ids())));
drop policy if exists commission_settings_update on public.commission_settings;
create policy commission_settings_update on public.commission_settings for update to authenticated
  using (public.current_role() = 'owner' or (public.can_manage_payroll() and business_id = any(public.current_business_ids())))
  with check (public.current_role() = 'owner' or (public.can_manage_payroll() and business_id = any(public.current_business_ids())));

-- ============================================================
-- คอมก้อนที่ 2 (ค่าเช่า/ร้านค้า ข้ามธุรกิจ) — migration commission_pool2 · ดู src/lib/pool2.js
-- config: sections = [{ key, name, kind: 'threshold'|'percent'|'fixed', threshold, revenuePct, basePct, partB, active, rates: [{ empId, a, b, from?, until? }] }]
-- pool2 ต่องวด: inputs = { [fixedSectionKey]: number } · bonuses = [{ empId, amount, note }] · results = { source: 'app'|'excel', persons: { empId: {a,b,bonus,total} }, sections, totals }
-- ============================================================
create table if not exists public.commission_pool2_config (
  id         int primary key default 1 check (id = 1),
  sections   jsonb not null default '[]'::jsonb,
  form_id    uuid references public.data_forms(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.commission_pool2 (
  period_year  int not null,
  period_month int not null check (period_month between 1 and 12),
  inputs       jsonb not null default '{}'::jsonb,
  bonuses      jsonb not null default '[]'::jsonb,
  results      jsonb,
  note         text,
  updated_at   timestamptz not null default now(),
  primary key (period_year, period_month)
);
alter table public.commission_pool2_config enable row level security;
alter table public.commission_pool2 enable row level security;
drop policy if exists commission_pool2_config_read on public.commission_pool2_config;
create policy commission_pool2_config_read on public.commission_pool2_config for select to authenticated using (public.current_role() = 'owner' or public.can_manage_payroll());
drop policy if exists commission_pool2_config_write on public.commission_pool2_config;
create policy commission_pool2_config_write on public.commission_pool2_config for all to authenticated using (public.current_role() = 'owner') with check (public.current_role() = 'owner');
drop policy if exists commission_pool2_read on public.commission_pool2;
create policy commission_pool2_read on public.commission_pool2 for select to authenticated using (public.current_role() = 'owner' or public.can_manage_payroll());
drop policy if exists commission_pool2_write on public.commission_pool2;
create policy commission_pool2_write on public.commission_pool2 for all to authenticated using (public.current_role() = 'owner' or public.can_manage_payroll()) with check (public.current_role() = 'owner' or public.can_manage_payroll());

-- ============================================================
-- ค่าลับเชื่อมระบบอื่น (migration integration_secrets) — ไม่มี policy: ผู้ใช้แอพอ่านไม่ได้ · edge function property-feed อ่านด้วย service role
-- แถว 'property_feed' = { url, apiKey, token } สำหรับเรียก RPC employee_pool2_feed ฝั่ง maruay-property (ดู docs/property_feed.sql)
-- ค่า token จริงใส่ผ่าน SQL editor เท่านั้น — ห้าม commit
-- ============================================================
create table if not exists public.integration_secrets (
  name       text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;
