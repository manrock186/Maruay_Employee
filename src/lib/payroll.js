import { payrollBaseSalary } from './probation.js';
import { payrollBaseSalaryForBiz } from './business.js';

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

// คำนวณยอดเงินเดือนสุทธิจากข้อมูล payroll + รายการ items
function computePayroll(p, items = []) {
  const daily = (Number(p.baseSalary) || 0) / 30;
  // "หยุด" (holidayDaysTaken): ค่าบวก = วันหยุดที่ใช้ (เกินโควต้าถูกหัก) / ค่าลบ = ทำงานวันหยุด (ได้เงินเพิ่ม)
  const holidayDaysRaw = Number(p.holidayDaysTaken) || 0;
  const holidayWorkFromNeg = holidayDaysRaw < 0 ? -holidayDaysRaw : 0;
  // รวมช่องทำงานวันหยุดเดิม (holidayWorkDays) เพื่อรองรับข้อมูลเก่า + ค่าลบจากช่อง "หยุด"
  const holidayWorkDays = (Number(p.holidayWorkDays) || 0) + holidayWorkFromNeg;
  // รายรับ
  const holidayWorkPay = holidayWorkDays * daily;
  const bonusTasks = items.filter((i) => i.kind === 'bonus_task').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalIncome = (Number(p.baseSalary) || 0) + (Number(p.commission) || 0) + holidayWorkPay + bonusTasks;
  // รายการหัก — ใช้วันหยุดเกินโควต้า (เฉพาะค่าบวก)
  const excessDays = Math.max(0, holidayDaysRaw - (Number(p.holidayQuota) || 0));
  const excessHolidayDeduction = excessDays * daily;
  const advances = items.filter((i) => i.kind === 'advance').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const otherDeductions = items.filter((i) => i.kind === 'other_deduction').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalDeduction = excessHolidayDeduction + (Number(p.lateDeduction) || 0) + (Number(p.socialSecurity) || 0)
    + (Number(p.roomFee) || 0) + (Number(p.paidViaCompany) || 0) + advances + otherDeductions;
  const net = totalIncome - totalDeduction;
  return { daily, holidayWorkDays, holidayWorkPay, bonusTasks, totalIncome, excessDays, excessHolidayDeduction, advances, otherDeductions, totalDeduction, net };
}

// สร้าง draft ตั้งต้นสำหรับ payroll (จาก payroll เดิม หรือ default จากโปรไฟล์พนักงาน)
function buildPayrollDraft(emp, payroll, items, year, month, businessId) {
  if (payroll) {
    return {
      baseSalary: payroll.baseSalary ?? 0,
      holidayQuota: payroll.holidayQuota ?? 4,
      commission: payroll.commission ?? 0,
      holidayWorkDays: payroll.holidayWorkDays ?? 0,
      holidayDaysTaken: payroll.holidayDaysTaken ?? 0,
      lateDeduction: payroll.lateDeduction ?? 0,
      socialSecurity: payroll.socialSecurity ?? 0,
      roomFee: payroll.roomFee ?? 0,
      paidViaCompany: payroll.paidViaCompany ?? 0,
      note: payroll.note ?? '',
      status: payroll.status ?? 'draft',
      items: (items || []).map((i) => ({ kind: i.kind, label: i.label, amount: i.amount })),
    };
  }
  const base = (year && month)
    ? (businessId ? payrollBaseSalaryForBiz(emp, businessId, year, month) : payrollBaseSalary(emp, year, month))
    : (emp.baseSalary ?? 0);
  return {
    baseSalary: base,
    holidayQuota: emp.holidayQuota ?? 4,
    commission: 0, holidayWorkDays: 0, holidayDaysTaken: 0, lateDeduction: 0,
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
  computePayroll,
  buildPayrollDraft,
};
