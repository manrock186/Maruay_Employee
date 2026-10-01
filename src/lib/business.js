import { prorationFactor, isProbationPeriod } from './probation.js';

// ============ MULTI-BUSINESS (1 คน หลายสังกัด) ============
// มีการแยกเงินเดือนตามธุรกิจไหม
function hasSalarySplit(emp) { return !!(emp?.salarySplit && Object.keys(emp.salarySplit).length); }
// ธุรกิจทั้งหมดที่พนักงานสังกัด (หลัก + เพิ่มเติม)
function employeeBusinessIds(emp) {
  return [emp?.businessId, ...((emp?.additionalBusinessIds) || [])].filter((v, i, a) => v && a.indexOf(v) === i);
}
// ตำแหน่งของพนักงานในธุรกิจหนึ่ง (per-business role) — ไม่มีก็ fallback ตำแหน่งหลัก
function businessPositionId(emp, businessId) {
  const bp = emp?.businessPositions || {};
  if (bp[businessId]) return bp[businessId];
  if (businessId === emp?.businessId) return emp?.positionId || null;
  return null;
}
// เงินเดือนฐานของพนักงานในธุรกิจหนึ่ง — จากการแยกเงินเดือน หรือธุรกิจหลักใช้ base_salary
function businessBaseSalary(emp, businessId) {
  if (hasSalarySplit(emp) && emp.salarySplit[businessId] != null) return Number(emp.salarySplit[businessId]) || 0;
  if (businessId === emp?.businessId) return Number(emp?.baseSalary) || 0;
  return 0;
}
// เงินเดือน "เต็มเดือน" ของธุรกิจหนึ่งในงวดนั้น (ทดลองงาน → เงินทดลอง) — ยังไม่เฉลี่ยวันเริ่มงาน
// ใช้เป็น salaryRate สำหรับคิดค่าแรง/วัน (÷30) ของงวด
function salaryRateForBiz(emp, businessId, year, month) {
  // ทดลองงาน: ใช้เงินทดลองเฉพาะกรณีไม่ได้แยกเงินเดือน (ธุรกิจหลัก)
  const probation = isProbationPeriod(emp, year, month) && Number(emp.probationSalary) > 0 && !hasSalarySplit(emp) && businessId === emp.businessId;
  return probation ? Number(emp.probationSalary) : businessBaseSalary(emp, businessId);
}
// เงินเดือนฐานตั้งต้นใน payroll ของธุรกิจหนึ่ง (รวมทดลองงาน+เฉลี่ยวันเริ่มงาน)
function payrollBaseSalaryForBiz(emp, businessId, year, month) {
  return Math.round(salaryRateForBiz(emp, businessId, year, month) * prorationFactor(emp, year, month));
}

export {
  hasSalarySplit,
  employeeBusinessIds,
  businessPositionId,
  businessBaseSalary,
  salaryRateForBiz,
  payrollBaseSalaryForBiz,
};
