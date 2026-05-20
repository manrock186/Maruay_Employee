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
