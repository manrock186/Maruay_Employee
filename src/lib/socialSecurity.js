// ============ ประกันสังคม มาตรา 33 — สูตรคำนวณ (pure · ไม่แตะ DB) ============
// ต้องให้ผลเท่ากับฟังก์ชัน SQL public.sso_contribution(wage, date) เสมอ
//
// ฐานค่าจ้าง = ค่าจ้างของงวด จำกัดไว้ระหว่าง wage_min..wage_max ของเรทที่มีผล ณ วันที่ 1 ของเดือนงวดงาน
// พนักงาน = round(ฐาน × rate_employee%) · บริษัท = round(ฐาน × rate_employer%) — ปัดเป็นบาท (≥ .50 ปัดขึ้น)
// เรทเก็บในตาราง sso_rates (เจ้าของแก้ได้) — กฎกระทรวง ราชกิจจาฯ 12 ธ.ค. 2568:
//   เพดาน 17,500 (2569-2571) · 20,000 (2572-2574) · 23,000 (2575 เป็นต้นไป)
// ค่าจ้าง = เงินเดือนของงวด (+ ค่าคอม ถ้าธุรกิจเปิด sso_include_commission) — Golfz ตัดสิน 31 ต.ค. 2569: ตอนนี้ยังไม่นับค่าคอม

// ปัดเป็นบาทแบบเดียวกับ Postgres round(numeric): .5 ปัดออกจากศูนย์
const roundBaht = (n) => Math.sign(n) * Math.round(Math.abs(n) + Number.EPSILON);

const periodStart = (year, month) => `${year}-${String(month).padStart(2, '0')}-01`;

// เรทที่มีผลในงวด (effective_from ≤ วันที่ 1 ของเดือนงวด · ล่าสุด) · ไม่มี → null (ห้ามเดาเรท)
function rateFor(rates, year, month) {
  const ps = periodStart(year, month);
  let best = null;
  for (const r of rates || []) {
    const ef = String(r.effectiveFrom ?? r.effective_from ?? '').slice(0, 10);
    if (!ef || ef > ps) continue;
    if (!best || ef > String(best.effectiveFrom ?? best.effective_from).slice(0, 10)) best = r;
  }
  return best;
}

// เงินสมทบจากค่าจ้าง + เรท
function calcSso(wage, rate) {
  if (!rate) return null;
  const min = Number(rate.wageMin ?? rate.wage_min) || 0;
  const max = Number(rate.wageMax ?? rate.wage_max) || 0;
  const w = Math.max(0, Number(wage) || 0);
  const wageBase = Math.min(Math.max(w, min), max);
  const re = Number(rate.rateEmployee ?? rate.rate_employee) || 0;
  const rr = Number(rate.rateEmployer ?? rate.rate_employer) || 0;
  return { wageBase, employee: roundBaht(wageBase * re / 100), employer: roundBaht(wageBase * rr / 100), wageMax: max, rateEmployee: re };
}

// ค่าจ้างที่ใช้คิดประกันสังคมของงวด
function ssoWage(p, includeCommission = false) {
  return (Number(p?.baseSalary) || 0) + (includeCommission ? (Number(p?.commission) || 0) : 0);
}

// ทะเบียนที่ "ครอบงวดนี้" ของพนักงานที่ธุรกิจนี้
//   pending/active → ครอบ · ended → ครอบถ้าวันสิ้นสุดอยู่ในหรือหลังเดือนงวด (ลาออกกลางเดือนยังหักเดือนนั้น)
function registrationFor(regs, employeeId, businessId, year, month) {
  const ps = periodStart(year, month);
  return (regs || []).find((r) => r.employeeId === employeeId && r.businessId === businessId && (
    r.status === 'pending' || r.status === 'active'
    || (r.status === 'ended' && r.endedDate && String(r.endedDate).slice(0, 10) >= ps)
  )) || null;
}

// รวมทุกอย่าง: คืน null ถ้าไม่มีทะเบียนครอบงวด / ไม่มีเรท
function ssoForPayroll({ rates, regs, business, employeeId, businessId, year, month, payroll }) {
  if (!registrationFor(regs, employeeId, businessId, year, month)) return null;
  const rate = rateFor(rates, year, month);
  if (!rate) return null;
  return calcSso(ssoWage(payroll, !!business?.ssoIncludeCommission), rate);
}

// ข้อความอธิบายสูตรสั้นๆ (ใช้เป็น hint ในหน้าเงินเดือน)
function ssoHint(c) {
  if (!c) return '';
  const f = (n) => Number(n).toLocaleString('th-TH');
  return `ฐาน ${f(c.wageBase)} × ${c.rateEmployee}% (เพดาน ${f(c.wageMax)}) · บริษัทสมทบ ${f(c.employer)}`;
}

// ---------- รายการต้องทำ (กันลืม) ----------
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);

// today: 'YYYY-MM-DD' · คืน [{ kind, regId, employeeId, businessId, text }]
function ssoTodos({ regs, employees, docs = [], today }) {
  const out = [];
  const empBy = Object.fromEntries((employees || []).map((e) => [e.id, e]));
  const docKinds = (regId) => new Set(docs.filter((d) => d.employeeSsoId === regId).map((d) => d.kind));
  const [ty, tm] = today.split('-').map(Number);
  const prevMonthStart = periodStart(tm === 1 ? ty - 1 : ty, tm === 1 ? 12 : tm - 1);
  const thisMonthStart = periodStart(ty, tm);
  for (const r of regs || []) {
    const e = empBy[r.employeeId];
    if (!e) continue;
    if (r.status === 'pending' && e.startDate && daysBetween(e.startDate, today) > 30) {
      out.push({ kind: 'register_overdue', regId: r.id, employeeId: e.id, businessId: r.businessId, text: `ยังไม่ขึ้นทะเบียน (สปส.1-03) — เริ่มงานมาแล้ว ${daysBetween(e.startDate, today)} วัน (ต้องภายใน 30 วัน)` });
    }
    if (r.status !== 'ended' && e.status === 'resigned') {
      out.push({ kind: 'resigned_still_active', regId: r.id, employeeId: e.id, businessId: r.businessId, text: 'ลาออกแล้ว แต่ทะเบียนประกันสังคมยังไม่ปิด — ปิดทะเบียน + แจ้ง สปส.6-09' });
    }
    if (r.status === 'ended' && r.endedDate) {
      const ed = String(r.endedDate).slice(0, 10);
      if (ed >= prevMonthStart && !docKinds(r.id).has('sso_6_09')) {
        const deadline = ed >= thisMonthStart ? 'วันที่ 15 เดือนหน้า' : 'วันที่ 15 เดือนนี้';
        out.push({ kind: 'resign_notice', regId: r.id, employeeId: e.id, businessId: r.businessId, text: `แจ้งลาออก สปส.6-09 ภายใน${deadline} (ยังไม่มีเอกสารในระบบ)` });
      }
    }
    if (r.status === 'active' && (!r.registeredDate || !r.hospitalId)) {
      const miss = [!r.registeredDate && 'วันขึ้นทะเบียน', !r.hospitalId && 'โรงพยาบาล'].filter(Boolean).join(' + ');
      out.push({ kind: 'incomplete', regId: r.id, employeeId: e.id, businessId: r.businessId, text: `ข้อมูลไม่ครบ: ${miss}` });
    }
  }
  return out;
}

// ช่วงเปลี่ยนโรงพยาบาลประจำปี (ม.ค.–มี.ค.)
const isHospitalChangeSeason = (today) => [1, 2, 3].includes(Number(String(today).slice(5, 7)));

// กำหนดส่งเงินสมทบ: วันที่ 15 ของเดือนถัดจากเดือนที่จ่ายค่าจ้าง
// งวดงานเดือน M จ่ายต้นเดือน M+1 → ส่งภายใน 15 ของเดือน M+2
function remitDeadline(year, month) {
  const d = new Date(Number(year), Number(month) + 1, 15);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: 15 };
}

// ส่งออก CSV (UTF-8 BOM ให้ Excel อ่านภาษาไทยถูก)
function toCsv(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

// เลขบัตรประชาชน ซ่อนกลาง: 1-2345-xxxxx-xx-3
function maskNationalId(id) {
  const d = String(id || '').replace(/\D/g, '');
  if (d.length !== 13) return id || '';
  return `${d[0]}-${d.slice(1, 5)}-xxxxx-xx-${d[12]}`;
}

export {
  roundBaht,
  rateFor,
  calcSso,
  ssoWage,
  registrationFor,
  ssoForPayroll,
  ssoHint,
  ssoTodos,
  isHospitalChangeSeason,
  remitDeadline,
  toCsv,
  maskNationalId,
};
