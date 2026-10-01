import { payrollBaseSalary, effectiveBaseSalary } from './probation.js';
import { payrollBaseSalaryForBiz, salaryRateForBiz } from './business.js';
import { monthlyHolidayQuota } from './holidays.js';

// ============ PAYROLL HELPERS ============
const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// ป้ายเดือนที่จ่ายเงิน (งวดทำงานเดือน month → จ่ายต้นเดือนถัดไป)
function payMonthLabel(year, month) {
  const d = new Date(Number(year), Number(month), 1);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear() + 543}`;
}
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// ฟอร์แมตวันที่ไทย (กันค่าว่าง/วันที่ไม่ถูกต้องไม่ให้แอปขาว)
const fmt = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
};

// คำนวณประกันสังคม: 5% ของฐาน สูงสุด 750
const calcSocialSecurity = (baseSalary) => Math.min(Math.round(Number(baseSalary) * 0.05 * 100) / 100, 750);

// ค่าแรง/วัน = เงินเดือน "เต็มเดือน" ของงวด (salaryRate) ÷ 30 — ไม่ใช่ฐานในงวด เพราะฐานอาจถูกเฉลี่ยตามวันเริ่มงาน
// แถวเก่าที่ยังไม่มี salaryRate ใช้ฐานแทน
const salaryRateOf = (p) => Number(p?.salaryRate) || Number(p?.baseSalary) || 0;
const dailyRateOf = (p) => salaryRateOf(p) / 30;

// หยุดเกิน/ขาด: excess = วันหยุดที่ใช้จริง − โควต้า
//   excess > 0 → หยุดเกิน → หักเงิน excess × ค่าแรง/วัน
//   excess < 0 → หยุดน้อยกว่าสิทธิ (ทำงานในวันหยุด) → เพิ่มเงิน |excess| × ค่าแรง/วัน
//   amount = −excess × ค่าแรง/วัน (บวก = ได้เพิ่ม / ลบ = ถูกหัก)
function holidayBalance(p) {
  const daily = dailyRateOf(p);
  const quota = Number(p?.holidayQuota) || 0;
  const taken = Math.max(0, Number(p?.holidayDaysTaken) || 0);
  const excess = taken - quota;
  const amount = -excess * daily;
  return { daily, quota, taken, excess, amount, credit: Math.max(0, amount), deduction: Math.max(0, -amount) };
}

// คำนวณยอดเงินเดือนสุทธิจากข้อมูล payroll + รายการ items
function computePayroll(p, items = []) {
  const holiday = holidayBalance(p);
  const daily = holiday.daily;
  // รายรับ
  const holidayCredit = holiday.credit; // ค่าวันหยุดที่ไม่ได้ใช้
  const bonusTasks = items.filter((i) => i.kind === 'bonus_task').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalIncome = (Number(p.baseSalary) || 0) + (Number(p.commission) || 0) + holidayCredit + bonusTasks;
  // รายการหัก
  const excessDays = holiday.excess;            // + = เกิน / − = ขาด
  const excessHolidayDeduction = holiday.deduction;
  const advances = items.filter((i) => i.kind === 'advance').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const otherDeductions = items.filter((i) => i.kind === 'other_deduction').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalDeduction = excessHolidayDeduction + (Number(p.lateDeduction) || 0) + (Number(p.socialSecurity) || 0)
    + (Number(p.roomFee) || 0) + (Number(p.paidViaCompany) || 0) + advances + otherDeductions;
  const net = totalIncome - totalDeduction;
  return { daily, holiday, holidayCredit, bonusTasks, totalIncome, excessDays, excessHolidayDeduction, advances, otherDeductions, totalDeduction, net };
}

// สถิติวันหยุดจากแถว payroll ของพนักงานคนหนึ่ง (ไว้ดูประกอบการพิจารณาขึ้นเงินเดือน)
// list เรียงงวดใหม่ → เก่า · recent = สรุป N งวดล่าสุด
function holidayStats(rows, recentPeriods = 12) {
  const list = (rows || [])
    .map((p) => ({ id: p.id, year: Number(p.periodYear), month: Number(p.periodMonth), businessId: p.businessId, note: p.holidayNote || '', ...holidayBalance(p) }))
    .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
  const recentRows = list.slice(0, recentPeriods);
  const recent = recentRows.reduce((s, r) => {
    s.periods += 1;
    if (r.excess > 0) { s.overPeriods += 1; s.excessDays += r.excess; }
    if (r.excess < 0) s.creditDays += -r.excess;
    s.amount += r.amount;
    return s;
  }, { periods: 0, overPeriods: 0, excessDays: 0, creditDays: 0, amount: 0 });
  return { list, recent };
}

// สร้าง draft ตั้งต้นสำหรับ payroll (จาก payroll เดิม หรือ default จากโปรไฟล์พนักงาน)
// publicHolidays ใช้คิดโควต้าของคนที่หยุดตามปฏิทิน (ส-อา + นักขัตฤกษ์)
function buildPayrollDraft(emp, payroll, items, year, month, businessId, publicHolidays = []) {
  if (payroll) {
    return {
      baseSalary: payroll.baseSalary ?? 0,
      salaryRate: Number(payroll.salaryRate) || payroll.baseSalary || 0,
      holidayQuota: payroll.holidayQuota ?? 4,
      commission: payroll.commission ?? 0,
      holidayDaysTaken: payroll.holidayDaysTaken ?? 0,
      holidayNote: payroll.holidayNote ?? '',
      lateDeduction: payroll.lateDeduction ?? 0,
      socialSecurity: payroll.socialSecurity ?? 0,
      roomFee: payroll.roomFee ?? 0,
      paidViaCompany: payroll.paidViaCompany ?? 0,
      note: payroll.note ?? '',
      status: payroll.status ?? 'draft',
      items: (items || []).map((i) => ({ kind: i.kind, label: i.label, amount: i.amount })),
    };
  }
  const hasPeriod = !!(year && month);
  const base = hasPeriod
    ? (businessId ? payrollBaseSalaryForBiz(emp, businessId, year, month) : payrollBaseSalary(emp, year, month))
    : (emp.baseSalary ?? 0);
  const rate = hasPeriod
    ? (businessId ? salaryRateForBiz(emp, businessId, year, month) : effectiveBaseSalary(emp, year, month))
    : (emp.baseSalary ?? 0);
  const quota = hasPeriod ? monthlyHolidayQuota(emp, year, month, publicHolidays) : (Number(emp.holidayQuota ?? 4) || 0);
  return {
    baseSalary: base,
    salaryRate: rate,
    holidayQuota: quota,
    // ตั้งต้น "หยุดจริง = โควต้า" (ถือว่าหยุดครบสิทธิ์) → ลืมกรอก = ไม่มีผลกับเงิน
    // ถ้าตั้ง 0 ลืมกรอกจะกลายเป็น "หยุดน้อยกว่าสิทธิ" แล้วได้เงินเพิ่มเท่าโควต้าโดยไม่ตั้งใจ
    holidayDaysTaken: quota,
    holidayNote: '',
    commission: 0, lateDeduction: 0,
    socialSecurity: emp.hasSocialSecurity ? calcSocialSecurity(base) : 0,
    roomFee: emp.roomFee ?? 0,
    paidViaCompany: 0, note: '', status: 'draft', items: [],
  };
}

export {
  MONTH_NAMES,
  payMonthLabel,
  fmtMoney,
  fmt,
  calcSocialSecurity,
  salaryRateOf,
  dailyRateOf,
  holidayBalance,
  computePayroll,
  holidayStats,
  buildPayrollDraft,
};
