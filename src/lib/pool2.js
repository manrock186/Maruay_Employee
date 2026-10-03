// ============ คอมมิชชั่น ก้อนที่ 2 (รายได้ค่าเช่า / ร้านค้า) — ตาม Excel "คอมก้อน 2" ของบริษัท ============
// คิดแยกทีละ "ส่วน" (บ้านมารวย / บ้านใบไม้ / ตลาดหลัง / ตลาดหน้า+แอร์ / แบกะดิน / ONE MALL / กำไรฟอเรส+มอลล์) แต่ละส่วนมี % รายคนของตัวเอง
//   Part A (รายได้ที่เกินเกณฑ์):
//     kind 'threshold' : ฐาน = max(0, รายได้เดือนนี้ − เกณฑ์)        (ต่ำกว่าเกณฑ์ = 0 ไม่ติดลบ — user เคาะ 2026-10-03)
//     kind 'percent'   : ฐาน = รายได้ × revenuePct%                  (ONE MALL = 10%)
//     kind 'fixed'     : ยอดที่เจ้าของใส่เองทุกเดือน แบ่งตามสัดส่วน a / basePct  (กำไรฟอเรส+มอลล์ 3%)
//     คนละ = ฐาน × a%
//   Part B (ห้องเข้า − ห้องออก): ฐาน = ผลรวมราคาห้องที่เข้า − ผลรวมราคาห้องที่ออก (ติดลบ = หักจากคน เหมือน Excel) · คนละ = ฐาน × b%
//   + คอมพิเศษ (เช่น ห้องใหญ่ค่าเช่าสูงเข้า) ใส่เป็นจำนวนเงินรายคนรายเดือน
// ข้อมูลรายเดือนมาจากฟอร์มผู้เช่าของผู้จัดการ (data_form_submissions) ตามคีย์:
//   answers.p2_revenue[sectionKey].revenue  ·  answers[`p2_moves_${sectionKey}`] = [{ in_room, in_price, out_room, out_price }]
// % รายคนมีช่วงเวลา: rates[] = { empId, a, b, from?: 'YYYY-MM', until?: 'YYYY-MM' } (เช่น คนลาออก/คนใหม่รับช่วงต่อ)

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const KINDS = [
  { value: 'threshold', label: 'รายได้เกินเกณฑ์ (รายได้ − เกณฑ์)' },
  { value: 'percent', label: '% ของรายได้ทั้งก้อน' },
  { value: 'fixed', label: 'ยอดที่ใส่เองทุกเดือน แบ่งตามสัดส่วน' },
];
const periodStr = (p) => `${p.year}-${String(p.month).padStart(2, '0')}`;
const rateActive = (r, p) => { const k = periodStr(p); return (!r.from || r.from <= k) && (!r.until || r.until >= k); };
const activeRates = (section, period) => (section.rates || []).filter((r) => r.empId && rateActive(r, period));
const movesOf = (answers, key) => (Array.isArray(answers?.[`p2_moves_${key}`]) ? answers[`p2_moves_${key}`] : []);
const revenueOf = (answers, key) => answers?.p2_revenue?.[key]?.revenue;

function computePool2({ sections = [], answers = {}, inputs = {}, bonuses = [], period }) {
  const persons = {};
  const addP = (empId) => (persons[empId] ||= { a: 0, b: 0, bonus: 0, total: 0, bySection: {} });
  let hasData = false;
  const out = sections.filter((s) => s && s.active !== false).map((s) => {
    const kind = KINDS.some((k) => k.value === s.kind) ? s.kind : 'threshold';
    const rawRev = kind === 'fixed' ? inputs?.[s.key] : revenueOf(answers, s.key);
    const revenue = num(rawRev);
    const hasRevenue = rawRev != null && String(rawRev).trim() !== '';
    let baseA = 0;
    if (kind === 'threshold') baseA = Math.max(0, revenue - num(s.threshold));
    else if (kind === 'percent') baseA = revenue * num(s.revenuePct) / 100;
    else baseA = revenue;
    baseA = r2(baseA);
    const moves = movesOf(answers, s.key);
    const sumIn = r2(moves.reduce((t, m) => t + num(m?.in_price), 0));
    const sumOut = r2(moves.reduce((t, m) => t + num(m?.out_price), 0));
    const partB = !!s.partB && kind !== 'fixed';
    const baseB = partB ? r2(sumIn - sumOut) : 0;
    if (hasRevenue || moves.some((m) => num(m?.in_price) || num(m?.out_price))) hasData = true;
    const rates = activeRates(s, period);
    const basePct = num(s.basePct) || rates.reduce((t, r) => t + num(r.a), 0) || 1;
    const people = rates.map((r) => {
      const a = kind === 'fixed' ? r2(baseA * num(r.a) / basePct) : r2(baseA * num(r.a) / 100);
      const b = partB ? r2(baseB * num(r.b) / 100) : 0;
      const p = addP(r.empId);
      p.a = r2(p.a + a); p.b = r2(p.b + b);
      p.bySection[s.key] = { a, b };
      return { empId: r.empId, rateA: num(r.a), rateB: num(r.b), a, b };
    });
    return {
      key: s.key, name: s.name || s.key, kind, revenue, hasRevenue, threshold: num(s.threshold), revenuePct: num(s.revenuePct), basePct,
      baseA, partB, sumIn, sumOut, baseB, moves, people,
      totalA: r2(people.reduce((t, x) => t + x.a, 0)), totalB: r2(people.reduce((t, x) => t + x.b, 0)),
    };
  });
  (bonuses || []).forEach((bn) => {
    if (!bn?.empId || !num(bn.amount)) return;
    const p = addP(bn.empId); p.bonus = r2(p.bonus + num(bn.amount)); hasData = true;
  });
  Object.values(persons).forEach((p) => { p.total = r2(p.a + p.b + p.bonus); });
  const totals = Object.values(persons).reduce((t, p) => ({ a: r2(t.a + p.a), b: r2(t.b + p.b), bonus: r2(t.bonus + p.bonus), total: r2(t.total + p.total) }), { a: 0, b: 0, bonus: 0, total: 0 });
  return { sections: out, persons, totals, hasData };
}

// ผลลัพธ์แบบย่อ ไว้เก็บเป็น snapshot ตอนบันทึก (ประวัติย้อนหลัง)
const snapshotOf = (res) => ({
  persons: Object.fromEntries(Object.entries(res.persons).map(([id, p]) => [id, { a: p.a, b: p.b, bonus: p.bonus, total: p.total }])),
  sections: res.sections.map((s) => ({ key: s.key, name: s.name, revenue: s.revenue, baseA: s.baseA, baseB: s.baseB, totalA: s.totalA, totalB: s.totalB })),
  totals: res.totals,
});

// ลำดับคนตามที่ปรากฏในเรท (เหมือนคอลัมน์ใน Excel)
const personOrder = (sections = []) => {
  const seen = []; sections.forEach((s) => (s.rates || []).forEach((r) => { if (r.empId && !seen.includes(r.empId)) seen.push(r.empId); }));
  return seen;
};

// เทียบยอดที่บันทึกไว้ (results.persons) กับผลคำนวณตอนนี้ → [empId] ที่ยอดรวมไม่ตรง (ข้อมูลผู้จัดการ/เรท/ยอดที่ใส่ เปลี่ยนหลังบันทึก)
function pool2Changed(savedPersons, livePersons) {
  const ids = new Set([...Object.keys(savedPersons || {}), ...Object.keys(livePersons || {})]);
  return [...ids].filter((id) => Math.abs((Number(savedPersons?.[id]?.total) || 0) - (Number(livePersons?.[id]?.total) || 0)) >= 0.005);
}

export { KINDS as POOL2_KINDS, computePool2, snapshotOf, periodStr, rateActive, activeRates, personOrder, pool2Changed };
