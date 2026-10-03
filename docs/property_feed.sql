-- ============================================================
-- ฝั่ง maruay-property (Supabase project แยก) — ฟังก์ชันส่งข้อมูลสรุปให้ระบบพนักงาน
-- ใช้กรอกฟอร์ม "ผู้เช่าเข้า-ออก รายได้ค่าเช่า และรายรับน้ำไฟ" อัตโนมัติ (คอมก้อนที่ 2 + รายรับสาธารณูปโภคก้อนที่ 1)
-- ไม่ส่งชื่อ/เบอร์/ข้อมูลส่วนตัวผู้เช่า — ส่งแค่ยอดรวมรายโซน, เลขห้อง, ค่าเช่าสัญญา, วันที่
-- เรียกได้เฉพาะผู้ถือ token (hash อยู่ใน integration_tokens ที่ไม่มี policy) — token จริงเก็บฝั่งระบบพนักงานใน integration_secrets
-- กติกา (ตาม Excel คอมก้อน 2 ที่ user ยืนยัน 2026-10-04):
--   งวดคอม M ใช้ "บิลรอบ M+1" (วางบิลแล้ว ไม่รวมบิลยกเลิก ทั้งจ่ายแล้ว/ยังไม่จ่าย) · แผงรายวัน (แบกะดิน) ใช้เดือน M
--   ห้องเข้า/ออก = เหตุการณ์ที่เกิดในเดือน M (user ยืนยัน 2026-10-04): เข้า = วันเริ่มสัญญาในเดือน M · ออก = วันนัดย้ายออก/วันปิดสัญญา (อันที่เร็วกว่า) ในเดือน M แม้ยังเคลียร์ไม่เสร็จ
--   ค่าเช่าใช้ค่าเช่าตามขั้น (contract_rent_steps) ของเดือนนั้น ถ้าไม่มีขั้นใช้ contracts.rent
--   renewal = ต่อสัญญาคนเดิม (status renewed / ผู้เช่าชื่อเดิมห้องเดิมต่อกันภายใน 60 วัน) → ฝั่งแอพไม่นับเป็นเข้า/ออก
-- ============================================================
create table if not exists public.integration_tokens (
  name       text primary key,
  token_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.integration_tokens enable row level security;
revoke all on public.integration_tokens from anon, authenticated;

create or replace function public.employee_pool2_feed(p_token text, p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cur  date;
  v_next date;
begin
  if p_token is null or not exists (
    select 1 from public.integration_tokens t
    where t.name = 'maruay_employee' and t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_year is null or p_month is null or p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then
    raise exception 'bad period' using errcode = '22023';
  end if;
  v_cur  := make_date(p_year, p_month, 1);
  v_next := (v_cur + interval '1 month')::date;

  return jsonb_build_object(
    'period', to_char(v_cur, 'YYYY-MM'),
    'billingPeriod', to_char(v_next, 'YYYY-MM'),
    'generatedAt', now(),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('businessId', z.business_id, 'businessName', b.name, 'zoneId', z.id, 'zoneName', z.name) order by z.business_id, z.sort_order)
      from public.zones z left join public.businesses b on b.id = z.business_id
    ), '[]'::jsonb),
    'invoiceCounts', coalesce((
      select jsonb_object_agg(x.business_id, jsonb_build_object('cur', x.cur, 'next', x.nxt))
      from (
        select u.business_id, count(*) filter (where i.period = v_cur) cur, count(*) filter (where i.period = v_next) nxt
        from public.invoices i join public.units u on u.id = i.unit_id
        where i.status <> 'void' and i.period in (v_cur, v_next)
        group by u.business_id
      ) x
    ), '{}'::jsonb),
    -- จำนวนบิลต่อโซน รอบนี้/รอบถัดไป → ฝั่งแอพใช้กันกรณีบิลรอบถัดไปของบางโซนยังไม่ออก
    'zoneCounts', coalesce((
      select jsonb_agg(jsonb_build_object('zoneId', x.zone_id, 'cur', x.cur, 'next', x.nxt))
      from (
        select u.zone_id, count(*) filter (where i.period = v_cur) cur, count(*) filter (where i.period = v_next) nxt
        from public.invoices i join public.units u on u.id = i.unit_id
        where i.status <> 'void' and i.period in (v_cur, v_next)
        group by u.zone_id
      ) x
    ), '[]'::jsonb),
    -- บิลรอบถัดไปที่ค่าเช่าเกินค่าเช่าตามสัญญา (คิดขั้นค่าเช่าแล้ว) → ฝั่งแอพเตือน
    'rentOver', coalesce((
      select jsonb_agg(jsonb_build_object('zoneId', q.zone_id, 'unit', q.unit_number, 'billed', q.billed, 'contractRent', q.eff))
      from (
        select u.zone_id, u.unit_number, i.id,
          coalesce((select st.rent from public.contract_rent_steps st
                    where st.contract_id = c.id
                      and st.start_month <= ((extract(year from v_next) - extract(year from c.start_date)) * 12 + extract(month from v_next) - extract(month from c.start_date) + 1)
                    order by st.start_month desc limit 1), c.rent) eff,
          sum(ii.amount) billed
        from public.invoices i
        join public.units u on u.id = i.unit_id
        join public.contracts c on c.id = i.contract_id
        join public.invoice_items ii on ii.invoice_id = i.id and ii.kind = 'rent'
        where i.status <> 'void' and i.period = v_next and c.rent is not null and c.rent > 0
        group by u.zone_id, u.unit_number, i.id, c.id, c.rent, c.start_date
      ) q
      where q.billed > q.eff
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('zoneId', q.zone_id, 'kind', q.kind, 'amount', q.amt, 'invoices', q.n))
      from (
        select u.zone_id, ii.kind, sum(ii.amount) amt, count(distinct i.id) n
        from public.invoices i
        join public.units u on u.id = i.unit_id
        join public.invoice_items ii on ii.invoice_id = i.id
        where i.status <> 'void' and i.period = v_next
        group by u.zone_id, ii.kind
      ) q
    ), '[]'::jsonb),
    'stalls', coalesce((
      select jsonb_agg(jsonb_build_object('zone', s.zone, 'total', s.total, 'paid', s.paid, 'days', s.n))
      from (
        select st.zone, sum(d.price) total, coalesce(sum(d.price) filter (where d.paid), 0) paid, count(*) n
        from public.stall_days d join public.stalls st on st.id = d.stall_id
        where d.date >= v_cur and d.date < v_next
        group by st.zone
      ) s
    ), '[]'::jsonb),
    -- ห้องเข้า/ออกที่เกิดในเดือน M (ตามวันที่ในสัญญา ไม่ขึ้นกับการออกบิล)
    'moves', coalesce((
      select jsonb_agg(jsonb_build_object(
          'type', m.type, 'businessId', m.business_id, 'zoneId', m.zone_id, 'unit', m.unit_number,
          'rent', m.eff_rent, 'contractRent', m.rent, 'status', m.status, 'date', m.ev_date, 'startDate', m.start_date,
          'terminatedAt', m.terminated_at, 'moveOutScheduled', m.move_out_scheduled_date, 'endDate', m.end_date,
          'renewal', m.renewal)
        order by m.business_id, m.unit_number, m.type desc)
      from (
        select e.*, u.business_id, u.zone_id, u.unit_number,
          coalesce((select st.rent from public.contract_rent_steps st
                    where st.contract_id = e.id
                      and st.start_month <= greatest(1, (extract(year from e.ev_date) - extract(year from e.start_date)) * 12 + extract(month from e.ev_date) - extract(month from e.start_date) + 1)
                    order by st.start_month desc limit 1), e.rent) as eff_rent,
          case when e.type = 'in' then exists (
                 select 1 from public.contracts p
                 where p.unit_id = e.unit_id and p.id <> e.id
                   and (p.status = 'renewed' or (coalesce(p.tenant_name, '') <> '' and p.tenant_name = e.tenant_name))
                   and least(p.end_date, p.terminated_at::date) between e.start_date - 60 and e.start_date + 5)
               else (e.status = 'renewed' or exists (
                 select 1 from public.contracts n
                 where n.unit_id = e.unit_id and n.id <> e.id
                   and coalesce(n.tenant_name, '') <> '' and n.tenant_name = e.tenant_name
                   and n.start_date between e.ev_date - 5 and e.ev_date + 60))
          end as renewal
        from (
          select 'in' as type, c.id, c.unit_id, c.tenant_name, c.rent, c.status, c.start_date, c.terminated_at::date as terminated_at,
                 c.move_out_scheduled_date, c.end_date, c.start_date as ev_date
          from public.contracts c
          where c.start_date >= v_cur and c.start_date < v_next
          union all
          select 'out', c.id, c.unit_id, c.tenant_name, c.rent, c.status, c.start_date, c.terminated_at::date,
                 c.move_out_scheduled_date, c.end_date, least(c.move_out_scheduled_date, c.terminated_at::date)
          from public.contracts c
          where c.status <> 'renewed'
            and least(c.move_out_scheduled_date, c.terminated_at::date) >= v_cur
            and least(c.move_out_scheduled_date, c.terminated_at::date) < v_next
        ) e
        join public.units u on u.id = e.unit_id
      ) m
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.employee_pool2_feed(text, int, int) from public;
grant execute on function public.employee_pool2_feed(text, int, int) to anon, authenticated;
