// ============ PROBATION (ทดลองงาน) ============
// อยู่ในช่วงทดลองงานของงวด (year, month) ไหม — นับเป็นจำนวนรอบบิลจากเดือนเริ่มงาน
function isProbationPeriod(emp, year, month) {
  if (!emp?.onProbation || !emp.startDate || !Number(emp.probationMonths)) return false;
  const start = new Date(emp.startDate);
  if (isNaN(start)) return false;
  const startYM = start.getFullYear() * 12 + start.getMonth();
  const payYM = Number(year) * 12 + (Number(month) - 1);
  const diff = payYM - startYM; // 0 = เดือนเริ่มงาน (รอบบิลแรก)
  return diff >= 0 && diff < Number(emp.probationMonths);
}
// รอบบิลปัจจุบันของช่วงทดลอง (เช่น 1/2) — ใช้แสดงผล
function probationCycle(emp, year, month) {
  if (!emp?.startDate) return null;
  const start = new Date(emp.startDate);
  const startYM = start.getFullYear() * 12 + start.getMonth();
  const diff = Number(year) * 12 + (Number(month) - 1) - startYM;
  return diff + 1; // รอบบิลที่เท่าไหร่นับจากเริ่มงาน
}
// เงินเดือนฐานที่ใช้จริงสำหรับงวดนั้น (ทดลองงาน vs เต็ม)
function effectiveBaseSalary(emp, year, month) {
  if (isProbationPeriod(emp, year, month) && Number(emp.probationSalary) > 0) return Number(emp.probationSalary);
  return Number(emp.baseSalary) || 0;
}
// จำนวนวันในเดือน
function daysInMonth(year, month) { return new Date(Number(year), Number(month), 0).getDate(); }
// สัดส่วนเฉลี่ยเงินเดือนตามวันเริ่มงาน — เฉพาะเดือนที่เริ่มงาน (เข้ากลางเดือนได้สัดส่วน)
function prorationFactor(emp, year, month) {
  if (!emp?.startDate) return 1;
  const s = new Date(emp.startDate);
  if (isNaN(s)) return 1;
  if (s.getFullYear() === Number(year) && s.getMonth() === Number(month) - 1) {
    const dim = daysInMonth(year, month);
    const startDay = s.getDate();
    return (dim - startDay + 1) / dim;
  }
  return 1; // เดือนอื่น = เต็มเดือน
}
// เงินเดือนฐานที่ควรใช้ตั้งต้นใน payroll งวดนั้น (ทดลองงาน + เฉลี่ยวันเริ่มงาน)
function payrollBaseSalary(emp, year, month) {
  return Math.round(effectiveBaseSalary(emp, year, month) * prorationFactor(emp, year, month));
}

export {
  isProbationPeriod,
  probationCycle,
  effectiveBaseSalary,
  daysInMonth,
  prorationFactor,
  payrollBaseSalary,
};
