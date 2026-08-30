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
