import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Users, Plus, Edit2, X, Layers, Calendar, Save, CheckCircle2, Clock, FileText, Wallet, Calculator, TrendingUp, TrendingDown, Sparkles, GripVertical } from 'lucide-react';
import { businessPositionId, businessBaseSalary, payrollBaseSalaryForBiz } from '../lib/business.js';
import { dispName, isActive } from '../lib/format.js';
import { useIsMobile, useDragReorder, dragClass, rowDragClass, cellDropClass } from '../lib/hooks.js';
import { NO_DEPT, employeeDepartment } from '../lib/order.js';
import { MONTH_NAMES, payMonthLabel, fmtMoney, fmt, calcSocialSecurity, computePayroll, buildPayrollDraft } from '../lib/payroll.js';
import { roomRentMapFromPool, recurringTaskMapFromPool, advanceMapFromPool } from '../lib/pools.js';
import { printPayslip, printPayslips, printPayrollRegister } from '../lib/print.js';
import { isProbationPeriod, probationCycle, effectiveBaseSalary, daysInMonth, prorationFactor, payrollBaseSalary } from '../lib/probation.js';
import { FormField, EmptyState, PageHeader, Avatar, EditorRow } from '../ui/index.jsx';

function PayrollPage({ businesses, positions, employees, activeBusinessId, canReorder, deptOrder, ops }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [payrolls, setPayrolls] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState('quick'); // 'quick' | 'list'
  const [showPrintSlips, setShowPrintSlips] = useState(false);
  const [commissionPool, setCommissionPool] = useState(null);
  const [roomRentPool, setRoomRentPool] = useState(null);
  const [recurringTaskPool, setRecurringTaskPool] = useState(null);
  const [advancePool, setAdvancePool] = useState(null);

  // พนักงานในธุรกิจนี้ — คนทำงานอยู่ + คนลาออกที่ยังมีงวดค้างจ่ายในเดือนนี้
  const payrollEmpIds = useMemo(() => new Set(payrolls.map((p) => p.employeeId)), [payrolls]);
  const bizEmployees = useMemo(() => {
    if (!activeBusinessId) return [];
    return employees.filter((e) => {
      // รวมพนักงานที่สังกัดธุรกิจนี้ (หลัก หรือ ธุรกิจเพิ่มเติม) — จ่ายเงินเดือนแยกต่อธุรกิจ
      const inBiz = e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId);
      if (!inBiz) return false;
      // ทำงานอยู่ → แสดงเสมอ / ลาออกแล้ว → แสดงเฉพาะถ้ามีงวด payroll ในเดือนนี้
      return isActive(e) || payrollEmpIds.has(e.id);
    });
  }, [employees, activeBusinessId, payrollEmpIds]);

  // โหลด payroll ของงวดนี้
  useEffect(() => {
    if (!activeBusinessId) { setPayrolls([]); setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const ps = await ops.payroll.listByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      const its = await ops.payrollItem.listByPayrolls(ps.map((p) => p.id));
      if (cancelled) return;
      const pool = await ops.commission.getByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      const rrPool = await ops.roomRent.getByPeriod(year, month);
      if (cancelled) return;
      const rtPool = await ops.recurringTask.getByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      const advPool = await ops.advance.getByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      setPayrolls(ps); setItems(its); setCommissionPool(pool); setRoomRentPool(rrPool); setRecurringTaskPool(rtPool); setAdvancePool(advPool); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeBusinessId, year, month, reload]);

  const payrollByEmp = useMemo(() => {
    const m = {}; payrolls.forEach((p) => { m[p.employeeId] = p; }); return m;
  }, [payrolls]);
  const itemsByPayroll = useMemo(() => {
    const m = {}; items.forEach((i) => { (m[i.payrollId] ||= []).push(i); }); return m;
  }, [items]);
  const commissionMap = useMemo(() => {
    const m = {}; (commissionPool?.entries || []).forEach((e) => { m[e.employeeId] = (Number(e.amount) || 0) + (Number(e.amount2) || 0); }); return m;
  }, [commissionPool]);
  const roomRentMap = useMemo(() => roomRentMapFromPool(roomRentPool), [roomRentPool]);
  const recurringTaskMap = useMemo(() => recurringTaskMapFromPool(recurringTaskPool), [recurringTaskPool]);
  const advanceMap = useMemo(() => advanceMapFromPool(advancePool), [advancePool]);

  const totalNet = useMemo(() => {
    return bizEmployees.reduce((sum, emp) => {
      const p = payrollByEmp[emp.id];
      if (!p) return sum;
      return sum + computePayroll(p, itemsByPayroll[p.id] || []).net;
    }, 0);
  }, [bizEmployees, payrollByEmp, itemsByPayroll]);

  const finalizedCount = payrolls.filter((p) => p.status === 'finalized').length;

  // คนต่างธุรกิจที่ถูกดึงมาทำ "งานเสริมประจำ" ของธุรกิจนี้ → ธุรกิจนี้เป็นคนจ่าย แต่เขาไม่ได้อยู่ใน payroll ของธุรกิจนี้
  const bizEmpIdSet = useMemo(() => new Set(bizEmployees.map((e) => e.id)), [bizEmployees]);
  const externalPayouts = useMemo(() => {
    return Object.entries(recurringTaskMap || {})
      .filter(([id]) => !bizEmpIdSet.has(id))
      .map(([id, items]) => {
        const emp = employees.find((e) => e.id === id);
        const home = emp ? (businesses.find((b) => b.id === emp.businessId)?.name || '') : '';
        const total = (items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
        return { id, name: emp ? dispName(emp) : '— ไม่พบ —', home, items: items || [], total };
      })
      .filter((x) => x.total > 0);
  }, [recurringTaskMap, bizEmpIdSet, employees, businesses]);
  const externalTotal = externalPayouts.reduce((s, x) => s + x.total, 0);
  // จัดกลุ่มตามโซนสำหรับโหมด "รายคน" (โหมดกรอกเร็วจัดกลุ่มเองข้างใน)
  // ต้องอยู่เหนือ early return ทุกอัน ไม่งั้นจำนวน hook เปลี่ยนตาม activeBusinessId → React พัง
  const listRows = useMemo(() => {
    if (!activeBusinessId) return [];
    const map = new Map();
    bizEmployees.forEach((e) => {
      const dept = employeeDepartment(e, positions, activeBusinessId);
      if (!map.has(dept)) map.set(dept, { id: dept, name: dept, rows: [] });
      map.get(dept).rows.push(e);
    });
    const dp = deptOrder || {};
    const gs = [...map.values()].sort((a, b) => {
      if (a.id === NO_DEPT) return 1;
      if (b.id === NO_DEPT) return -1;
      const ap = dp[a.id] == null ? Infinity : dp[a.id];
      const bp = dp[b.id] == null ? Infinity : dp[b.id];
      return ap === bp ? a.name.localeCompare(b.name, 'th') : ap - bp;
    });
    const out = [];
    gs.forEach((g) => { out.push({ type: 'group', g }); g.rows.forEach((emp) => out.push({ type: 'emp', emp })); });
    return out;
  }, [bizEmployees, positions, activeBusinessId, deptOrder]);

  if (!activeBusinessId) return (
    <div className="h-full overflow-auto"><PageHeader title="เงินเดือน" /><div className="p-4 md:p-8"><EmptyState icon={Wallet} title="เลือกธุรกิจที่ sidebar" description="เงินเดือนคำนวณแยกตามธุรกิจ — เลือกธุรกิจก่อน" /></div></div>
  );

  const bizName = businesses.find((b) => b.id === activeBusinessId)?.name;
  const business = businesses.find((b) => b.id === activeBusinessId);
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  // พิมพ์รายงานรวม: ทุกคนในธุรกิจ (คนยังไม่ทำขึ้นว่าง)
  const printReport = () => {
    const rows = bizEmployees.map((emp) => {
      const p = payrollByEmp[emp.id];
      return {
        emp,
        position: positions.find((x) => x.id === businessPositionId(emp, activeBusinessId)),
        payroll: p || null,
        calc: p ? computePayroll(p, itemsByPayroll[p.id] || []) : null,
      };
    });
    printPayrollRegister({ business, rows, year, month });
  };

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="เงินเดือน" subtitle={`${bizName} — งวด ${MONTH_NAMES[month - 1]} ${year + 543} (จ่าย ${payMonthLabel(year, month)})`}>
        <button onClick={() => setShowPrintSlips(true)} disabled={payrolls.length === 0} className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-300 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed text-stone-700 rounded-lg text-sm font-medium">
          <FileText className="w-4 h-4" /> พิมพ์สลิป
        </button>
        <button onClick={printReport} disabled={bizEmployees.length === 0} className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-300 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed text-stone-700 rounded-lg text-sm font-medium">
          <FileText className="w-4 h-4" /> พิมพ์รายงานรวม
        </button>
      </PageHeader>
      <div className="p-4 md:p-8">
        {/* ตัวเลือกเดือน + สรุป */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          {/* สลับโหมด */}
          <div className="inline-flex rounded-lg border border-stone-300 overflow-hidden">
            <button onClick={() => setMode('quick')} className={`px-3 py-2 text-sm font-medium ${mode === 'quick' ? 'bg-emerald-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>กรอกเร็ว</button>
            <button onClick={() => setMode('list')} className={`px-3 py-2 text-sm font-medium ${mode === 'list' ? 'bg-emerald-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>รายคน</button>
          </div>
          <div className="flex-1" />
          <div className="flex gap-3">
            <div className="px-4 py-2 bg-white border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">ทำแล้ว</div>
              <div className="text-sm font-semibold text-stone-800">{payrolls.length}/{bizEmployees.length} คน {finalizedCount > 0 && <span className="text-emerald-600">(ปิดงวด {finalizedCount})</span>}</div>
            </div>
            <div className="px-4 py-2 bg-emerald-900 text-white rounded-lg">
              <div className="text-xs text-emerald-200">ยอดจ่ายรวม</div>
              <div className="text-sm font-semibold">{fmtMoney(totalNet + externalTotal)} ฿</div>
            </div>
          </div>
        </div>

        {externalPayouts.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-sm font-medium text-amber-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4" />งานเสริมประจำ — จ่ายให้พนักงานต่างธุรกิจ</div>
              <div className="text-sm font-semibold text-amber-900">รวม {fmtMoney(externalTotal)} ฿</div>
            </div>
            <p className="text-xs text-amber-700 mb-2">คนเหล่านี้สังกัดธุรกิจอื่น แต่มาทำงานเสริมประจำของ {bizName} — {bizName} เป็นคนจ่าย (เงินเดือนหลักของเขายังอยู่ที่ธุรกิจต้นสังกัด)</p>
            <div className="space-y-1">
              {externalPayouts.map((x) => (
                <div key={x.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2 border border-amber-100">
                  <div className="min-w-0">
                    <span className="text-stone-800">{x.name}</span>
                    {x.home && <span className="text-xs text-stone-400"> · {x.home}</span>}
                    <span className="text-[11px] text-stone-400 block truncate">{x.items.map((it) => `${it.label} ${fmtMoney(it.amount)}`).join(' • ')}</span>
                  </div>
                  <span className="font-semibold text-amber-900 whitespace-nowrap">{fmtMoney(x.total)} ฿</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-stone-400">กำลังโหลด...</div>
        ) : bizEmployees.length === 0 ? (
          <EmptyState icon={Users} title="ยังไม่มีพนักงาน" description="เพิ่มพนักงานก่อนที่หน้า 'พนักงาน'" />
        ) : mode === 'quick' ? (
          <PayrollQuickEntry
            bizEmployees={bizEmployees} positions={positions} deptOrder={deptOrder} canReorder={canReorder}
            payrollByEmp={payrollByEmp} itemsByPayroll={itemsByPayroll} commissionMap={commissionMap} roomRentMap={roomRentMap} recurringTaskMap={recurringTaskMap} advanceMap={advanceMap}
            year={year} month={month} businessId={activeBusinessId} ops={ops}
            onSaved={() => setReload((r) => r + 1)}
            onOpenDetail={(emp) => setEditingEmp(emp)}
          />
        ) : (
          <div className="space-y-2">
            {listRows.map((fr) => {
              if (fr.type === 'group') return (
                <div key={`g-${fr.g.id}`} className="flex items-center gap-2 pt-3 pb-1">
                  <Layers className="w-3.5 h-3.5 text-stone-400" />
                  <span className="text-xs font-semibold text-stone-600 tracking-wide">{fr.g.name}</span>
                  <span className="text-xs text-stone-400">({fr.g.rows.length})</span>
                </div>
              );
              const emp = fr.emp;
              const p = payrollByEmp[emp.id];
              const calc = p ? computePayroll(p, itemsByPayroll[p.id] || []) : null;
              const pos = positions.find((x) => x.id === businessPositionId(emp, activeBusinessId));
              const bizBase = businessBaseSalary(emp, activeBusinessId);
              const noSalary = !bizBase || bizBase <= 0;
              return (
                <div key={emp.id} className={`bg-white rounded-xl border-2 ${p?.status === 'finalized' ? 'border-emerald-300' : 'border-stone-200'} p-4 flex items-center gap-4 hover:shadow-sm transition-all`}>
                  <Avatar photo={emp.photo} name={dispName(emp)} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-stone-400">#{emp.employeeNumber}</span>
                      <span className="font-medium text-stone-800 truncate">{dispName(emp)}</span>
                      {p?.status === 'finalized' && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded"><CheckCircle2 className="w-2.5 h-2.5" />ปิดงวดแล้ว</span>}
                    </div>
                    <div className="text-sm text-stone-500 truncate">{pos?.name || 'ยังไม่กำหนดตำแหน่ง'} • ฐาน {fmtMoney(bizBase)} ฿</div>
                  </div>
                  <div className="text-right">
                    {noSalary ? (
                      <span className="text-xs text-amber-600">ยังไม่ตั้งเงินเดือน</span>
                    ) : calc ? (
                      <>
                        <div className="text-xs text-stone-400">สุทธิ</div>
                        <div className="font-semibold text-emerald-700">{fmtMoney(calc.net)} ฿</div>
                      </>
                    ) : (
                      <span className="text-xs text-stone-400">ยังไม่ทำ</span>
                    )}
                  </div>
                  <button onClick={() => setEditingEmp(emp)} disabled={noSalary} className="px-3 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-200 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-1.5">
                    <Calculator className="w-4 h-4" />{p ? 'แก้ไข' : 'ทำ'}
                  </button>
                  {p && (
                    <button onClick={() => printPayslip({ employee: emp, payroll: p, items: itemsByPayroll[p.id] || [], business: businesses.find((b) => b.id === activeBusinessId), position: positions.find((x) => x.id === businessPositionId(emp, activeBusinessId)), year, month })} title="พิมพ์สลิปเงินเดือน" className="px-3 py-2 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-lg text-sm font-medium flex items-center gap-1.5">
                      <FileText className="w-4 h-4" /><span className="hidden sm:inline">สลิป</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingEmp && (
        <PayrollEditor
          employee={editingEmp}
          existing={payrollByEmp[editingEmp.id]}
          existingItems={payrollByEmp[editingEmp.id] ? (itemsByPayroll[payrollByEmp[editingEmp.id].id] || []) : []}
          year={year} month={month} businessId={activeBusinessId} businessName={bizName}
          commissionPrefill={commissionMap[editingEmp.id] || 0}
          roomFeePrefill={roomRentMap[editingEmp.id]}
          bonusPrefill={recurringTaskMap[editingEmp.id] || []}
          advancePrefill={advanceMap[editingEmp.id] || 0}
          ops={ops}
          onClose={() => setEditingEmp(null)}
          onSaved={() => { setEditingEmp(null); setReload((r) => r + 1); }}
        />
      )}
      {showPrintSlips && (
        <PrintSlipsModal
          business={business}
          bizEmployees={bizEmployees}
          payrollByEmp={payrollByEmp}
          itemsByPayroll={itemsByPayroll}
          positions={positions}
          activeBusinessId={activeBusinessId}
          year={year} month={month}
          onClose={() => setShowPrintSlips(false)}
        />
      )}
    </div>
  );
}

// ============ PRINT SLIPS MODAL (ฟอร์มพิมพ์สลิปรายคน) ============
function PrintSlipsModal({ business, bizEmployees, payrollByEmp, itemsByPayroll, positions, activeBusinessId, year, month, onClose }) {
  // เฉพาะคนที่ทำเงินเดือนงวดนี้แล้ว (มีสลิปให้พิมพ์)
  const rows = bizEmployees.filter((e) => payrollByEmp[e.id]).map((e) => ({
    emp: e,
    payroll: payrollByEmp[e.id],
    items: itemsByPayroll[payrollByEmp[e.id].id] || [],
    position: positions.find((x) => x.id === businessPositionId(e, activeBusinessId)),
  }));
  const [selected, setSelected] = useState(() => new Set(rows.map((r) => r.emp.id)));
  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = selected.size === rows.length && rows.length > 0;
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.emp.id)));

  const argsFor = (r) => ({ employee: r.emp, payroll: r.payroll, items: r.items, business, position: r.position, year, month });
  const printOne = (r) => printPayslip(argsFor(r));
  const printSelected = () => {
    const list = rows.filter((r) => selected.has(r.emp.id)).map(argsFor);
    printPayslips(list, year, month);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[88vh] sm:max-h-[88vh] flex flex-col">
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <div className="font-semibold text-stone-800">พิมพ์สลิปเงินเดือน</div>
            <div className="text-xs text-stone-500">{business?.name} • {MONTH_NAMES[month - 1]} {year + 543}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-sm">ยังไม่มีพนักงานที่ทำเงินเดือนงวดนี้ — ทำเงินเดือนก่อนถึงจะพิมพ์สลิปได้</div>
        ) : (
          <>
            <div className="px-5 py-2 border-b border-stone-100 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
                <input type="checkbox" checked={allOn} onChange={toggleAll} className="w-4 h-4 rounded text-emerald-700" />
                เลือกทั้งหมด ({selected.size}/{rows.length})
              </label>
            </div>
            <div className="p-3 overflow-auto space-y-1.5 flex-1">
              {rows.map((r) => {
                const calc = computePayroll(r.payroll, r.items);
                const on = selected.has(r.emp.id);
                return (
                  <div key={r.emp.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${on ? 'border-emerald-300 bg-emerald-50/40' : 'border-stone-200'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(r.emp.id)} className="w-4 h-4 rounded text-emerald-700 flex-shrink-0" />
                    <Avatar photo={r.emp.photo} name={dispName(r.emp)} size={34} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-stone-800 truncate text-sm"><span className="font-mono text-xs text-stone-400 mr-1">#{r.emp.employeeNumber}</span>{dispName(r.emp)}</div>
                      <div className="text-xs text-stone-500">{r.position?.name || '—'} • สุทธิ {fmtMoney(calc.net)} ฿{r.payroll.status === 'finalized' && <span className="text-emerald-600"> • ปิดงวดแล้ว</span>}</div>
                    </div>
                    <button onClick={() => printOne(r)} title="พิมพ์สลิปคนนี้" className="flex-shrink-0 px-3 py-1.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-lg text-sm font-medium flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />พิมพ์
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex justify-between items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">ปิด</button>
              <button onClick={printSelected} disabled={selected.size === 0} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
                <FileText className="w-4 h-4" />พิมพ์ที่เลือก ({selected.size})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============ STABLE INPUT COMPONENTS (ระดับโมดูล — กันช่องกรอกเสียโฟกัสตอนพิมพ์) ============
function EditorItemList({ title, list, setList, color, addLabel, disabled, priceMap = {} }) {
  const dlId = useRef('dl-' + Math.random().toString(36).slice(2, 9)).current;
  const knownLabels = Object.keys(priceMap || {});
  // เปลี่ยนชื่อรายการ: ถ้าเคยกรอกชื่อนี้มาก่อนและช่องเงินยังว่าง ให้เติมราคาที่จำไว้ (แก้ได้)
  const onLabel = (idx, label) => setList(list.map((x, i) => {
    if (i !== idx) return x;
    const next = { ...x, label };
    if ((x.amount === '' || x.amount == null) && priceMap && priceMap[label] != null) next.amount = priceMap[label];
    return next;
  }));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-stone-600">{title}</span>
        {!disabled && <button type="button" onClick={() => setList([...list, { label: '', amount: '' }])} className={`text-xs ${color} hover:underline flex items-center gap-0.5`}><Plus className="w-3 h-3" />{addLabel}</button>}
      </div>
      {knownLabels.length > 0 && <datalist id={dlId}>{knownLabels.map((l) => <option key={l} value={l} />)}</datalist>}
      <div className="space-y-1.5">
        {list.length === 0 && <div className="text-xs text-stone-400 italic">ไม่มี</div>}
        {list.map((it, idx) => (
          <div key={idx} className="flex gap-2">
            <input disabled={disabled} list={knownLabels.length ? dlId : undefined} value={it.label} onChange={(e) => onLabel(idx, e.target.value)} placeholder="รายการ" className="flex-1 px-2 py-1.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
            <input disabled={disabled} type="number" min="0" step="0.01" value={it.amount} onChange={(e) => setList(list.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))} placeholder="0.00" className="w-28 px-2 py-1.5 text-sm border border-stone-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
            {!disabled && <button type="button" onClick={() => setList(list.filter((_, i) => i !== idx))} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><X className="w-4 h-4" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ PAYROLL EDITOR MODAL ============
function PayrollEditor({ employee, existing, existingItems, year, month, businessId, businessName, commissionPrefill, roomFeePrefill, bonusPrefill, advancePrefill, ops, onClose, onSaved }) {
  const isFinalized = existing?.status === 'finalized';
  const [unlocked, setUnlocked] = useState(false);
  const locked = isFinalized && !unlocked;
  // ค่าตั้งต้น: ถ้ามี payroll แล้วใช้ค่าเดิม ถ้าไม่มีดึงจากข้อมูลพนักงาน
  const [f, setF] = useState(() => ({
    baseSalary: existing?.baseSalary ?? payrollBaseSalaryForBiz(employee, businessId, year, month),
    holidayQuota: existing?.holidayQuota ?? employee.holidayQuota ?? 4,
    commission: existing?.commission ?? commissionPrefill ?? 0,
    holidayWorkDays: existing?.holidayWorkDays ?? 0,
    holidayDaysTaken: existing?.holidayDaysTaken ?? 0,
    lateDeduction: existing?.lateDeduction ?? 0,
    socialSecurity: existing?.socialSecurity ?? (employee.hasSocialSecurity ? calcSocialSecurity(payrollBaseSalaryForBiz(employee, businessId, year, month)) : 0),
    roomFee: existing?.roomFee ?? (roomFeePrefill != null ? roomFeePrefill : (employee.roomFee ?? 0)),
    paidViaCompany: existing?.paidViaCompany ?? 0,
    note: existing?.note ?? '',
  }));
  const [bonusTasks, setBonusTasks] = useState(
    existing
      ? existingItems.filter((i) => i.kind === 'bonus_task').map((i) => ({ label: i.label, amount: i.amount }))
      : (bonusPrefill || []).map((t) => ({ label: t.label, amount: t.amount }))
  );
  const [advances, setAdvances] = useState(
    existing
      ? existingItems.filter((i) => i.kind === 'advance').map((i) => ({ label: i.label, amount: i.amount }))
      : (advancePrefill ? [{ label: 'เบิกล่วงหน้า', amount: advancePrefill }] : [])
  );
  const [otherDeductions, setOtherDeductions] = useState(existingItems.filter((i) => i.kind === 'other_deduction').map((i) => ({ label: i.label, amount: i.amount })));
  const [priceMaps, setPriceMaps] = useState({});
  useEffect(() => { let c = false; (async () => { const m = ops.payrollItem.recentPrices ? await ops.payrollItem.recentPrices() : {}; if (!c) setPriceMaps(m || {}); })(); return () => { c = true; }; }, []);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const allItems = [
    ...bonusTasks.map((i) => ({ ...i, kind: 'bonus_task' })),
    ...advances.map((i) => ({ ...i, kind: 'advance' })),
    ...otherDeductions.map((i) => ({ ...i, kind: 'other_deduction' })),
  ];
  const calc = computePayroll(f, allItems);

  const save = async (finalize) => {
    setSaving(true);
    try {
      const payload = {
        employeeId: employee.id, businessId, periodYear: year, periodMonth: month,
        baseSalary: Number(f.baseSalary) || 0, dailyRate: (Number(f.baseSalary) || 0) / 30,
        holidayQuota: Number(f.holidayQuota) || 0,
        commission: Number(f.commission) || 0,
        holidayWorkDays: Number(f.holidayWorkDays) || 0,
        holidayDaysTaken: Number(f.holidayDaysTaken) || 0,
        lateDeduction: Number(f.lateDeduction) || 0,
        socialSecurity: Number(f.socialSecurity) || 0,
        roomFee: Number(f.roomFee) || 0,
        paidViaCompany: Number(f.paidViaCompany) || 0,
        note: f.note || null,
        status: finalize ? 'finalized' : 'draft',
        finalizedAt: finalize ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      };
      const saved = await ops.payroll.upsert(payload);
      if (!saved) { setSaving(false); return; }
      // ลบ items เก่าทั้งหมด แล้วใส่ใหม่
      const oldItems = await ops.payrollItem.listByPayrolls([saved.id]);
      for (const it of oldItems) await ops.payrollItem.delete(it.id);
      for (const it of allItems) {
        if (!it.label?.trim() && !Number(it.amount)) continue;
        await ops.payrollItem.add({ payrollId: saved.id, kind: it.kind, label: it.label?.trim() || '-', amount: Number(it.amount) || 0 });
      }
      onSaved();
    } finally { setSaving(false); }
  };

  const numInput = (k, opts = {}) => (
    <input type="number" min="0" step="0.01" disabled={locked || opts.disabled} value={f[k]} onChange={(e) => set(k, e.target.value)} className="w-full px-2 py-1.5 text-sm border border-stone-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
  );

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar photo={employee.photo} name={dispName(employee)} size={40} />
            <div>
              <div className="font-semibold text-stone-800">{dispName(employee)} <span className="font-mono text-xs text-stone-400">#{employee.employeeNumber}</span></div>
              <div className="text-xs text-stone-500">{businessName ? `${businessName} • ` : ''}{MONTH_NAMES[month - 1]} {year + 543}{isFinalized && ' • ปิดงวดแล้ว'}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 sm:p-6 overflow-auto overscroll-contain space-y-5">
          {locked && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
              <div className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5" /><div>งวดนี้ปิดแล้ว — กด "แก้ไขงวดนี้" ถ้าคิดผิด/ต้องการแก้</div></div>
              <button onClick={() => setUnlocked(true)} className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-xs font-medium"><Edit2 className="w-3.5 h-3.5" />แก้ไขงวดนี้</button>
            </div>
          )}
          {isFinalized && unlocked && (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <Edit2 className="w-4 h-4 mt-0.5" /><div>กำลังแก้งวดที่ปิดแล้ว — แก้ตัวเลขแล้วเลือก "บันทึก (คงปิดงวด)" หรือ "เปิดเป็นร่าง" ด้านล่าง</div>
            </div>
          )}

          {/* รายรับ */}
          <div className="bg-emerald-50/40 rounded-xl p-4">
            {isProbationPeriod(employee, year, month) && (
              <div className="flex items-start gap-2 mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>อยู่ช่วง<b>ทดลองงาน</b> (รอบบิลที่ {probationCycle(employee, year, month)}/{employee.probationMonths}) — ตั้งต้นด้วยเงินเดือนทดลอง <b>{fmtMoney(employee.probationSalary)} ฿</b> (เงินเดือนเต็มหลังผ่าน: {fmtMoney(employee.baseSalary)} ฿) ปรับตัวเลขด้านล่างได้</span>
              </div>
            )}
            {prorationFactor(employee, year, month) < 1 && (
              <div className="flex items-start gap-2 mb-3 p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-800">
                <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>เริ่มงานกลางเดือน ({fmt(employee.startDate)}) — <b>เฉลี่ยเงินเดือน</b>ตามวันที่ทำจริง {daysInMonth(year, month) - new Date(employee.startDate).getDate() + 1}/{daysInMonth(year, month)} วัน = ตั้งต้น <b>{fmtMoney(payrollBaseSalary(employee, year, month))} ฿</b> (เต็มเดือน {fmtMoney(effectiveBaseSalary(employee, year, month))} ฿) ปรับได้</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 mb-2"><TrendingUp className="w-4 h-4" />รายรับ</div>
            <EditorRow label="เงินเดือนฐาน" hint={`ค่าแรง/วัน = ${fmtMoney(calc.daily)} ฿`}>{numInput('baseSalary')}</EditorRow>
            <EditorRow label="คอมมิชชั่น" hint={!existing && commissionPrefill ? 'จากหน้าคอมมิชชั่นงวดนี้' : undefined}>{numInput('commission')}</EditorRow>
            <EditorRow label="ทำงานวันหยุด (วัน)" hint={`+${fmtMoney(calc.holidayWorkPay)} ฿`}>{numInput('holidayWorkDays')}</EditorRow>
            <div className="mt-2 pt-2 border-t border-emerald-100"><EditorItemList title="งานเสริม (ล้างห้องน้ำ, ลอกท่อ ฯลฯ)" list={bonusTasks} setList={setBonusTasks} color="text-emerald-700" addLabel="เพิ่มงานเสริม" disabled={locked} priceMap={priceMaps.bonus_task} /></div>
          </div>

          {/* วันหยุด */}
          <div className="bg-stone-50 rounded-xl p-4">
            <div className="text-sm font-semibold text-stone-700 mb-2">วันหยุด</div>
            <EditorRow label="โควต้าวันหยุดเดือนนี้">{numInput('holidayQuota')}</EditorRow>
            <EditorRow label="วันหยุดที่ใช้จริง" hint={calc.excessDays > 0 ? `เกิน ${calc.excessDays} วัน → หัก ${fmtMoney(calc.excessHolidayDeduction)} ฿` : 'ไม่เกินโควต้า'}>{numInput('holidayDaysTaken')}</EditorRow>
          </div>

          {/* รายการหัก */}
          <div className="bg-red-50/40 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-red-700 mb-2"><TrendingDown className="w-4 h-4" />รายการหัก</div>
            {calc.excessHolidayDeduction > 0 && <EditorRow label="หักหยุดเกิน (อัตโนมัติ)"><div className="text-right text-sm text-red-600 py-1.5">−{fmtMoney(calc.excessHolidayDeduction)}</div></EditorRow>}
            <EditorRow label="หักมาสาย">{numInput('lateDeduction')}</EditorRow>
            <EditorRow label="ประกันสังคม" hint={employee.hasSocialSecurity ? '5% ของฐาน สูงสุด 750' : 'พนักงานนี้ไม่มี ปกส.'}>{numInput('socialSecurity')}</EditorRow>
            <EditorRow label="ค่าห้องพัก" hint={!existing && roomFeePrefill != null ? 'จากหน้าค่าห้อง (มิเตอร์) งวดนี้' : undefined}>{numInput('roomFee')}</EditorRow>
            <EditorRow label="รับผ่านบัญชี บ.วีเอสจง แล้ว" hint="เงินที่จ่ายไปแล้ว">{numInput('paidViaCompany')}</EditorRow>
            <div className="mt-2 pt-2 border-t border-red-100 space-y-3">
              <EditorItemList title="เบิกล่วงหน้า" list={advances} setList={setAdvances} color="text-red-600" addLabel="เพิ่มการเบิก" disabled={locked} priceMap={priceMaps.advance} />
              <EditorItemList title="หักอื่นๆ" list={otherDeductions} setList={setOtherDeductions} color="text-red-600" addLabel="เพิ่มรายการหัก" disabled={locked} priceMap={priceMaps.other_deduction} />
            </div>
          </div>

          <FormField label="หมายเหตุ"><textarea disabled={locked} value={f.note} onChange={(e) => set('note', e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" /></FormField>

          {/* สรุป */}
          <div className="bg-emerald-900 text-white rounded-xl p-4">
            <div className="flex justify-between text-sm text-emerald-100"><span>รายรับรวม</span><span>{fmtMoney(calc.totalIncome)} ฿</span></div>
            <div className="flex justify-between text-sm text-emerald-100 mt-1"><span>หักรวม</span><span>−{fmtMoney(calc.totalDeduction)} ฿</span></div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-emerald-700">
              <span className="font-semibold">เงินเดือนสุทธิ</span>
              <span className="text-xl font-bold text-amber-300">{fmtMoney(calc.net)} ฿</span>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
          {locked ? (
            <button onClick={() => setUnlocked(true)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-medium"><Edit2 className="w-4 h-4" />แก้ไขงวดนี้</button>
          ) : isFinalized && unlocked ? (
            <>
              <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 text-amber-700 hover:bg-amber-50 border border-amber-300 rounded-lg text-sm font-medium">บันทึก + เปิดเป็นร่าง</button>
              <button onClick={() => save(true)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><CheckCircle2 className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก (คงปิดงวด)'}</button>
            </>
          ) : (
            <>
              <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">{saving ? 'กำลังบันทึก...' : 'บันทึกร่าง'}</button>
              <button onClick={() => save(true)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><CheckCircle2 className="w-4 h-4" />บันทึก + ปิดงวด</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ PAYROLL QUICK ENTRY (Spreadsheet / Cards) ============
function PayrollQuickEntry({ bizEmployees, positions, deptOrder, canReorder, payrollByEmp, itemsByPayroll, commissionMap, roomRentMap, recurringTaskMap, advanceMap, year, month, businessId, ops, onSaved, onOpenDetail }) {
  const isMobile = useIsMobile();
  const [drafts, setDrafts] = useState({});
  const [touched, setTouched] = useState(() => new Set());
  const [itemsEmp, setItemsEmp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pastBonus, setPastBonus] = useState([]);
  const [priceMaps, setPriceMaps] = useState({});

  // ดึงรายการงานเสริมที่เคยใช้ในอดีต (เช่น ล้างห้องน้ำ) + ราคาล่าสุดที่จำไว้ของแต่ละรายการ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const labels = ops.payrollItem.distinctLabels ? await ops.payrollItem.distinctLabels('bonus_task') : [];
      const prices = ops.payrollItem.recentPrices ? await ops.payrollItem.recentPrices() : {};
      if (!cancelled) { setPastBonus([...new Set(['ล้างห้องน้ำ', ...labels])]); setPriceMaps(prices || {}); }
    })();
    return () => { cancelled = true; };
  }, []);

  // "เบิกล่วงหน้า" จัดการเป็นรายการ advance ที่มี label คงที่ (โชว์เป็นช่องเดียวในตารางกรอกเร็ว)
  const ADV_LABEL = 'เบิกล่วงหน้า';
  const quickAdvance = (empId) => {
    const it = (drafts[empId]?.items || []).find((i) => i.kind === 'advance' && i.label === ADV_LABEL);
    return it ? it.amount : '';
  };
  const setQuickAdvance = (empId, value) => {
    const items = (drafts[empId]?.items || []).filter((i) => !(i.kind === 'advance' && i.label === ADV_LABEL));
    if (value !== '' && Number(value)) items.push({ kind: 'advance', label: ADV_LABEL, amount: value });
    updItems(empId, items);
  };

  // ลายเซ็นของข้อมูลพนักงาน แบบไม่สนลำดับ (เรียงก่อน join)
  // ใช้เป็น dep แทน bizEmployees เพื่อไม่ให้ "แค่ลากสลับลำดับ" ไปล้างค่าที่ยังพิมพ์ค้างอยู่
  const empSig = useMemo(() => bizEmployees
    .map(({ photo, workPermitDocs, passportDocs, applicationDocs, ...rest }) => JSON.stringify(rest))
    .sort()
    .join('|'), [bizEmployees]);

  // init drafts เมื่อข้อมูลเปลี่ยน
  useEffect(() => {
    const d = {};
    bizEmployees.forEach((emp) => {
      const p = payrollByEmp[emp.id];
      const its = p ? (itemsByPayroll[p.id] || []) : [];
      d[emp.id] = buildPayrollDraft(emp, p, its, year, month, businessId);
      if (!p && commissionMap && commissionMap[emp.id]) d[emp.id].commission = commissionMap[emp.id];
      if (!p && roomRentMap && roomRentMap[emp.id] != null) d[emp.id].roomFee = roomRentMap[emp.id];
      // งานเสริมประจำ → เติมเป็นรายการ bonus_task ให้คนที่ยังไม่ได้ทำเงินเดือนงวดนี้
      if (!p && recurringTaskMap && (recurringTaskMap[emp.id] || []).length) {
        d[emp.id].items = [...(d[emp.id].items || []), ...recurringTaskMap[emp.id].map((t) => ({ kind: 'bonus_task', label: t.label, amount: t.amount }))];
      }
      // เบิกเงินระหว่างเดือน → เติมยอดรวมเข้าช่อง "เบิก" (label 'เบิกล่วงหน้า') ให้คนที่ยังไม่ได้ทำเงินเดือน
      if (!p && advanceMap && advanceMap[emp.id]) {
        d[emp.id].items = [...(d[emp.id].items || []).filter((i) => !(i.kind === 'advance' && i.label === 'เบิกล่วงหน้า')), { kind: 'advance', label: 'เบิกล่วงหน้า', amount: advanceMap[emp.id] }];
      }
    });
    setDrafts(d);
    setTouched(new Set());
    // ตั้งใจใช้ empSig แทน bizEmployees — ดูคอมเมนต์ด้านบน
  }, [empSig, payrollByEmp, itemsByPayroll, commissionMap, roomRentMap, recurringTaskMap, advanceMap]);

  const upd = (empId, field, value) => {
    setDrafts((prev) => ({ ...prev, [empId]: { ...prev[empId], [field]: value } }));
    setTouched((prev) => new Set(prev).add(empId));
  };
  const updItems = (empId, items) => {
    setDrafts((prev) => ({ ...prev, [empId]: { ...prev[empId], items } }));
    setTouched((prev) => new Set(prev).add(empId));
  };

  // navigation: Enter/ลูกศร เลื่อนแนวตั้ง
  const onKeyNav = (e, col, rowIdx) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      document.querySelector(`[data-cell="${col}-${rowIdx + 1}"]`)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      document.querySelector(`[data-cell="${col}-${rowIdx - 1}"]`)?.focus();
    }
  };

  const eligible = useMemo(() => bizEmployees.filter((e) => Number(e.baseSalary) > 0), [bizEmployees]);
  const noSalaryCount = bizEmployees.length - eligible.length;

  // ---- จัดกลุ่มตามแผนก (แผนกมาจากตำแหน่ง · ลำดับแผนก + ลำดับคน มาจาก display_order ที่ผู้ใช้ลากจัดเอง) ----
  const groups = useMemo(() => {
    const map = new Map();
    eligible.forEach((e) => {
      const dept = employeeDepartment(e, positions, businessId);
      if (!map.has(dept)) map.set(dept, { id: dept, name: dept, rows: [] });
      map.get(dept).rows.push(e);
    });
    const deptPos = deptOrder || {};
    const out = [...map.values()];
    // แผนกที่ยังไม่เคยจัดลำดับไปต่อท้าย · "ไม่ระบุแผนก" อยู่ล่างสุดเสมอ
    out.sort((a, b) => {
      if (a.id === NO_DEPT) return 1;
      if (b.id === NO_DEPT) return -1;
      const ap = deptPos[a.id] == null ? Infinity : deptPos[a.id];
      const bp = deptPos[b.id] == null ? Infinity : deptPos[b.id];
      return ap === bp ? a.name.localeCompare(b.name, 'th') : ap - bp;
    });
    return out;
  }, [eligible, positions, businessId, deptOrder]);

  // แถวแบนราบ: หัวข้อโซน + คน — เพื่อให้เลข rowIdx (ใช้กับ Enter/ลูกศร) ไล่ต่อเนื่องข้ามโซน
  const flatRows = useMemo(() => {
    const out = []; let i = 0;
    groups.forEach((g) => { out.push({ type: 'group', g }); g.rows.forEach((emp) => { out.push({ type: 'emp', emp, g, rowIdx: i }); i += 1; }); });
    return out;
  }, [groups]);

  const empGroupOf = useMemo(() => {
    const m = {};
    groups.forEach((g) => g.rows.forEach((e) => { m[e.id] = g.id; }));
    return (id) => m[id];
  }, [groups]);
  const deptIds = useMemo(() => groups.filter((g) => g.id !== NO_DEPT).map((g) => g.id), [groups]);
  const empIds = useMemo(() => eligible.map((e) => e.id), [eligible]);
  const empDrag = useDragReorder(empIds, (next) => ops.displayOrder.reorder('employee', next), empGroupOf);
  // ลำดับแผนกเป็น global (ชื่อแผนกใช้ร่วมกันข้ามธุรกิจ) → ส่งลำดับของแผนกที่เห็นอยู่ให้ merge เข้าลำดับรวม
  const deptDrag = useDragReorder(deptIds, (next) => ops.displayOrder.reorderDepartments(next));
  const canDragDept = canReorder && deptIds.length > 1;

  const groupGrip = (g, mobile) => (
    <div className={`flex items-center gap-2 ${mobile ? 'px-1 pt-3 pb-1' : ''}`}>
      {canDragDept && g.id !== NO_DEPT && (
        <span {...deptDrag.bindHandle(g.id, true)} title="ลากเพื่อสลับลำดับแผนก" className="text-stone-400 hover:text-stone-600 -ml-1">
          <GripVertical className="w-4 h-4" />
        </span>
      )}
      <Layers className="w-3.5 h-3.5 text-stone-400" />
      <span className="text-xs font-semibold text-stone-600 tracking-wide">{g.name}</span>
      <span className="text-xs text-stone-400">({g.rows.length})</span>
    </div>
  );

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const empId of touched) {
        const emp = bizEmployees.find((e) => e.id === empId);
        const draft = drafts[empId];
        if (!emp || !draft || !Number(draft.baseSalary)) continue;
        const payload = {
          employeeId: empId, businessId, periodYear: year, periodMonth: month,
          baseSalary: Number(draft.baseSalary) || 0, dailyRate: (Number(draft.baseSalary) || 0) / 30,
          holidayQuota: Number(draft.holidayQuota) || 0,
          commission: Number(draft.commission) || 0,
          holidayWorkDays: Number(draft.holidayWorkDays) || 0,
          holidayDaysTaken: Number(draft.holidayDaysTaken) || 0,
          lateDeduction: Number(draft.lateDeduction) || 0,
          socialSecurity: Number(draft.socialSecurity) || 0,
          roomFee: Number(draft.roomFee) || 0,
          paidViaCompany: Number(draft.paidViaCompany) || 0,
          note: draft.note || null,
          status: draft.status || 'draft',
          updatedAt: new Date().toISOString(),
        };
        const saved = await ops.payroll.upsert(payload);
        if (!saved) continue;
        const oldItems = await ops.payrollItem.listByPayrolls([saved.id]);
        for (const it of oldItems) await ops.payrollItem.delete(it.id);
        for (const it of (draft.items || [])) {
          if (!it.label?.trim() && !Number(it.amount)) continue;
          await ops.payrollItem.add({ payrollId: saved.id, kind: it.kind, label: it.label?.trim() || '-', amount: Number(it.amount) || 0 });
        }
      }
      onSaved();
    } finally { setSaving(false); }
  };

  // input cell ในตาราง
  const Cell = ({ empId, field, col, rowIdx, locked, w = 'w-20' }) => (
    <input
      type="number" step="0.01" inputMode="decimal"
      data-cell={`${col}-${rowIdx}`}
      disabled={locked}
      value={drafts[empId]?.[field] ?? ''}
      onChange={(e) => upd(empId, field, e.target.value)}
      onKeyDown={(e) => onKeyNav(e, col, rowIdx)}
      onFocus={(e) => e.target.select()}
      className={`${w} px-2 py-1.5 text-sm text-right border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:bg-stone-100 disabled:text-stone-400`}
    />
  );

  const itemCount = (empId) => (drafts[empId]?.items || []).filter((i) => i.label?.trim() || Number(i.amount)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm text-stone-500">
          {touched.size > 0
            ? <span className="text-amber-700 font-medium">● แก้ไข {touched.size} คน ยังไม่บันทึก</span>
            : `พิมพ์ตัวเลขในช่อง → กด Enter ลงคนถัดไป${canReorder ? (isMobile ? ' · แตะค้างที่ชื่อเพื่อสลับลำดับ' : ' · ลากไอคอนจุดหน้าชื่อเพื่อสลับลำดับ') : ''}`}
          {noSalaryCount > 0 && <span className="ml-2 text-amber-600">({noSalaryCount} คนยังไม่ตั้งเงินเดือน)</span>}
        </div>
        <button onClick={saveAll} disabled={saving || touched.size === 0} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
          <Save className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : `บันทึกทั้งหมด${touched.size > 0 ? ` (${touched.size})` : ''}`}
        </button>
      </div>

      {isMobile ? (
        /* ===== มือถือ: การ์ด ===== */
        <div className="space-y-3">
          {flatRows.map((fr) => {
            if (fr.type === 'group') return (
              <div key={`g-${fr.g.id}`} data-drag-id={fr.g.id !== NO_DEPT ? fr.g.id : undefined} className={`rounded-lg ${dragClass(fr.g.id, deptDrag.dragId, deptDrag.overId)}`}>
                {groupGrip(fr.g, true)}
              </div>
            );
            const emp = fr.emp;
            const d = drafts[emp.id]; if (!d) return null;
            const locked = d.status === 'finalized';
            const calc = computePayroll(d, d.items);
            const dirty = touched.has(emp.id);
            const F = ({ label, field, hint }) => (
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm text-stone-600">{label}{hint && <span className="block text-[11px] text-stone-400">{hint}</span>}</span>
                <input type="number" step="0.01" inputMode="decimal" disabled={locked} value={d[field] ?? ''} onChange={(e) => upd(emp.id, field, e.target.value)} onFocus={(e) => e.target.select()} className="w-28 px-2 py-1.5 text-sm text-right border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
              </div>
            );
            const D = ({ label, value, hint }) => (
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm text-stone-600">{label}{hint && <span className="block text-[11px] text-stone-400">{hint}</span>}</span>
                <span className="w-28 px-2 py-1.5 text-sm text-right text-stone-500">{Number(value) ? fmtMoney(value) : '—'}</span>
              </div>
            );
            return (
              <div key={emp.id} data-drag-id={emp.id} className={`bg-white rounded-xl border-2 p-4 ${dirty ? 'border-amber-300 bg-amber-50/20' : locked ? 'border-emerald-300' : 'border-stone-200'} ${dragClass(emp.id, empDrag.dragId, empDrag.overId)}`}>
                <div className="flex items-center gap-3 mb-2" {...(canReorder ? empDrag.bindHandle(emp.id) : {})} title={canReorder ? 'แตะค้างเพื่อลากสลับลำดับ' : undefined}>
                  {canReorder && <GripVertical className="w-4 h-4 text-stone-300 shrink-0 -ml-1" />}
                  <Avatar photo={emp.photo} name={dispName(emp)} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-stone-800 truncate"><span className="font-mono text-xs text-stone-400 mr-1">#{emp.employeeNumber}</span>{dispName(emp)}</div>
                    <div className="text-xs text-stone-500">ฐาน {fmtMoney(d.baseSalary)} ฿ • {fmtMoney(calc.daily)}/วัน</div>
                  </div>
                  {locked && <span className="text-[10px] text-emerald-700 font-medium">ปิดงวดแล้ว</span>}
                </div>
                {F({ label: 'หยุด', field: 'holidayDaysTaken', hint: calc.holidayWorkPay > 0 ? `ลบ=ทำงานวันหยุด • +${fmtMoney(calc.holidayWorkPay)}` : `โควต้า ${d.holidayQuota}${calc.excessDays > 0 ? ` • เกิน ${calc.excessDays}` : ''} (ลบ=ทำงานวันหยุด)` })}
                <div className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm text-stone-600">เบิกล่วงหน้า</span>
                  <input type="number" step="0.01" inputMode="decimal" disabled={locked} value={quickAdvance(emp.id)} onChange={(e) => setQuickAdvance(emp.id, e.target.value)} onFocus={(e) => e.target.select()} className="w-28 px-2 py-1.5 text-sm text-right border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
                </div>
                {D({ label: 'ค่าห้องพัก', value: d.roomFee, hint: 'แก้ที่หน้าค่าห้อง' })}
                {F({ label: 'รับจากวีเอสจง', field: 'paidViaCompany' })}
                {D({ label: 'คอมมิชชั่น', value: d.commission, hint: 'แก้ที่หน้าคอมมิชชั่น' })}
                <button onClick={() => setItemsEmp(emp)} disabled={locked} className="w-full mt-2 px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-600 hover:bg-stone-50 flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Plus className="w-3.5 h-3.5" />งานเสริม/เบิก/หักอื่นๆ {itemCount(emp.id) > 0 && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">{itemCount(emp.id)}</span>}
                </button>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-stone-100">
                  <button onClick={() => onOpenDetail(emp)} className="text-xs text-stone-500 underline">ดูละเอียด/ปิดงวด</button>
                  <div className="text-right"><span className="text-xs text-stone-400 mr-2">สุทธิ</span><span className="font-bold text-emerald-700">{fmtMoney(calc.net)} ฿</span></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ===== Desktop: ตาราง grid ===== */
        <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
              <tr>
                <th className="text-left px-3 py-2.5 sticky left-0 bg-stone-50 z-10 min-w-[160px]">ชื่อ</th>
                <th className="text-right px-2 py-2.5">ฐาน</th>
                <th className="text-center px-2 py-2.5" title="ค่าบวก = วันหยุดที่ใช้ (เกินโควต้าถูกหัก) / ค่าลบ = ทำงานวันหยุด เช่น -1 = ทำงานวันหยุด 1 วัน ได้เพิ่ม 1 แรง">หยุด</th>
                <th className="text-center px-2 py-2.5">เบิก</th>
                <th className="text-right px-2 py-2.5">ค่าห้อง</th>
                <th className="text-center px-2 py-2.5">รับจากวีเอสจง</th>
                <th className="text-right px-2 py-2.5">คอม</th>
                <th className="text-center px-2 py-2.5">รายการ</th>
                <th className="text-right px-3 py-2.5 sticky right-0 bg-stone-50 z-10">สุทธิ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {flatRows.map((fr) => {
                if (fr.type === 'group') return (
                  <tr key={`g-${fr.g.id}`} data-drag-id={fr.g.id !== NO_DEPT ? fr.g.id : undefined} className={`bg-stone-100/70 ${rowDragClass(fr.g.id, deptDrag.dragId)}`}>
                    <td colSpan={9} className={`px-3 py-1.5 ${cellDropClass(fr.g.id, deptDrag.dragId, deptDrag.overId)}`}>{groupGrip(fr.g, false)}</td>
                  </tr>
                );
                const { emp, rowIdx } = fr;
                const d = drafts[emp.id]; if (!d) return null;
                const locked = d.status === 'finalized';
                const calc = computePayroll(d, d.items);
                const dirty = touched.has(emp.id);
                const ic = itemCount(emp.id);
                return (
                  <tr key={emp.id} data-drag-id={emp.id} className={`${dirty ? 'bg-amber-50/40' : locked ? 'bg-emerald-50/30' : 'hover:bg-stone-50'} ${rowDragClass(emp.id, empDrag.dragId)}`}>
                    <td className={`px-3 py-2 sticky left-0 z-10 ${dirty ? 'bg-amber-50' : locked ? 'bg-emerald-50/60' : 'bg-white'} ${cellDropClass(emp.id, empDrag.dragId, empDrag.overId)}`}>
                      <div className="flex items-center gap-1.5">
                        {canReorder && (
                          <span {...empDrag.bindHandle(emp.id, true)} title="ลากเพื่อสลับลำดับ (ในแผนกเดียวกัน)" className="text-stone-300 hover:text-stone-500 shrink-0">
                            <GripVertical className="w-4 h-4" />
                          </span>
                        )}
                        <button onClick={() => onOpenDetail(emp)} className="text-left min-w-0">
                          <div className="font-medium text-stone-800 truncate max-w-[150px] hover:text-emerald-700"><span className="font-mono text-xs text-stone-400 mr-1">#{emp.employeeNumber}</span>{dispName(emp)}</div>
                          {locked && <span className="text-[10px] text-emerald-700">ปิดงวดแล้ว</span>}
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-stone-500 whitespace-nowrap">{fmtMoney(d.baseSalary)}</td>
                    <td className="px-2 py-2 text-center">{Cell({ empId: emp.id, field: 'holidayDaysTaken', col: 'holidayDaysTaken', rowIdx, locked, w: 'w-16' })}</td>
                    <td className="px-2 py-2 text-center"><input type="number" step="0.01" inputMode="decimal" data-cell={`advance-${rowIdx}`} disabled={locked} value={quickAdvance(emp.id)} onChange={(e) => setQuickAdvance(emp.id, e.target.value)} onKeyDown={(e) => onKeyNav(e, 'advance', rowIdx)} onFocus={(e) => e.target.select()} className="w-20 px-2 py-1.5 text-sm text-right border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:bg-stone-100 disabled:text-stone-400" /></td>
                    <td className="px-2 py-2 text-right text-stone-500 whitespace-nowrap" title="แก้ที่หน้าค่าห้อง">{Number(d.roomFee) ? fmtMoney(d.roomFee) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-2 py-2 text-center">{Cell({ empId: emp.id, field: 'paidViaCompany', col: 'paidViaCompany', rowIdx, locked })}</td>
                    <td className="px-2 py-2 text-right text-stone-500 whitespace-nowrap" title="แก้ที่หน้าคอมมิชชั่น">{Number(d.commission) ? fmtMoney(d.commission) : <span className="text-stone-300">—</span>}</td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => setItemsEmp(emp)} disabled={locked} className="inline-flex items-center gap-1 px-2 py-1.5 border border-stone-200 rounded hover:bg-stone-50 text-stone-600 disabled:opacity-50">
                        <Plus className="w-3.5 h-3.5" />{ic > 0 ? <span className="px-1 bg-emerald-100 text-emerald-700 rounded text-xs">{ic}</span> : <span className="text-xs">เพิ่ม</span>}
                      </button>
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold text-emerald-700 whitespace-nowrap sticky right-0 z-10 ${dirty ? 'bg-amber-50' : locked ? 'bg-emerald-50/60' : 'bg-white'}`}>{fmtMoney(calc.net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {itemsEmp && drafts[itemsEmp.id] && (
        <PayrollItemsModal
          employee={itemsEmp}
          draft={drafts[itemsEmp.id]}
          pastBonusLabels={pastBonus}
          priceMaps={priceMaps}
          onApply={(items) => { updItems(itemsEmp.id, items); setItemsEmp(null); }}
          onClose={() => setItemsEmp(null)}
        />
      )}
    </div>
  );
}

// ============ POPUP: งานเสริม/เบิก/หักอื่นๆ (สำหรับโหมดกรอกเร็ว) ============
function PayrollItemsModal({ employee, draft, pastBonusLabels, priceMaps = {}, onApply, onClose }) {
  const [bonusTasks, setBonusTasks] = useState(draft.items.filter((i) => i.kind === 'bonus_task').map((i) => ({ label: i.label, amount: i.amount })));
  const [advances, setAdvances] = useState(draft.items.filter((i) => i.kind === 'advance').map((i) => ({ label: i.label, amount: i.amount })));
  const [others, setOthers] = useState(draft.items.filter((i) => i.kind === 'other_deduction').map((i) => ({ label: i.label, amount: i.amount })));
  const addBonus = (label) => setBonusTasks((prev) => prev.some((b) => b.label === label) ? prev : [...prev, { label, amount: (priceMaps.bonus_task && priceMaps.bonus_task[label] != null) ? priceMaps.bonus_task[label] : '' }]);

  const apply = () => {
    onApply([
      ...bonusTasks.map((i) => ({ ...i, kind: 'bonus_task' })),
      ...advances.map((i) => ({ ...i, kind: 'advance' })),
      ...others.map((i) => ({ ...i, kind: 'other_deduction' })),
    ]);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[85vh] sm:max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <div className="font-semibold text-stone-800 text-sm">{dispName(employee)} — งานเสริม/เบิก/หัก</div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 sm:p-5 overflow-auto overscroll-contain space-y-4">
          <div className="bg-emerald-50/50 rounded-xl p-3">
            {pastBonusLabels && pastBonusLabels.length > 0 && (
              <div className="mb-2">
                <div className="text-[11px] text-stone-500 mb-1">เลือกงานที่เคยทำ:</div>
                <div className="flex flex-wrap gap-1.5">
                  {pastBonusLabels.map((lbl) => {
                    const used = bonusTasks.some((b) => b.label === lbl);
                    return (
                      <button key={lbl} type="button" onClick={() => addBonus(lbl)} disabled={used} className={`px-2 py-1 text-xs rounded-full border ${used ? 'bg-emerald-100 border-emerald-300 text-emerald-700 opacity-60' : 'bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
                        {used ? '✓ ' : '+ '}{lbl}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <EditorItemList title="งานเสริม (ล้างห้องน้ำ, ลอกท่อ ฯลฯ)" list={bonusTasks} setList={setBonusTasks} color="text-emerald-700" addLabel="เพิ่มเอง" priceMap={priceMaps.bonus_task} />
          </div>
          <div className="bg-red-50/40 rounded-xl p-3 space-y-3">
            <EditorItemList title="เบิกล่วงหน้า" list={advances} setList={setAdvances} color="text-red-600" addLabel="เพิ่ม" priceMap={priceMaps.advance} />
            <EditorItemList title="หักอื่นๆ" list={others} setList={setOthers} color="text-red-600" addLabel="เพิ่ม" priceMap={priceMaps.other_deduction} />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">ยกเลิก</button>
          <button onClick={apply} className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium">ใช้รายการนี้</button>
        </div>
      </div>
    </div>
  );
}


export {
  PayrollPage,
};
