// ============ COMMISSION — ก้อนที่ 1 (POS) ============
// สูตรตาม Excel "คอม สรุป" ของบริษัท:
//   กองกลาง  = กำไรรวม POS (Loyverse, หักต้นทุนแล้ว) − รายการหัก (น้ำไฟรวม, น้ำไฟที่ขาดทุน, ช้อนส้อม …)
//   คอม 1    = กองกลาง × % ของคน        (ก้อน 2 "ร้านค้า" ใส่ยอดมือไปก่อน)
//   รวม      = คอม 1 + คอม 2
//   หลังหัก  = รวม × (30 − หยุดเกินสิทธิ) ÷ 30      ← ใช้ 30 คงที่ (user ตัดสินใจ ไม่ตามวันจริงใน Excel)
//   ส่วนที่หายไปของคนที่หยุด → แบ่งเท่ากันให้คนใน "แผนกเดียวกัน" ที่ไม่ได้หยุดและมีคอม
//   สุทธิ    = หลังหัก + ส่วนแบ่งที่ได้รับ

const COMM_DAYS = 30;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---------- นำเข้าไฟล์ Loyverse (Sales by item) ----------
// รับได้ทั้ง CSV ที่ export จาก Loyverse และข้อความที่ copy จาก Excel (คั่นด้วย tab)
// หัวคอลัมน์รองรับทั้งอังกฤษ/ไทย — ใช้แค่ ชื่อสินค้า / จำนวน / ยอดขายสุทธิ / ต้นทุน / กำไรขั้นต้น
const HEADER_KEYS = {
  name: ['item name', 'item', 'ชื่อสินค้า', 'สินค้า', 'รายการ'],
  qty: ['items sold', 'quantity', 'จำนวนที่ขาย', 'จำนวน'],
  net: ['net sales', 'ยอดขายสุทธิ'],
  cost: ['cost of goods', 'cost', 'ต้นทุนสินค้า', 'ต้นทุน'],
  profit: ['gross profit', 'profit', 'กำไรขั้นต้น', 'กำไร'],
};

function parseNumber(v) {
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-') || s.startsWith('−');
  s = s.replace(/[()−]/g, '').replace(/[^0-9.-]/g, '');
  const n = Math.abs(parseFloat(s));
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

// แยกบรรทัด CSV/TSV แบบรองรับเครื่องหมายคำพูด ("a, b",123)
function splitLine(line, delim) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i += 1; } else q = !q;
    } else if (ch === delim && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function findCol(headers, keys) {
  const h = headers.map((x) => String(x || '').toLowerCase().trim());
  for (const k of keys) { const i = h.findIndex((x) => x === k); if (i >= 0) return i; }
  // รอบ "มีคำนี้อยู่ในหัว" ใช้เฉพาะคำยาว — คำสั้นอย่าง "item" จะไปจับ "Items sold" ผิดคอลัมน์
  for (const k of keys.filter((x) => x.length > 4)) { const i = h.findIndex((x) => x.includes(k)); if (i >= 0) return i; }
  return -1;
}
// แถวยอดรวมท้ายตาราง (Loyverse/Excel) — ไม่บวกซ้ำ · ไม่ใช้ startsWith('รวม') เพราะชื่อสินค้าอย่าง "รวมมิตร" จะโดนข้าม
const TOTAL_ROW = new Set(['total', 'grand total', 'totals', 'รวม', 'ยอดรวม', 'รวมทั้งหมด', 'รวมทั้งสิ้น']);
const isTotalRow = (name) => { const n = name.toLowerCase(); return TOTAL_ROW.has(n) || n.startsWith('total '); };

// → { items: [{ name, qty, net, cost, profit }], totals: { qty, net, cost, profit }, columns, error }
function parseLoyverseText(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).filter((l) => l.trim());
  if (raw.length < 2) return { items: [], totals: { qty: 0, net: 0, cost: 0, profit: 0 }, error: 'ไม่พบข้อมูล (ต้องมีหัวตาราง + อย่างน้อย 1 รายการ)' };
  const delim = raw[0].includes('\t') ? '\t' : (raw[0].split(';').length > raw[0].split(',').length ? ';' : ',');
  const headers = splitLine(raw[0], delim);
  const col = { name: findCol(headers, HEADER_KEYS.name), qty: findCol(headers, HEADER_KEYS.qty), net: findCol(headers, HEADER_KEYS.net), cost: findCol(headers, HEADER_KEYS.cost), profit: findCol(headers, HEADER_KEYS.profit) };
  if (col.profit < 0) return { items: [], totals: { qty: 0, net: 0, cost: 0, profit: 0 }, error: `ไม่พบคอลัมน์ "Gross profit / กำไรขั้นต้น" ในหัวตาราง (เจอ: ${headers.filter(Boolean).join(', ')})` };
  if (col.name < 0) col.name = 0;
  const items = [];
  raw.slice(1).forEach((line) => {
    const c = splitLine(line, delim);
    const name = (c[col.name] || '').trim();
    if (!name || isTotalRow(name)) return;
    const profit = parseNumber(c[col.profit]);
    const net = col.net >= 0 ? parseNumber(c[col.net]) : 0;
    const cost = col.cost >= 0 ? parseNumber(c[col.cost]) : 0;
    const qty = col.qty >= 0 ? parseNumber(c[col.qty]) : 0;
    if (!profit && !net && !cost && !qty) return;
    items.push({ name, qty, net: r2(net), cost: r2(cost), profit: r2(profit) });
  });
  const totals = items.reduce((t, it) => ({ qty: t.qty + it.qty, net: r2(t.net + it.net), cost: r2(t.cost + it.cost), profit: r2(t.profit + it.profit) }), { qty: 0, net: 0, cost: 0, profit: 0 });
  return { items, totals, columns: col, error: items.length ? null : 'อ่านไฟล์ได้แต่ไม่พบรายการสินค้า' };
}

// ---------- คำนวณคอมต่อคน ----------
// rows: [{ id, dept, pct, amount, amount2, excessDays }]  (amount = คอม 1 ที่ตั้งไว้แล้ว — ถ้า null ใช้ pool × pct)
// → { rows: [{ ...row, base1, base2, total, prorated, forfeited, share, final }], depts: { [dept]: { forfeited, recipients, share, unassigned } }, totals }
function computeCommission({ poolValue = 0, rows = [], days = COMM_DAYS }) {
  const D = Number(days) || COMM_DAYS;
  const out = rows.map((row) => {
    const pct = Number(row.pct) || 0;
    // กองกลางติดลบ (หักมากกว่ากำไร) → คอมจาก % เป็น 0 ไม่ใช่ติดลบไปหักเงินเดือน · ยอดที่กำหนดเองใช้ตามนั้น
    const base1 = row.amount != null && row.amount !== '' ? r2(row.amount) : Math.max(0, r2(poolValue * pct / 100));
    const base2 = r2(row.amount2);
    const total = r2(base1 + base2);
    const excess = Math.max(0, Number(row.excessDays) || 0);
    const workedRatio = Math.max(0, (D - excess) / D);
    const prorated = r2(total * workedRatio);
    const forfeited = r2(total - prorated);
    return { ...row, pct, base1, base2, total, excessDays: excess, prorated, forfeited, share: 0, final: prorated };
  });
  // แบ่งส่วนที่หายไป ตามแผนก: ให้คนในแผนกเดียวกันที่ "ไม่ได้หยุด" และ "มีคอม" เท่าๆ กัน
  const depts = {};
  out.forEach((r) => { const k = r.dept || '—'; (depts[k] ||= { forfeited: 0, recipients: 0, share: 0, unassigned: 0 }).forfeited = r2(depts[k].forfeited + r.forfeited); });
  Object.keys(depts).forEach((k) => {
    const d = depts[k];
    if (d.forfeited <= 0) return;
    const recipients = out.filter((r) => (r.dept || '—') === k && r.excessDays === 0 && r.total > 0);
    d.recipients = recipients.length;
    if (!recipients.length) { d.unassigned = d.forfeited; return; }
    d.share = r2(d.forfeited / recipients.length);
    // ปัดเศษแล้วยอดรวมอาจคลาดสตางค์ → ให้คนสุดท้ายรับส่วนต่าง เพื่อให้ยอดรวมเท่าของเดิมเป๊ะ
    let given = 0;
    recipients.forEach((r, i) => {
      const s = i === recipients.length - 1 ? r2(d.forfeited - given) : d.share;
      given = r2(given + s);
      r.share = s; r.final = r2(r.prorated + s);
    });
  });
  const totals = out.reduce((t, r) => ({
    pct: r2(t.pct + r.pct), base1: r2(t.base1 + r.base1), base2: r2(t.base2 + r.base2), total: r2(t.total + r.total),
    prorated: r2(t.prorated + r.prorated), forfeited: r2(t.forfeited + r.forfeited), share: r2(t.share + r.share), final: r2(t.final + r.final),
  }), { pct: 0, base1: 0, base2: 0, total: 0, prorated: 0, forfeited: 0, share: 0, final: 0 });
  totals.unassigned = r2(Object.values(depts).reduce((s, d) => s + d.unassigned, 0));
  return { rows: out, depts, totals };
}

// ยอดคอมที่ไปขึ้นเงินเดือนของ entry หนึ่ง — entry ใหม่มี final · entry เก่า (ก่อนมีสูตรหยุด) ใช้ amount + amount2
function commissionEntryTotal(e) {
  if (!e) return 0;
  if (e.final != null && e.final !== '') return Number(e.final) || 0;
  return (Number(e.amount) || 0) + (Number(e.amount2) || 0);
}

export {
  COMM_DAYS,
  parseNumber,
  parseLoyverseText,
  computeCommission,
  commissionEntryTotal,
};
