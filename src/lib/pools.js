// ============ COMMISSION (คอมมิชชั่น) ============
// กองกลางคอม = กำไร POS − ผลรวมรายการหัก
function commissionPoolValue(pool) {
  if (!pool) return 0;
  const ded = (pool.deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
  return (Number(pool.posProfit) || 0) - ded;
}
// ยอดคอมของพนักงานคนหนึ่งในงวด (จาก entries ที่บันทึกไว้)
function commissionForEmployee(pool, employeeId) {
  if (!pool) return 0;
  const e = (pool.entries || []).find((x) => x.employeeId === employeeId);
  return e ? ((Number(e.amount) || 0) + (Number(e.amount2) || 0)) : 0;
}

// ============ ROOM RENT (ค่าห้องพนักงานจากมิเตอร์) ============
// ยอดรวมต่อห้อง = ค่าเช่า + เหมาน้ำ + (มิเตอร์ใหม่ − เก่า) × เรต
function roomTotal(room) {
  const units = Math.max(0, (Number(room.meterCurr) || 0) - (Number(room.meterPrev) || 0));
  const elec = units * (Number(room.elecRate) || 0);
  const rent = Number(room.rent != null ? room.rent : room.fixedExtra) || 0;
  return rent + (Number(room.waterFlat) || 0) + elec;
}
function roomUnits(room) { return Math.max(0, (Number(room.meterCurr) || 0) - (Number(room.meterPrev) || 0)); }
// map employeeId -> ค่าห้องที่ต้องหัก (หารเท่าตามจำนวนคนในห้อง)
function roomRentMapFromPool(pool) {
  const m = {};
  (pool?.rooms || []).forEach((r) => {
    const occ = (r.occupantIds || []).filter(Boolean);
    if (!occ.length) return;
    const share = roomTotal(r) / occ.length;
    occ.forEach((id) => { m[id] = (m[id] || 0) + share; });
  });
  Object.keys(m).forEach((k) => { m[k] = Math.round(m[k] * 100) / 100; });
  return m;
}

// แปลงพูล "งานเสริมประจำ" → map: empId -> [{ label, amount }] (ค่าจ้างต่อคน ที่จะบวกเข้าเงินเดือน)
function recurringTaskMapFromPool(pool) {
  const m = {};
  (pool?.tasks || []).forEach((t) => {
    const name = (t.name || '').trim() || 'งานเสริมประจำ';
    (t.assignments || []).forEach((a) => {
      if (!a || !a.empId) return;
      const amt = a.amount != null && a.amount !== '' ? Number(a.amount) : (Number(t.defaultPay) || 0);
      if (!amt) return;
      (m[a.empId] ||= []).push({ label: name, amount: Math.round(amt * 100) / 100 });
    });
  });
  return m;
}

// แปลงพูล "เบิกเงิน" → map: empId -> ยอดเบิกรวม (ที่จะไปหักในเงินเดือน)
function advanceMapFromPool(pool) {
  const m = {};
  (pool?.entries || []).forEach((e) => {
    if (!e || !e.empId) return;
    const amt = Number(e.amount) || 0;
    if (!amt) return;
    m[e.empId] = (m[e.empId] || 0) + amt;
  });
  Object.keys(m).forEach((k) => { m[k] = Math.round(m[k] * 100) / 100; });
  return m;
}

export {
  commissionPoolValue,
  commissionForEmployee,
  roomTotal,
  roomUnits,
  roomRentMapFromPool,
  recurringTaskMapFromPool,
  advanceMapFromPool,
};
