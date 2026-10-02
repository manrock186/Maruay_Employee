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

// ---- ค่าจ้างงานเสริมประจำเก็บแยกตาราง recurring_task_pay (RLS: เฉพาะคนมีสิทธิ์เงินเดือน) ----
// tasks ใน DB ไม่มีเงิน (id/name/headcount/assignments[].empId) · แถว pay: { taskId, empId ('' = ค่าตั้งต้นของงาน), amount }
// แยกเงินออกจาก tasks ก่อนบันทึก → { tasks (ไม่มีเงิน), pay (แถวที่จะเขียนลงตาราง pay) }
function splitRecurringPay(tasks) {
  const clean = [], pay = [];
  (tasks || []).forEach((t) => {
    const { defaultPay, ...rest } = t;
    const def = Number(defaultPay) || 0;
    if (def) pay.push({ taskId: t.id, empId: '', amount: def });
    const assignments = (t.assignments || []).map((a) => {
      const { amount, ...ar } = a || {};
      if (ar.empId && amount != null && amount !== '' && Number.isFinite(Number(amount))) pay.push({ taskId: t.id, empId: ar.empId, amount: Number(amount) });
      return ar;
    });
    clean.push({ ...rest, assignments });
  });
  return { tasks: clean, pay };
}
// รวมแถว pay กลับเข้า tasks ให้โค้ดส่วนอื่น (หน้างานเสริม, เงินเดือน) ใช้รูปเดิม: defaultPay + assignments[].amount
function mergeRecurringPay(tasks, payRows) {
  const byTask = {};
  (payRows || []).forEach((r) => {
    const b = (byTask[r.taskId] ||= { def: null, emp: {} });
    if (!r.empId) b.def = Number(r.amount) || 0; else b.emp[r.empId] = Number(r.amount) || 0;
  });
  return (tasks || []).map((t) => {
    const b = byTask[t.id] || { def: null, emp: {} };
    return { ...t, defaultPay: b.def ?? 0, assignments: (t.assignments || []).map((a) => ({ ...a, amount: a?.empId && b.emp[a.empId] != null ? b.emp[a.empId] : null })) };
  });
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

// งานเสริมประจำของพนักงานคนหนึ่งที่ "ยังไม่อยู่" ในรายการ bonus_task ของงวด (เทียบด้วยชื่อรายการ)
// ใช้กับแถวเงินเดือนที่สร้างไว้ก่อนตั้งงานเสริมประจำของเดือนนั้น — ตอนสร้างแถวจึงไม่ได้ถูกเติมให้
function missingRecurringTasks(tasks, items) {
  const have = new Set((items || []).filter((i) => i.kind === 'bonus_task').map((i) => (i.label || '').trim()));
  return (tasks || []).filter((t) => !have.has((t.label || '').trim()));
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
  splitRecurringPay,
  mergeRecurringPay,
  recurringTaskMapFromPool,
  missingRecurringTasks,
  advanceMapFromPool,
};
