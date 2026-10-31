import React, { useState, useEffect, useMemo } from 'react';
import { Shield, Download, AlertCircle, CheckCircle2, Settings, Plus, Hospital, ListChecks, FileText } from 'lucide-react';
import { useSso, sso, todayBkk } from '../lib/sso.js';
import { registrationFor, ssoManaged, ssoForPayroll, ssoTodos, isHospitalChangeSeason, remitDeadline, toCsv, maskNationalId } from '../lib/socialSecurity.js';
import { MONTH_NAMES, fmtMoney } from '../lib/payroll.js';
import { dispName } from '../lib/format.js';
import { PageHeader, EmptyState, PageLoading } from '../ui/index.jsx';
import { SSO_STATUS } from '../components/SsoPanel.jsx';

// ============ ประกันสังคม — รายงานรายเดือน + รายการต้องทำ + ตั้งค่า ============
// ใช้ได้: เจ้าของ + คนมีสิทธิ์เงินเดือน (RLS กรองธุรกิจให้) · ตั้งค่าเลขบัญชีนายจ้าง/เรท = เจ้าของเท่านั้น
// รายงานยึดยอดที่ "บันทึกในงวดเงินเดือนจริง" (payrolls.social_security / social_security_employer) — ไม่คำนวณใหม่
// ถ้ายอดในงวดไม่ตรงสูตร จะขึ้นเตือน ให้ไปกด "คำนวณประกันสังคมใหม่" ที่หน้าทำเงินเดือน (เฉพาะงวดที่ยังไม่ปิด)

const thMonth = (y, m) => `${MONTH_NAMES[m - 1]} ${y + 543}`;

function SsoPage({ businesses, employees, activeBusinessId, profile, ops }) {
  const isOwner = profile.isOwner;
  const now = new Date();
  // ค่าเริ่มต้น = งวดเดือนที่แล้ว (เงินเดือนเดือนก่อนเพิ่งจ่าย → ต้องส่งเงินสมทบ)
  const [year, setYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [tab, setTab] = useState('report');
  const ssoData = useSso();
  const business = businesses.find((b) => b.id === activeBusinessId);

  const [payrolls, setPayrolls] = useState(null);
  useEffect(() => {
    let c = false;
    setPayrolls(null);
    if (!activeBusinessId) return undefined;
    (async () => { const r = await sso.payrollsForPeriod(activeBusinessId, year, month); if (!c) setPayrolls(r); })();
    return () => { c = true; };
  }, [activeBusinessId, year, month]);

  const [docs, setDocs] = useState([]);
  const regIdsKey = ssoData.regs.map((r) => r.id).sort().join(',');
  useEffect(() => {
    let c = false;
    (async () => { const d = await sso.listDocuments(regIdsKey ? regIdsKey.split(',') : []); if (!c) setDocs(d); })();
    return () => { c = true; };
  }, [regIdsKey]);

  const today = todayBkk();
  const empBy = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const bizName = (id) => businesses.find((b) => b.id === id)?.name || '—';

  // ---- รายงานงวด ----
  const rows = useMemo(() => {
    if (!payrolls || !activeBusinessId) return [];
    const pBy = Object.fromEntries(payrolls.map((p) => [p.employeeId, p]));
    const ids = new Set([
      ...ssoData.regs.filter((r) => r.businessId === activeBusinessId && registrationFor([r], r.employeeId, activeBusinessId, year, month)).map((r) => r.employeeId),
      ...payrolls.filter((p) => Number(p.socialSecurity) > 0 || Number(p.socialSecurityEmployer) > 0).map((p) => p.employeeId),
    ]);
    return [...ids].map((id) => {
      const e = empBy[id] || { id };
      const p = pBy[id] || null;
      const reg = registrationFor(ssoData.regs, id, activeBusinessId, year, month);
      const expect = p ? ssoForPayroll({ rates: ssoData.rates, regs: ssoData.regs, business, employeeId: id, businessId: activeBusinessId, year, month, payroll: p }) : null;
      const emp = p ? Number(p.socialSecurity) || 0 : 0;
      const er = p ? Number(p.socialSecurityEmployer) || 0 : 0;
      const flags = [];
      if (!reg) flags.push('มียอดหักแต่ไม่มีทะเบียน');
      if (!p) flags.push('ยังไม่มีงวดเงินเดือน');
      if (ssoManaged(year, month) && p && expect && (emp !== expect.employee || er !== expect.employer)) flags.push(`ไม่ตรงสูตร (ควรเป็น ${fmtMoney(expect.employee)}/${fmtMoney(expect.employer)})`);
      return { e, p, reg, wageBase: p?.socialSecurityWageBase ?? expect?.wageBase ?? null, emp, er, flags };
    }).sort((a, b) => String(a.e.employeeNumber || '').localeCompare(String(b.e.employeeNumber || '')));
  }, [payrolls, ssoData.regs, ssoData.rates, empBy, activeBusinessId, business, year, month]);

  const totals = rows.reduce((t, r) => ({ wage: t.wage + (Number(r.wageBase) || 0), emp: t.emp + r.emp, er: t.er + r.er }), { wage: 0, emp: 0, er: 0 });
  const dl = remitDeadline(year, month);
  const draftCount = rows.filter((r) => r.p && r.p.status !== 'finalized').length;

  const exportCsv = () => {
    const head = ['ลำดับ', 'เลขพนักงาน', 'ชื่อ', 'เลขบัตรประชาชน', 'ค่าจ้างที่ใช้คำนวณ', 'เงินสมทบลูกจ้าง', 'เงินสมทบนายจ้าง', 'รวม', 'สถานะงวด', 'หมายเหตุ'];
    const body = rows.map((r, i) => [
      i + 1, r.e.employeeNumber || '', dispName(r.e) || '', isOwner ? (r.e.nationalId || '') : maskNationalId(r.e.nationalId),
      r.wageBase ?? '', r.emp, r.er, r.emp + r.er, r.p ? (r.p.status === 'finalized' ? 'ปิดงวดแล้ว' : 'ร่าง') : '—', r.flags.join(' / '),
    ]);
    const foot = ['', '', 'รวม', '', totals.wage, totals.emp, totals.er, totals.emp + totals.er, '', ''];
    const meta = [[`ประกันสังคม ${business?.name || ''} งวด ${thMonth(year, month)}`], [`เลขที่บัญชีนายจ้าง: ${business?.ssoEmployerNo || '(ยังไม่ใส่)'}`], [`กำหนดส่ง: ${dl.day} ${thMonth(dl.year, dl.month)}`], []];
    const blob = new Blob([toCsv([...meta, head, ...body, foot])], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sso-${year + 543}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ---- รายการต้องทำ ----
  const todos = useMemo(() => ssoTodos({ regs: ssoData.regs, employees, docs, today }), [ssoData.regs, employees, docs, today]);

  if (ssoData.loading) return <PageLoading />;

  const yearOptions = [now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const TABS = [['report', 'รายงานรายเดือน', FileText], ['todo', `ต้องทำ${todos.length ? ` (${todos.length})` : ''}`, ListChecks], ...(isOwner ? [['settings', 'ตั้งค่า', Settings]] : [])];

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ประกันสังคม" subtitle={business ? business.name : 'ทุกธุรกิจ'} />
      <div className="p-4 md:p-8 space-y-4 max-w-6xl">
        {!ssoData.ok && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">โหลดข้อมูลประกันสังคมไม่สำเร็จ — ลองรีเฟรช</div>}
        {isHospitalChangeSeason(today) && (
          <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-sm text-sky-800 flex items-start gap-2"><Hospital className="w-4 h-4 mt-0.5 flex-shrink-0" />ช่วงนี้ (ม.ค.–มี.ค.) ผู้ประกันตนเปลี่ยนโรงพยาบาลได้ปีละครั้ง — ถ้าพนักงานเปลี่ยน ให้บันทึกที่หน้ารายละเอียดพนักงาน</div>
        )}
        <div className="flex gap-1 border-b border-stone-200">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 text-sm -mb-px border-b-2 ${tab === id ? 'border-emerald-700 text-emerald-900 font-medium' : 'border-transparent text-stone-500 hover:text-stone-700'}`}><Icon className="w-4 h-4" />{label}</button>
          ))}
        </div>

        {tab === 'report' && (!activeBusinessId ? (
          <EmptyState icon={Shield} title="เลือกธุรกิจที่ sidebar" description="บัญชีนายจ้างแยกตามธุรกิจ — รายงานจึงดูทีละธุรกิจ" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white">
                {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white">
                {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
              </select>
              <div className="flex-1" />
              <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 text-white rounded-lg text-sm"><Download className="w-4 h-4" />ส่งออก CSV (ให้สำนักงานบัญชี)</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200"><div className="text-xs text-stone-500">เลขที่บัญชีนายจ้าง</div><div className={business?.ssoEmployerNo ? 'font-mono text-stone-800' : 'text-amber-700'}>{business?.ssoEmployerNo || 'ยังไม่ใส่'}</div></div>
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200"><div className="text-xs text-stone-500">ลูกจ้าง / นายจ้าง</div><div className="font-semibold text-stone-800">{fmtMoney(totals.emp)} / {fmtMoney(totals.er)}</div></div>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200"><div className="text-xs text-stone-500">รวมต้องส่ง</div><div className="font-semibold text-emerald-900">{fmtMoney(totals.emp + totals.er)} ฿</div></div>
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200"><div className="text-xs text-stone-500">กำหนดส่ง (สปส.1-10)</div><div className="font-semibold text-stone-800">ภายใน {dl.day} {thMonth(dl.year, dl.month)}</div></div>
            </div>
            {draftCount > 0 && <div className="text-xs text-amber-700 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />มี {draftCount} คนที่งวดยังไม่ปิด — ยอดอาจเปลี่ยน</div>}
            {payrolls === null ? <div className="text-sm text-stone-400">กำลังโหลด...</div> : rows.length === 0 ? (
              <div className="text-sm text-stone-400 italic p-4">งวดนี้ไม่มีผู้ประกันตนที่ธุรกิจนี้</div>
            ) : (
              <div className="rounded-lg border border-stone-200 overflow-x-auto bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-stone-500 text-xs">
                    <tr><th className="text-left px-3 py-2 font-medium">พนักงาน</th><th className="text-left px-2 py-2 font-medium">เลขบัตร</th><th className="text-right px-2 py-2 font-medium">ฐานค่าจ้าง</th><th className="text-right px-2 py-2 font-medium">ลูกจ้าง</th><th className="text-right px-2 py-2 font-medium">นายจ้าง</th><th className="text-right px-3 py-2 font-medium">รวม</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {rows.map((r) => (
                      <tr key={r.e.id} className={r.flags.length ? 'bg-amber-50/50' : ''}>
                        <td className="px-3 py-2">
                          <div className="text-stone-800">{r.e.employeeNumber ? `#${r.e.employeeNumber} ` : ''}{dispName(r.e) || '—'}</div>
                          <div className="text-[11px] text-stone-400">{r.reg ? SSO_STATUS[r.reg.status]?.label : 'ไม่มีทะเบียน'}{r.p ? ` · ${r.p.status === 'finalized' ? 'ปิดงวดแล้ว' : 'ร่าง'}` : ''}</div>
                          {r.flags.map((f) => <div key={f} className="text-[11px] text-amber-700">⚠ {f}</div>)}
                        </td>
                        <td className="px-2 py-2 font-mono text-xs text-stone-500">{maskNationalId(r.e.nationalId) || '—'}</td>
                        <td className="px-2 py-2 text-right text-stone-600">{r.wageBase != null ? fmtMoney(r.wageBase) : '—'}</td>
                        <td className="px-2 py-2 text-right">{fmtMoney(r.emp)}</td>
                        <td className="px-2 py-2 text-right">{fmtMoney(r.er)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmtMoney(r.emp + r.er)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-stone-50 font-medium text-stone-800">
                    <tr><td className="px-3 py-2" colSpan={2}>รวม {rows.length} คน</td><td className="px-2 py-2 text-right">{fmtMoney(totals.wage)}</td><td className="px-2 py-2 text-right">{fmtMoney(totals.emp)}</td><td className="px-2 py-2 text-right">{fmtMoney(totals.er)}</td><td className="px-3 py-2 text-right">{fmtMoney(totals.emp + totals.er)}</td></tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="text-xs text-stone-500">ยอดมาจากงวดเงินเดือนที่บันทึกจริง · {ssoManaged(year, month) ? 'ถ้าขึ้น "ไม่ตรงสูตร" ให้ไปกด "คำนวณประกันสังคมใหม่" ที่หน้าทำเงินเดือน (งวดที่ปิดแล้วแก้ไม่ได้)' : 'งวดก่อน ต.ค. 2569 ไม่แก้ย้อนหลัง — ส่วนนายจ้างอาจเป็น 0 เพราะระบบเดิมไม่ได้บันทึก'}</p>
          </div>
        ))}

        {tab === 'todo' && (
          todos.length === 0 ? (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />ไม่มีงานค้าง</div>
          ) : (
            <div className="space-y-2">
              {todos.map((t) => (
                <div key={`${t.regId}:${t.kind}`} className="p-3 rounded-lg border border-amber-200 bg-amber-50/60 text-sm">
                  <div className="font-medium text-stone-800">{empBy[t.employeeId]?.employeeNumber ? `#${empBy[t.employeeId].employeeNumber} ` : ''}{dispName(empBy[t.employeeId] || {})} <span className="text-xs font-normal text-stone-500">· {bizName(t.businessId)}</span></div>
                  <div className="text-amber-800 text-xs mt-0.5">{t.text}</div>
                </div>
              ))}
              <p className="text-xs text-stone-500">แก้ได้ที่หน้า "พนักงาน" → กดชื่อ → กล่องประกันสังคม</p>
            </div>
          )
        )}

        {tab === 'settings' && isOwner && <SsoSettings businesses={businesses} rates={ssoData.rates} reload={ssoData.reload} ops={ops} />}
      </div>
    </div>
  );
}

function SsoSettings({ businesses, rates, reload, ops }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-medium text-stone-700 mb-2">บัญชีนายจ้าง (แยกตามธุรกิจ)</h3>
        <div className="space-y-2">
          {businesses.map((b) => <BizSsoRow key={b.id} b={b} ops={ops} />)}
        </div>
        <p className="text-xs text-stone-500 mt-2">"นับค่าคอมเป็นค่าจ้าง" ตอนนี้ปิดไว้ทุกธุรกิจ — ถ้าเปิด จะมีผลกับงวดเงินเดือนที่ทำ/คำนวณใหม่หลังจากนั้น</p>
      </section>
      <RatesSection rates={rates} reload={reload} />
    </div>
  );
}

function BizSsoRow({ b, ops }) {
  const [no, setNo] = useState(b.ssoEmployerNo || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNo(b.ssoEmployerNo || ''); }, [b.ssoEmployerNo]);
  const saveNo = async () => {
    const v = no.trim() || null;
    if (v === (b.ssoEmployerNo || null)) return;
    setBusy(true); await ops.business.update(b.id, { ssoEmployerNo: v }); setBusy(false);
  };
  const toggleComm = async () => {
    const want = !b.ssoIncludeCommission;
    if (!confirm(want ? `เปิด "นับค่าคอมเป็นค่าจ้าง" ที่ ${b.name}?\n\nเงินสมทบของคนที่มีค่าคอมจะสูงขึ้น (ไม่เกินเพดาน) ในงวดที่ยังไม่ปิด หน้าทำเงินเดือนจะเตือนให้คำนวณใหม่` : `ปิด "นับค่าคอมเป็นค่าจ้าง" ที่ ${b.name}?`)) return;
    setBusy(true); await ops.business.update(b.id, { ssoIncludeCommission: want }); setBusy(false);
  };
  return (
    <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg border border-stone-200 bg-white">
      <div className="w-40 text-sm font-medium text-stone-800 truncate">{b.name}</div>
      <input value={no} onChange={(e) => setNo(e.target.value)} onBlur={saveNo} placeholder="เลขที่บัญชีนายจ้าง 10 หลัก" className="flex-1 min-w-[180px] px-3 py-1.5 border border-stone-300 rounded-lg text-sm font-mono" disabled={busy} />
      <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer">
        <input type="checkbox" checked={!!b.ssoIncludeCommission} onChange={toggleComm} disabled={busy} className="w-4 h-4 rounded" /> นับค่าคอมเป็นค่าจ้าง
      </label>
    </div>
  );
}

function RatesSection({ rates, reload }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ effectiveFrom: '', wageMax: '', wageMin: '1650', rateEmployee: '5', rateEmployer: '5', note: '' });
  const add = async () => {
    if (!f.effectiveFrom || !(Number(f.wageMax) > 0)) { alert('ใส่วันที่มีผล + เพดานค่าจ้าง'); return; }
    if (!confirm(`เพิ่มเรทใหม่ มีผล ${new Date(`${f.effectiveFrom}T00:00:00`).toLocaleDateString('th-TH', { dateStyle: 'long' })}\nเพดาน ${fmtMoney(f.wageMax)} · ลูกจ้าง ${f.rateEmployee}% · นายจ้าง ${f.rateEmployer}%`)) return;
    const r = await sso.addRate({ effectiveFrom: f.effectiveFrom, wageMax: Number(f.wageMax), wageMin: Number(f.wageMin) || 0, rateEmployee: Number(f.rateEmployee), rateEmployer: Number(f.rateEmployer), note: f.note.trim() || null });
    if (r) { setShow(false); reload(); }
  };
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-medium text-stone-700">เรทเงินสมทบ</h3>
        <div className="flex-1" />
        <button onClick={() => setShow((v) => !v)} className="flex items-center gap-1 text-xs text-emerald-700 hover:underline"><Plus className="w-3.5 h-3.5" />เพิ่มเรท (เมื่อกฎหมายเปลี่ยน)</button>
      </div>
      <div className="rounded-lg border border-stone-200 overflow-x-auto bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="text-left px-3 py-2 font-medium">มีผลตั้งแต่</th><th className="text-right px-2 py-2 font-medium">ขั้นต่ำ</th><th className="text-right px-2 py-2 font-medium">เพดาน</th><th className="text-right px-2 py-2 font-medium">ลูกจ้าง</th><th className="text-right px-2 py-2 font-medium">นายจ้าง</th><th className="text-right px-3 py-2 font-medium">สูงสุด/เดือน</th></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {[...rates].reverse().map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{new Date(`${String(r.effectiveFrom).slice(0, 10)}T00:00:00`).toLocaleDateString('th-TH', { dateStyle: 'medium' })}{r.note && <div className="text-[11px] text-stone-400">{r.note}</div>}</td>
                <td className="px-2 py-2 text-right">{fmtMoney(r.wageMin)}</td>
                <td className="px-2 py-2 text-right">{fmtMoney(r.wageMax)}</td>
                <td className="px-2 py-2 text-right">{Number(r.rateEmployee)}%</td>
                <td className="px-2 py-2 text-right">{Number(r.rateEmployer)}%</td>
                <td className="px-3 py-2 text-right">{fmtMoney(Math.round(Number(r.wageMax) * Number(r.rateEmployee) / 100))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {show && (
        <div className="mt-2 p-3 rounded-lg bg-stone-50 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
          <label className="col-span-2"><span className="text-stone-500">มีผลตั้งแต่</span><input type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" /></label>
          <label><span className="text-stone-500">ขั้นต่ำ</span><input type="number" value={f.wageMin} onChange={(e) => setF({ ...f, wageMin: e.target.value })} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" /></label>
          <label><span className="text-stone-500">เพดาน</span><input type="number" value={f.wageMax} onChange={(e) => setF({ ...f, wageMax: e.target.value })} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" /></label>
          <label><span className="text-stone-500">ลูกจ้าง %</span><input type="number" step="0.01" value={f.rateEmployee} onChange={(e) => setF({ ...f, rateEmployee: e.target.value })} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" /></label>
          <label><span className="text-stone-500">นายจ้าง %</span><input type="number" step="0.01" value={f.rateEmployer} onChange={(e) => setF({ ...f, rateEmployer: e.target.value })} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" /></label>
          <label className="col-span-2 md:col-span-5"><span className="text-stone-500">หมายเหตุ</span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="เช่น กฎกระทรวง ..." className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" /></label>
          <div className="flex items-end justify-end gap-2"><button onClick={() => setShow(false)} className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded-lg">ยกเลิก</button><button onClick={add} className="px-3 py-1.5 bg-emerald-900 text-white rounded-lg">เพิ่ม</button></div>
        </div>
      )}
    </section>
  );
}

export { SsoPage };
