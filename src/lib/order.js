import { businessPositionId } from './business.js';

// ============ DISPLAY ORDER (ลำดับที่ผู้ใช้ลากจัดเอง) ============
// เรียงตาม position ใน display_order; ตัวที่ยังไม่มีลำดับ (เพิ่งสร้าง) ไปต่อท้ายตามลำดับเดิม
function sortByOrder(list, map) {
  if (!list?.length) return list;
  const pos = map || {};
  return list
    .map((r, i) => ({ r, i, p: pos[r.id] }))
    .sort((a, b) => {
      const ap = a.p == null ? Infinity : a.p;
      const bp = b.p == null ? Infinity : b.p;
      return ap === bp ? a.i - b.i : ap - bp;
    })
    .map((x) => x.r);
}
// รายการ [{kind, refId, position}] → { employee: {id: pos}, zone: {id: pos} }
function orderRowsToMap(rows) {
  const out = { employee: {}, zone: {}, department: {} };
  (rows || []).forEach((r) => { if (out[r.kind]) out[r.kind][r.refId] = r.position; });
  return out;
}

// เอาลำดับใหม่ของ "บางส่วน" (เช่น คนในโซนเดียว) ใส่กลับเข้าลำดับรวม
// โดยยึดตำแหน่งสลอตเดิมไว้ กลุ่มอื่นจึงไม่ขยับ
function applySubsetOrder(fullIds, subsetNewOrder) {
  const present = new Set(fullIds);
  const subset = subsetNewOrder.filter((id) => present.has(id)); // ตัด id ที่ถูกลบไปแล้วออก
  const inSubset = new Set(subset);
  let k = 0;
  return fullIds.map((id) => (inSubset.has(id) ? subset[k++] : id));
}

// ============ DEPARTMENT (แผนก) ============
// แผนกตั้งที่ "ตำแหน่ง" ไม่ใช่รายคน → พนักงานได้แผนกจากตำแหน่งของตนในธุรกิจนั้นๆ
const NO_DEPT = 'ไม่ระบุแผนก';
function employeeDepartment(emp, positions, businessId) {
  // ถ้าธุรกิจนี้ไม่ได้ตั้งตำแหน่งเฉพาะไว้ ให้ถอยไปใช้ตำแหน่งหลัก
  // ไม่งั้นคนที่ช่วยงานข้ามธุรกิจจะตกไปกอง "ไม่ระบุแผนก" ทั้งที่มีแผนกชัดเจนอยู่แล้ว
  const posId = businessPositionId(emp, businessId) || emp?.positionId;
  const pos = posId ? positions.find((p) => p.id === posId) : null;
  return (pos?.department || '').trim() || NO_DEPT;
}
// รวมชื่อแผนกทั้งหมดที่ใช้อยู่ (ไว้ทำ datalist ตอนพิมพ์ชื่อแผนก)
function allDepartments(positions) {
  return [...new Set((positions || []).map((p) => (p.department || '').trim()).filter(Boolean))].sort();
}

// ============ PAY-COLUMN STRIP (คนที่ไม่มีสิทธิ์เห็นเงินเดือน) ============
// RLS เป็น row-level ตัดคอลัมน์ไม่ได้ → ต้องตัดฝั่ง client ทุกทางที่ข้อมูลเข้ามา
// (โหลดครั้งแรก / realtime / sync หลังบันทึก)
const EMP_PAY_FIELDS = ['baseSalary', 'holidayQuota', 'hasSocialSecurity', 'roomFee', 'salarySplit', 'commissionPct', 'probationSalary'];
function stripEmployeePay(r) { if (r) EMP_PAY_FIELDS.forEach((k) => { delete r[k]; }); return r; }
function stripPositionPay(r) { if (r) delete r.standardSalary; return r; }

export {
  sortByOrder,
  orderRowsToMap,
  applySubsetOrder,
  NO_DEPT,
  employeeDepartment,
  allDepartments,
  EMP_PAY_FIELDS,
  stripEmployeePay,
  stripPositionPay,
};
