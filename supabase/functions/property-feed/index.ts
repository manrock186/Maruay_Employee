// supabase/functions/property-feed/index.ts
//
// ดึงข้อมูลสรุปจาก maruay-property (คนละ Supabase project) มาให้หน้า "ส่งข้อมูล" กรอกฟอร์มผู้เช่าอัตโนมัติ
// - ผู้เรียกต้องล็อกอินแอพพนักงาน และต้อง "เห็น" ฟอร์ม tenant_rent ได้ตาม RLS (เจ้าของ / คนมีสิทธิ์เงินเดือน / ผู้ถูกมอบหมาย)
// - token ที่ใช้เรียกฝั่ง property เก็บใน public.integration_secrets (ไม่มี policy — อ่านได้เฉพาะ service role ตรงนี้)
// - ฝั่ง property คืนแค่ยอดรวม/เลขห้อง/ค่าเช่าสัญญา ไม่มีข้อมูลส่วนตัวผู้เช่า (ดู docs/property_feed.sql)

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'ต้องล็อกอินก่อน' }, 401);

  // ผู้ใช้ปัจจุบัน (สิทธิ์ตาม RLS ของเขาเอง)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, error: 'ต้องล็อกอินก่อน' }, 401);

  const { data: form, error: formErr } = await userClient.from('data_forms').select('id').eq('key', 'tenant_rent').maybeSingle();
  if (formErr) return json({ ok: false, error: 'ตรวจสิทธิ์ไม่ได้: ' + formErr.message }, 500);
  if (!form) return json({ ok: false, error: 'ไม่มีสิทธิ์ดึงข้อมูลนี้' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const year = Number(body?.year);
  const month = Number(body?.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return json({ ok: false, error: 'invalid year' }, 400);
  if (!Number.isInteger(month) || month < 1 || month > 12) return json({ ok: false, error: 'invalid month' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: secret, error: sErr } = await admin.from('integration_secrets').select('value').eq('name', 'property_feed').maybeSingle();
  if (sErr || !secret?.value?.url || !secret?.value?.token) return json({ ok: false, error: 'ยังไม่ได้ตั้งค่าการเชื่อม maruay-property' }, 500);
  const { url, apiKey, token } = secret.value as { url: string; apiKey: string; token: string };

  let res: Response, text: string;
  try {
    res = await fetch(`${url}/rest/v1/rpc/employee_pool2_feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ p_token: token, p_year: year, p_month: month }),
      signal: AbortSignal.timeout(20000),
    });
    text = await res.text();
  } catch (e) {
    return json({ ok: false, error: 'ติดต่อ maruay-property ไม่ได้ (ลองใหม่อีกครั้ง)', detail: String(e).slice(0, 200) }, 502);
  }
  if (!res.ok) return json({ ok: false, error: `maruay-property ตอบกลับ ${res.status}`, detail: text.slice(0, 300) }, 502);
  let feed: unknown;
  try { feed = JSON.parse(text); } catch { return json({ ok: false, error: 'ข้อมูลจาก maruay-property อ่านไม่ได้' }, 502); }
  return json({ ok: true, feed });
});
