// ============ ดึงข้อมูลจาก maruay-property → ฟอร์ม "ผู้เช่าเข้า-ออก รายได้ค่าเช่า และรายรับน้ำไฟ" ============
// feed มาจาก edge function `property-feed` → RPC employee_pool2_feed ฝั่ง property (ดู docs/property_feed.sql)
// กติกาที่ user ยืนยัน (2026-10-04):
//   งวด M ใช้ "บิลรอบ M+1" (วางบิลแล้ว ไม่รวมบิลยกเลิก) · แบกะดิน = แผงรายวันของเดือน M
//   รายได้ = ค่าเช่าอย่างเดียว (ไม่รวมส่วนกลาง/น้ำ/ไฟ) · ONE MALL ก็ค่าเช่าอย่างเดียว
//   "โซนอื่นๆ/สัมปทาน" ไม่นับรายได้/ห้องเข้าออก (แต่ค่าไฟของโซนนี้ = "ไฟป้าย" ในรายรับน้ำไฟ)
//   ห้องเข้า/ออก = เหตุการณ์ในเดือน M ตามวันที่ในสัญญา (เข้า = วันเริ่มสัญญา · ออก = วันนัดย้ายออก/ปิดสัญญา แม้ยังไม่เคลียร์)
//   ราคาห้อง = ค่าเช่าตามสัญญา ณ เดือนนั้น (คิดขั้นค่าเช่า) ไม่รวมส่วนกลาง · ต่อสัญญาคนเดิม ไม่นับเป็นเข้า/ออก
// ทุกอย่างลงฟอร์มเป็น "ร่าง" ให้ผู้จัดการตรวจแล้วกดส่งเอง — ไม่บันทึกเอง

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const str = (n) => String(r2(n));

// ที่มาของแต่ละช่อง — business = id ธุรกิจฝั่ง property · zones = ชื่อโซน (เว้นว่าง = ทุกโซนของธุรกิจ)
const DEFAULT_SOURCE = {
  sections: {
    bmr: { business: 'baanmaruay' },
    bbm: { business: 'baanbaimai' },
    mk_back: { business: 'taladmaruay', zones: ['ล็อคด้านหลัง'] },
    mk_front: { business: 'taladmaruay', zones: ['ล็อคด้านหน้า', 'ห้องแอร์'] },
    onemall: { business: 'taladmaruay', zones: ['ONE MALL'] },
  },
  ignore: [{ business: 'taladmaruay', zones: ['โซนอื่นๆ/สัมปทาน'] }],
  // รายรับน้ำ/ไฟ/ส่วนกลางจากผู้เช่า (ก้อน 1) — แถว = ชนิดรายการในบิล · คอลัมน์ = กลุ่มโซน · คอลัมน์ที่ไม่อยู่ในนี้ (ละลายทรัพย์) กรอกเอง
  utility: {
    field: 'f_fi0urho9k',
    rows: { r_3rmjjvjqw: 'water', r_j38z0avci: 'elec', r_wpp9lcxvo: 'service' },
    cols: {
      c_zjzuvgo9k: { business: 'taladmaruay', zones: ['ล็อคด้านหน้า', 'ห้องแอร์'] },
      c_idca6jb5x: { business: 'taladmaruay', zones: ['ล็อคด้านหลัง'] },
    },
  },
  sign: { field: 'f_02pq51v19', business: 'taladmaruay', zones: ['โซนอื่นๆ/สัมปทาน'], kind: 'elec' },
};

const SECTION_LABEL = { bmr: 'บ้านมารวย', bbm: 'บ้านใบไม้', mk_back: 'ตลาด โซนหลัง', mk_front: 'ตลาด โซนหน้า + ห้องแอร์', onemall: 'ONE MALL', bkd: 'แบกะดิน' };
const ymLabel = (ym) => { const [y, m] = String(ym || '').split('-').map(Number); const ab = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']; return m ? `${ab[m - 1]} ${String(y + 543).slice(2)}` : ''; };

// โซนที่ scope ครอบคลุม → Set(zoneId) + ชื่อโซนที่หาไม่เจอ
function resolveZones(feed, scope) {
  const all = (feed.zones || []).filter((z) => z.businessId === scope.business);
  const want = scope.zones && scope.zones.length ? scope.zones : null;
  const picked = want ? all.filter((z) => want.includes(z.zoneName)) : all;
  const missing = want ? want.filter((n) => !all.some((z) => z.zoneName === n)) : (all.length ? [] : [scope.business]);
  return { ids: new Set(picked.map((z) => z.zoneId)), names: picked.map((z) => z.zoneName), missing };
}
const sumItems = (feed, ids, kind) => r2((feed.items || []).filter((it) => ids.has(it.zoneId) && it.kind === kind).reduce((t, it) => t + (Number(it.amount) || 0), 0));

// feed → { patch: คำตอบที่จะใส่ลงฟอร์ม, report: สรุปให้ตรวจ, warnings: [ข้อความ], snapshot: ค่าที่ดึงมา (เก็บไว้เทียบว่าแก้อะไร) }
function buildFromFeed(feed, source = DEFAULT_SOURCE, now = new Date()) {
  const warnings = [];
  const patch = {};
  const snapshot = {};
  const report = { billingPeriod: feed.billingPeriod, period: feed.period, sections: [], utility: null, excluded: [] };
  const billLabel = ymLabel(feed.billingPeriod);
  const counts = feed.invoiceCounts || {};
  const blockedBiz = new Set();
  [...new Set(Object.values(source.sections).map((s) => s.business))].forEach((b) => {
    const c = counts[b] || { cur: 0, next: 0 };
    if (!c.next) { blockedBiz.add(b); warnings.push(`ยังไม่มีบิลรอบ ${billLabel} ของ "${(feed.zones || []).find((z) => z.businessId === b)?.businessName || b}" — ยังดึงค่าเช่าส่วนนี้ไม่ได้ (รอออกบิลก่อน) · ห้องเข้า-ออกดึงได้ตามปกติ`); }
    else if (c.cur && c.next < c.cur * 0.8) warnings.push(`บิลรอบ ${billLabel} ของ "${(feed.zones || []).find((z) => z.businessId === b)?.businessName || b}" มี ${c.next} ใบ น้อยกว่ารอบก่อน (${c.cur}) มาก — อาจออกบิลยังไม่ครบ`);
  });

  // โซนในธุรกิจที่เกี่ยวข้อง แต่ไม่ได้ผูกกับช่องไหนและไม่ได้สั่งให้ข้าม → เตือน (กันรายได้หายเงียบ)
  const covered = new Set();
  [...Object.values(source.sections), ...(source.ignore || [])].forEach((sc) => resolveZones(feed, sc).ids.forEach((id) => covered.add(id)));
  const bizInUse = new Set(Object.values(source.sections).map((s) => s.business));
  (feed.zones || []).filter((z) => bizInUse.has(z.businessId) && !covered.has(z.zoneId)).forEach((z) => warnings.push(`โซน "${z.zoneName}" (${z.businessName}) ยังไม่ได้ผูกกับส่วนไหน — ไม่ถูกนับ แจ้งผู้ดูแลระบบถ้าต้องนับ`));

  const [py, pm] = String(feed.period || '').split('-').map(Number);
  const monthOver = py && pm ? now >= new Date(pm === 12 ? py + 1 : py, pm === 12 ? 0 : pm, 1) : true;
  if (!monthOver) warnings.push(`เดือน ${ymLabel(feed.period)} ยังไม่จบ — ห้องเข้า-ออกอาจเพิ่มอีก ดึงใหม่อีกครั้งหลังสิ้นเดือน`);
  const revenue = {};
  Object.entries(source.sections).forEach(([key, scope]) => {
    const z = resolveZones(feed, scope);
    if (z.missing.length) warnings.push(`${SECTION_LABEL[key] || key}: หาโซน ${z.missing.join(', ')} ไม่เจอใน maruay-property (ชื่อโซนเปลี่ยน?)`);
    // นับบิลเฉพาะโซนของส่วนนี้ — บิลรอบถัดไปของบางโซนอาจยังไม่ออก ทั้งที่ธุรกิจออกแล้วบางส่วน
    const zc = (feed.zoneCounts || []).filter((c) => z.ids.has(c.zoneId)).reduce((t, c) => ({ cur: t.cur + (Number(c.cur) || 0), next: t.next + (Number(c.next) || 0) }), { cur: 0, next: 0 });
    const label = SECTION_LABEL[key] || key;
    let blocked = blockedBiz.has(scope.business);
    if (!blocked && feed.zoneCounts && zc.cur > 0 && zc.next === 0) { blocked = true; warnings.push(`${label}: ยังไม่มีบิลรอบ ${billLabel} — ยังดึงค่าเช่าส่วนนี้ไม่ได้ (รอออกบิลก่อน)`); }
    else if (!blocked && zc.cur > 0 && zc.next < zc.cur * 0.8) warnings.push(`${label}: บิลรอบ ${billLabel} มี ${zc.next} ใบ น้อยกว่ารอบก่อน (${zc.cur}) — อาจออกบิลยังไม่ครบ ยอดอาจต่ำไป`);
    const sec = { key, label, zones: z.names, blocked, revenue: null, ins: [], outs: [], renewals: [] };
    if (!sec.blocked) {
      sec.revenue = sumItems(feed, z.ids, 'rent');
      revenue[key] = { revenue: str(sec.revenue) };
      snapshot[`p2_revenue.${key}`] = sec.revenue;
      (feed.rentOver || []).filter((o) => z.ids.has(o.zoneId)).forEach((o) => warnings.push(`${label}: ห้อง ${o.unit} บิลรอบ ${billLabel} ค่าเช่า ${Number(o.billed).toLocaleString('th-TH')} เกินค่าเช่าตามสัญญา ${Number(o.contractRent).toLocaleString('th-TH')} — นับตามบิลแล้ว ตรวจว่าถูกไหม`));
    }
    // ห้องเข้า-ออก = เหตุการณ์ในเดือนนี้ตามวันที่ในสัญญา (ไม่ขึ้นกับการออกบิล) — นัดย้ายออกแล้วแต่ยังไม่เคลียร์ก็นับ
    (feed.moves || []).filter((m) => z.ids.has(m.zoneId)).forEach((m) => {
      if (m.renewal) { sec.renewals.push(m); return; }
      (m.type === 'in' ? sec.ins : sec.outs).push(m);
    });
    // ปิดสัญญา/เริ่มสัญญาหลายห้องวันเดียวกัน = มักเป็นการลงข้อมูลย้อนหลังทีเดียว ไม่ใช่วันจริง → เตือนให้ตรวจ
    [['in', sec.ins, 'เริ่มสัญญา'], ['out', sec.outs, 'ออก']].forEach(([, list, word]) => {
      const byDate = {};
      list.forEach((m) => { (byDate[m.date] ||= []).push(m.unit); });
      Object.entries(byDate).filter(([, u]) => u.length >= 3).forEach(([d, u]) => warnings.push(`${label}: ${u.length} ห้อง${word}วันเดียวกัน (${d}) — ${u.join(', ')} · ตรวจว่าเป็นวันจริง ไม่ใช่วันที่ลงข้อมูลย้อนหลัง`));
    });
    const n = Math.max(sec.ins.length, sec.outs.length);
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      const a = sec.ins[i], b = sec.outs[i];
      rows.push({ in_room: a?.unit || '', in_price: a ? str(a.rent) : '', out_room: b?.unit || '', out_price: b ? str(b.rent) : '' });
    }
    patch[`p2_moves_${key}`] = rows;
    snapshot[`p2_moves_${key}`] = rows.map((r) => `${r.in_room}:${r.in_price}/${r.out_room}:${r.out_price}`).join('|');
    report.sections.push(sec);
  });

  // แบกะดิน = แผงรายวันเดือนนี้ (รวมทุกแผง)
  const stallTotal = r2((feed.stalls || []).reduce((t, s) => t + (Number(s.total) || 0), 0));
  const stallPaid = r2((feed.stalls || []).reduce((t, s) => t + (Number(s.paid) || 0), 0));
  if (monthOver) { revenue.bkd = { revenue: str(stallTotal) }; snapshot['p2_revenue.bkd'] = stallTotal; }
  else warnings.push(`แบกะดิน: เดือน ${ymLabel(feed.period)} ยังไม่จบ (ตอนนี้ ${stallTotal.toLocaleString('th-TH')} บาท) — ยังไม่ใส่ให้ ดึงใหม่หลังสิ้นเดือน`);
  report.sections.push({ key: 'bkd', label: SECTION_LABEL.bkd, zones: ['แผงรายวัน'], blocked: !monthOver, revenue: monthOver ? stallTotal : null, ins: [], outs: [], renewals: [], skipped: [], note: stallPaid < stallTotal ? `จ่ายแล้ว ${stallPaid.toLocaleString('th-TH')} จากที่จอง ${stallTotal.toLocaleString('th-TH')}` : '' });
  if (monthOver && stallPaid < stallTotal) warnings.push(`แบกะดิน: มีแผงที่ยังไม่จ่าย ${r2(stallTotal - stallPaid).toLocaleString('th-TH')} บาท — ใช้ยอดจองทั้งหมด ${stallTotal.toLocaleString('th-TH')}`);
  patch.p2_revenue = revenue;

  // รายรับน้ำ/ไฟ/ส่วนกลาง (ก้อน 1) — ตลาดใช้บิลรอบเดียวกัน
  const u = source.utility;
  // โซนที่บิลรอบถัดไปยังไม่ออก (มีบิลรอบนี้ แต่ยังไม่มีรอบถัดไป) — ถ้ารายรับน้ำไฟใช้โซนพวกนี้ ยังไม่ใส่ให้ (กันใส่ 0)
  const notBilled = new Set((feed.zoneCounts || []).filter((c) => Number(c.cur) > 0 && !Number(c.next)).map((c) => c.zoneId));
  const utilZones = u ? [...Object.values(u.cols), ...(source.sign ? [source.sign] : [])].flatMap((sc) => [...resolveZones(feed, sc).ids]) : [];
  const utilBlocked = u && (blockedBiz.has('taladmaruay') || utilZones.some((id) => notBilled.has(id)));
  if (utilBlocked) warnings.push(`รายรับน้ำ/ไฟ/ส่วนกลาง: บิลรอบ ${billLabel} ของตลาดยังออกไม่ครบ — ยังไม่ใส่ให้`);
  if (u && !utilBlocked) {
    const table = {};
    const cells = [];
    Object.entries(u.rows).forEach(([rowKey, kind]) => {
      table[rowKey] = {};
      Object.entries(u.cols).forEach(([colKey, scope]) => {
        const v = sumItems(feed, resolveZones(feed, scope).ids, kind);
        table[rowKey][colKey] = str(v);
        snapshot[`${u.field}.${rowKey}.${colKey}`] = v;
        cells.push({ rowKey, colKey, kind, value: v });
      });
    });
    patch[u.field] = table; // คอลัมน์ที่ไม่ได้ผูก (ละลายทรัพย์) — ตอนใส่ลงฟอร์มจะคงค่าที่กรอกไว้เดิม (mergePatch)
    const s = source.sign;
    const sign = s ? sumItems(feed, resolveZones(feed, s).ids, s.kind) : null;
    if (s) { patch[s.field] = str(sign); snapshot[s.field] = sign; }
    report.utility = { cells, sign };
  }

  return { patch, report, warnings, snapshot };
}

// ใส่ patch ลงคำตอบเดิม — ตารางที่มีแถวคงที่ merge ทีละเซลล์ (คอลัมน์ที่ไม่ได้ดึงยังคงค่าเดิม) · ตารางห้องเข้าออก/ช่องเดี่ยว แทนทั้งช่อง
function mergePatch(answers, patch) {
  const out = { ...(answers || {}) };
  Object.entries(patch).forEach(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      const merged = { ...out[k] };
      Object.entries(v).forEach(([rk, rv]) => { merged[rk] = rv && typeof rv === 'object' ? { ...(merged[rk] || {}), ...rv } : rv; });
      out[k] = merged;
    } else out[k] = v;
  });
  return out;
}

// ค่าปัจจุบันในฟอร์ม (คีย์แบบเดียวกับ snapshot) → เทียบว่าช่องไหนถูกแก้จากที่ดึงมา
function currentOf(answers, key) {
  if (key.startsWith('p2_revenue.')) return Number(String(answers?.p2_revenue?.[key.slice(11)]?.revenue ?? '').replace(/,/g, '')) || 0;
  if (key.startsWith('p2_moves_')) return (Array.isArray(answers?.[key]) ? answers[key] : []).filter((r) => r && (r.in_room || r.in_price || r.out_room || r.out_price)).map((r) => `${r.in_room || ''}:${r.in_price === '' || r.in_price == null ? '' : String(r2(r.in_price))}/${r.out_room || ''}:${r.out_price === '' || r.out_price == null ? '' : String(r2(r.out_price))}`).join('|');
  const parts = key.split('.');
  if (parts.length === 3) return Number(String(answers?.[parts[0]]?.[parts[1]]?.[parts[2]] ?? '').replace(/,/g, '')) || 0;
  return Number(String(answers?.[key] ?? '').replace(/,/g, '')) || 0;
}
// → [snapshotKey] ที่ค่าตอนนี้ต่างจากที่ดึงมาจากระบบ
function editedFromAuto(answers) {
  const snap = answers?.p2_auto?.values;
  if (!snap) return [];
  return Object.keys(snap).filter((k) => {
    const cur = currentOf(answers, k), was = snap[k];
    return typeof was === 'number' ? Math.abs((Number(cur) || 0) - was) >= 0.005 : String(cur) !== String(was);
  });
}
const autoKeyLabel = (k) => {
  if (k.startsWith('p2_revenue.')) return `รายได้ ${SECTION_LABEL[k.slice(11)] || k.slice(11)}`;
  if (k.startsWith('p2_moves_')) return `ห้องเข้า-ออก ${SECTION_LABEL[k.slice(9)] || k.slice(9)}`;
  if (k === DEFAULT_SOURCE.sign.field) return 'ไฟป้าย';
  const [, rowKey, colKey] = k.split('.');
  const rowL = { r_3rmjjvjqw: 'น้ำ', r_j38z0avci: 'ไฟ', r_wpp9lcxvo: 'ส่วนกลาง' }[rowKey] || rowKey;
  const colL = { c_zjzuvgo9k: 'โซนหน้า', c_idca6jb5x: 'โซนหลัง' }[colKey] || colKey;
  return `รายรับ${rowL} ${colL}`;
};

export { DEFAULT_SOURCE, SECTION_LABEL, buildFromFeed, mergePatch, editedFromAuto, autoKeyLabel, ymLabel };
