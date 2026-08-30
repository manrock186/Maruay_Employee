import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Users, Building2, MapPin, LogOut, Plus, Edit2, Trash2, Search, X, Upload, UserCircle, Shield, Camera, Calendar, Phone, Mail, AlertCircle, CheckCircle2, Award, Clock, Globe, CreditCard, BookOpen, FileText, ExternalLink, Paperclip, Wallet, TrendingUp, TrendingDown, Hash } from 'lucide-react';
import { hasSalarySplit, businessPositionId, businessBaseSalary } from '../lib/business.js';
import { dispName, NATIONALITIES, natLabel, natFlag, isForeign, RESIGN_REASONS, resignLabel, isActive, SALARY_REASONS, salaryReasonLabel } from '../lib/format.js';
import { MONTH_NAMES, fmtMoney, fmt } from '../lib/payroll.js';
import { uploadDocument, deleteDocument, getDocumentUrl, resizeImage } from '../lib/storage.js';
import { Modal, FormField, FormActions, EmptyState, PageHeader, Avatar, PillRadio, InfoItem, DetailBlock } from '../ui/index.jsx';

// ============ EMPLOYEES PAGE ============
function EmployeesPage({ businesses, zones, positions, employees, profile, activeBusinessId, activeZoneId, setActiveZoneId, ops }) {
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // active | resigned | all
  const [resigningEmp, setResigningEmp] = useState(null);
  const [raisingEmp, setRaisingEmp] = useState(null);
  const [salaryReload, setSalaryReload] = useState(0);
  const isOwner = profile.isOwner;
  const isBM = profile.isBM;
  const isZM = profile.isZM;
  const isViewer = profile.isViewer;
  const canWrite = profile.canWrite;
  const canResign = isOwner || isBM; // owner + หัวหน้าธุรกิจ

  const visibleEmployees = useMemo(() => {
    let list;
    if (isOwner) {
      list = activeBusinessId
        ? employees.filter((e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))
        : employees;
    } else if (isBM) {
      const ids = profile.businessIds || [];
      list = employees.filter((e) => ids.includes(e.businessId) || (e.additionalBusinessIds || []).some((id) => ids.includes(id)));
      if (activeBusinessId) list = list.filter((e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId));
    } else if (isZM) {
      const zoneIds = profile.zoneIds || [];
      list = employees.filter((e) => zoneIds.includes(e.zoneId));
    } else if (isViewer) {
      const noScope = profile.businessIds.length === 0 && profile.zoneIds.length === 0;
      if (noScope) {
        list = activeBusinessId ? employees.filter((e) => e.businessId === activeBusinessId) : employees;
      } else {
        list = employees.filter((e) => profile.businessIds.includes(e.businessId) || profile.zoneIds.includes(e.zoneId));
        if (activeBusinessId) list = list.filter((e) => e.businessId === activeBusinessId);
      }
    } else {
      list = [];
    }
    // กรองตามสถานะ ทำงานอยู่/ลาออกแล้ว
    if (statusFilter === 'active') list = list.filter((e) => isActive(e));
    else if (statusFilter === 'resigned') list = list.filter((e) => !isActive(e));
    if (activeZoneId === '__nozone__') list = list.filter((e) => !e.zoneId);
    else if (activeZoneId) list = list.filter((e) => e.zoneId === activeZoneId);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((e) => e.name?.toLowerCase().includes(s) || e.nickname?.toLowerCase().includes(s) || e.employeeNumber?.toLowerCase().includes(s) || e.phone?.includes(s) || e.email?.toLowerCase().includes(s));
    }
    return list;
  }, [employees, profile, activeBusinessId, activeZoneId, search, statusFilter, isOwner, isBM, isZM, isViewer]);

  // โซนที่ user เลือกได้
  const visibleZones = useMemo(() => {
    if (isOwner) return activeBusinessId ? zones.filter((z) => z.businessId === activeBusinessId) : zones;
    if (isBM) return zones.filter((z) => (profile.businessIds || []).includes(z.businessId) && (!activeBusinessId || z.businessId === activeBusinessId));
    if (isZM) return zones.filter((z) => (profile.zoneIds || []).includes(z.id));
    if (isViewer) {
      const noScope = profile.businessIds.length === 0 && profile.zoneIds.length === 0;
      if (noScope) return activeBusinessId ? zones.filter((z) => z.businessId === activeBusinessId) : zones;
      return zones.filter((z) => profile.businessIds.includes(z.businessId) || profile.zoneIds.includes(z.id));
    }
    return [];
  }, [zones, profile, activeBusinessId, isOwner, isBM, isZM, isViewer]);

  const filteredZoneName = activeZoneId === '__nozone__' ? 'ไม่จำกัดโซน' : (activeZoneId ? zones.find((z) => z.id === activeZoneId)?.name : null);

  // ธุรกิจปัจจุบันสำหรับการเพิ่มพนักงาน (ใช้ activeBusinessId; ถ้าไม่มีให้ default ตาม role)
  const targetBusinessId = activeBusinessId
    || (isBM && profile.businessIds[0])
    || (isZM && zones.find((z) => (profile.zoneIds || []).includes(z.id))?.businessId)
    || null;

  const save = async (d) => {
    const payload = { ...d, businessId: targetBusinessId };
    // เลขพนักงานไม่ซ้ำทั้งระบบ (global unique)
    const parseNum = (v) => { const n = parseInt(String(v ?? '').trim(), 10); return Number.isFinite(n) ? n : 0; };
    if (!payload.employeeNumber) {
      // เว้นว่าง → สร้างเลขถัดไปแบบไม่ซ้ำทั้งระบบ เติม 0 เป็น 3 หลัก
      const maxNum = employees.reduce((m, e) => Math.max(m, parseNum(e.employeeNumber)), 0);
      payload.employeeNumber = String(maxNum + 1).padStart(3, '0');
    } else {
      // กรอกเอง → เลขล้วนปรับเป็น 3 หลัก แล้วกันซ้ำกับคนอื่นทั้งระบบ
      let num = String(payload.employeeNumber).trim();
      if (/^\d+$/.test(num)) num = num.padStart(3, '0');
      payload.employeeNumber = num;
      const dup = employees.find((e) => e.id !== editing?.id && String(e.employeeNumber || '').trim() === num);
      if (dup) { alert(`เลขพนักงาน #${num} ซ้ำกับ ${dispName(dup)} แล้ว กรุณาใช้เลขอื่น (เว้นว่างไว้เพื่อให้ระบบรันเลขให้อัตโนมัติ)`); return; }
    }
    if (editing?.id) await ops.employee.update(editing.id, payload);
    else await ops.employee.add(payload);
    setShowModal(false); setEditing(null);
  };
  const del = async (id) => {
    if (!confirm('ลบพนักงานคนนี้?')) return;
    const emp = employees.find((e) => e.id === id);
    const toDelete = [...(emp?.workPermitDocs || []), ...(emp?.passportDocs || []), ...(emp?.applicationDocs || [])];
    for (const path of toDelete) await deleteDocument(path);
    await ops.employee.delete(id);
  };
  const doResign = async (d) => {
    await ops.employee.resign(resigningEmp.id, d);
    setResigningEmp(null); setViewing(null);
  };
  const doRehire = async (emp) => {
    if (!confirm(`จ้าง ${dispName(emp)} กลับเข้าทำงาน?`)) return;
    await ops.employee.rehire(emp.id);
    setViewing(null);
  };

  const allMode = (isOwner || isBM) && !activeBusinessId && (isOwner || (profile.businessIds || []).length > 1);

  if (isOwner && businesses.length === 0) return (
    <div className="h-full overflow-auto"><PageHeader title="พนักงาน" /><div className="p-4 md:p-8"><EmptyState icon={Users} title="ยังไม่มีธุรกิจ" description="สร้างธุรกิจก่อนที่หน้า 'ธุรกิจและโซน'" /></div></div>
  );

  return (
    <div className="h-full overflow-auto">
      <PageHeader title={filteredZoneName ? `พนักงาน — ${filteredZoneName}` : (allMode ? 'พนักงานทุกคน — ภาพรวมทุกธุรกิจ' : 'พนักงาน')} subtitle={`${visibleEmployees.length} คน${filteredZoneName ? ' ในโซนนี้' : (allMode ? ' รวมทุกธุรกิจ' : '')}`}>
        {canWrite && !allMode && targetBusinessId && (
          <button onClick={() => { setEditing({}); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" /> เพิ่มพนักงาน</button>
        )}
      </PageHeader>
      <div className="p-4 md:p-8">
        {allMode && (
          <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-900">
            <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>กำลังดูพนักงานจาก<strong> ทุกธุรกิจ ({businesses.length} ที่)</strong> รวมกัน — เลือกธุรกิจที่ sidebar เพื่อกรองเฉพาะธุรกิจเดียว หรือเพิ่มพนักงานใหม่</div>
          </div>
        )}
        {(isOwner || isBM) && activeZoneId && (
          <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 border border-amber-200 rounded-full text-sm text-amber-800">
            <MapPin className="w-3.5 h-3.5" /><span>กรองตามโซน: <strong>{filteredZoneName}</strong></span>
            <button onClick={() => setActiveZoneId(null)} className="ml-1 p-0.5 hover:bg-amber-200 rounded-full"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ, เลขพนักงาน, เบอร์โทร, อีเมล..." className="w-full pl-10 pr-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white" />
          </div>
          <div className="inline-flex rounded-lg border border-stone-300 overflow-hidden">
            {[['active', 'ทำงานอยู่'], ['resigned', 'ลาออกแล้ว'], ['all', 'ทั้งหมด']].map(([v, label]) => (
              <button key={v} onClick={() => setStatusFilter(v)} className={`px-3 py-2 text-sm font-medium ${statusFilter === v ? 'bg-emerald-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>{label}</button>
            ))}
          </div>
          {(isOwner || isBM) && activeBusinessId && (
            <select value={activeZoneId || 'all'} onChange={(e) => setActiveZoneId(e.target.value === 'all' ? null : e.target.value)} className="px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
              <option value="all">ทุกโซน</option>
              {visibleZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              <option value="__nozone__">— ไม่จำกัดโซน —</option>
            </select>
          )}
        </div>
        {visibleEmployees.length === 0 ? (
          <EmptyState icon={Users} title="ยังไม่มีพนักงาน" description="กดปุ่ม 'เพิ่มพนักงาน' เพื่อเริ่มต้น" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleEmployees.map((emp) => {
              const zone = zones.find((z) => z.id === emp.zoneId);
              const pos = positions.find((p) => p.id === (activeBusinessId ? businessPositionId(emp, activeBusinessId) : emp.positionId));
              const empBiz = businesses.find((b) => b.id === emp.businessId);
              const display = dispName(emp);
              const initials = display.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
              const hasNick = emp.nickname?.trim() && emp.nickname.trim() !== emp.name?.trim();
              const extraBizCount = (emp.additionalBusinessIds || []).length;
              const resigned = !isActive(emp);
              return (
                <div key={emp.id} onClick={() => setViewing(emp)} className={`bg-white rounded-xl border ${resigned ? 'border-stone-200 opacity-70' : 'border-stone-200'} hover:shadow-lg hover:-translate-y-0.5 hover:border-emerald-300 transition-all group overflow-hidden cursor-pointer`}>
                  <div className="relative aspect-square bg-gradient-to-br from-stone-100 to-stone-200 overflow-hidden">
                    {emp.photo ? <img src={emp.photo} alt={display} className={`w-full h-full object-contain ${resigned ? 'grayscale' : ''}`} /> : (
                      <div className="w-full h-full flex items-center justify-center"><div className={`w-24 h-24 rounded-full text-white text-3xl font-semibold flex items-center justify-center ${resigned ? 'bg-stone-400' : 'bg-gradient-to-br from-emerald-700 to-emerald-900'}`}>{initials}</div></div>
                    )}
                    {resigned && (
                      <div className="absolute top-2 left-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-stone-700/90 backdrop-blur text-white text-xs font-medium rounded-md shadow-sm">ลาออกแล้ว</span>
                      </div>
                    )}
                    {canWrite && !resigned && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); setEditing(emp); setShowModal(true); }} className="p-2 bg-white/95 hover:bg-white rounded-lg text-stone-700 shadow-sm"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); del(emp.id); }} className="p-2 bg-white/95 hover:bg-white rounded-lg text-red-600 shadow-sm"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                    {(zone || pos?.crossZone) && (
                      <div className="absolute bottom-2 left-2">
                        {zone ? <span className="inline-flex items-center gap-1 px-2 py-1 bg-white/95 backdrop-blur text-stone-700 text-xs font-medium rounded-md shadow-sm"><MapPin className="w-3 h-3" />{zone.name}</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100/95 backdrop-blur text-amber-800 text-xs font-medium rounded-md shadow-sm"><MapPin className="w-3 h-3" />ไม่จำกัดโซน</span>}
                      </div>
                    )}
                    {isForeign(emp.nationality) && (
                      <div className="absolute top-2 left-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-900/90 text-white text-[10px] font-medium rounded-md backdrop-blur"><span className="text-xs leading-none">{natFlag(emp.nationality)}</span>{natLabel(emp.nationality)}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="text-xs font-mono text-stone-400 mb-0.5">#{emp.employeeNumber || '—'}</div>
                    <h3 className="font-semibold text-stone-800 truncate">{display}</h3>
                    {hasNick && <div className="text-xs text-stone-400 truncate">{emp.name}</div>}
                    <div className="text-sm text-stone-500 truncate">{pos?.name || 'ยังไม่กำหนดตำแหน่ง'}</div>
                    {allMode && empBiz && (
                      <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded">
                        <Building2 className="w-2.5 h-2.5" />{empBiz.name}
                      </div>
                    )}
                    {extraBizCount > 0 && (
                      <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-50 text-sky-700 text-[10px] font-medium rounded">
                        <Building2 className="w-2.5 h-2.5" />ดูแลอีก {extraBizCount} ธุรกิจ
                      </div>
                    )}
                    {emp.phone && <div className="mt-2 text-xs text-stone-500 flex items-center gap-1.5"><Phone className="w-3 h-3" /><span className="truncate">{emp.phone}</span></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showModal && (
        <Modal title={editing?.id ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'} onClose={() => { setShowModal(false); setEditing(null); }} wide>
          <EmployeeForm initial={editing} zones={visibleZones} positions={positions.filter((p) => p.businessId === targetBusinessId)} allPositions={positions} employees={employees.filter((e) => e.businessId === targetBusinessId && e.id !== editing?.id)} businesses={businesses} onSave={save} onCancel={() => { setShowModal(false); setEditing(null); }} lockedZoneId={isZM && (profile.zoneIds || []).length === 1 ? profile.zoneIds[0] : null} allowedZoneIds={isZM ? (profile.zoneIds || []) : null} businessId={targetBusinessId} isOwner={isOwner || isBM} canEditPay={profile.canManagePayroll} />
        </Modal>
      )}
      {viewing && (() => {
        const v = employees.find((e) => e.id === viewing.id) || viewing;
        return (
        <EmployeeDetailModal employee={v} salaryReload={salaryReload} zones={zones} positions={positions} employees={employees} businesses={businesses} canWrite={canWrite} canResign={canResign} canRaise={profile.canManagePayroll} isOwner={profile.isOwner} ops={ops} onClose={() => setViewing(null)} onEdit={() => { setEditing(v); setShowModal(true); setViewing(null); }} onDelete={() => { del(v.id); setViewing(null); }} onResign={() => setResigningEmp(v)} onRehire={() => doRehire(v)} onRaise={() => setRaisingEmp(v)} />
        );
      })()}
      {resigningEmp && (
        <ResignModal employee={resigningEmp} onClose={() => setResigningEmp(null)} onConfirm={doResign} />
      )}
      {raisingEmp && (
        <SalaryRaiseModal employee={raisingEmp} ops={ops} onClose={() => setRaisingEmp(null)} onSaved={() => { setRaisingEmp(null); setSalaryReload((n) => n + 1); }} />
      )}
    </div>
  );
}

// ============ MODAL: บันทึกการลาออก ============
function ResignModal({ employee, onClose, onConfirm }) {
  const [resignedDate, setResignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [resignReason, setResignReason] = useState('voluntary');
  const [resignNote, setResignNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!resignedDate) return alert('กรุณาระบุวันที่ลาออก');
    setSaving(true);
    try { await onConfirm({ resignedDate, resignReason, resignNote: resignNote.trim() || null }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[92vh] sm:max-h-[90vh]">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <h2 className="font-semibold text-stone-800">บันทึกการลาออก</h2>
          <button onClick={onClose} className="p-2 -mr-1 hover:bg-stone-100 rounded-lg text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 sm:p-6 space-y-4 overflow-auto overscroll-contain">
          <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
            <Avatar photo={employee.photo} name={dispName(employee)} size={40} />
            <div>
              <div className="font-medium text-stone-800"><span className="font-mono text-xs text-stone-400 mr-1">#{employee.employeeNumber}</span>{dispName(employee)}</div>
              <div className="text-xs text-stone-500">กำลังบันทึกว่าพนักงานคนนี้ลาออก</div>
            </div>
          </div>
          <FormField label="วันที่ลาออก" required>
            <input type="date" value={resignedDate} onChange={(e) => setResignedDate(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" />
          </FormField>
          <FormField label="เหตุผล" required>
            <div className="grid grid-cols-2 gap-2">
              {RESIGN_REASONS.map((r) => (
                <button key={r.value} type="button" onClick={() => setResignReason(r.value)} className={`px-3 py-2 rounded-lg border-2 text-sm transition-all ${resignReason === r.value ? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-900' : 'border-stone-200 text-stone-700 hover:border-stone-300'}`}>{r.label}</button>
              ))}
            </div>
          </FormField>
          <FormField label="หมายเหตุ">
            <textarea value={resignNote} onChange={(e) => setResignNote(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" />
          </FormField>
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>ข้อมูลพนักงานและประวัติเงินเดือนจะยังถูกเก็บไว้ — สามารถจ้างกลับได้ภายหลัง</div>
          </div>
        </div>
        <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-stone-700 hover:bg-stone-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"><LogOut className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'ยืนยันการลาออก'}</button>
        </div>
      </div>
    </div>
  );
}

// ============ MODAL: ปรับเงินเดือน ============
function SalaryRaiseModal({ employee, ops, onClose, onSaved }) {
  const current = Number(employee.baseSalary) || 0;
  const [newSalary, setNewSalary] = useState('');
  // สร้างรายการเดือน: เดือนปัจจุบัน + อีก 12 เดือนข้างหน้า
  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = d.getFullYear(), m = d.getMonth() + 1;
      opts.push({
        value: `${y}-${String(m).padStart(2, '0')}`,   // เช่น 2026-05
        date: `${y}-${String(m).padStart(2, '0')}-01`,   // วันที่ 1 ของเดือน
        label: `${MONTH_NAMES[m - 1]} ${y + 543}`,
        isCurrent: i === 0,
      });
    }
    return opts;
  }, []);
  const [effectiveMonth, setEffectiveMonth] = useState(monthOptions[0].value);
  const [reason, setReason] = useState('annual');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const newVal = Number(newSalary) || 0;
  const diff = newVal - current;
  const pct = current > 0 ? (diff / current) * 100 : 0;
  const selectedOpt = monthOptions.find((o) => o.value === effectiveMonth) || monthOptions[0];
  const isFuture = !selectedOpt.isCurrent;

  const submit = async () => {
    if (!newVal || newVal <= 0) return alert('กรุณากรอกเงินเดือนใหม่');
    if (newVal === current) return alert('เงินเดือนใหม่เท่ากับเดิม');
    setSaving(true);
    try {
      const effectiveDate = selectedOpt.date;     // วันที่ 1 ของเดือนที่เลือก
      const applyNow = !isFuture;                  // เดือนปัจจุบัน = มีผลทันที
      await ops.salaryChange.add({
        employeeId: employee.id, businessId: employee.businessId,
        effectiveDate, oldSalary: current, newSalary: newVal,
        reason, note: note.trim() || null,
        status: applyNow ? 'applied' : 'pending',
        appliedAt: applyNow ? new Date().toISOString() : null,
      });
      if (applyNow) await ops.employee.update(employee.id, { baseSalary: newVal });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[92vh] sm:max-h-[90vh]">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <h2 className="font-semibold text-stone-800">ปรับเงินเดือน</h2>
          <button onClick={onClose} className="p-2 -mr-1 hover:bg-stone-100 rounded-lg text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 sm:p-6 overflow-auto overscroll-contain space-y-4">
          <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
            <Avatar photo={employee.photo} name={dispName(employee)} size={40} />
            <div>
              <div className="font-medium text-stone-800"><span className="font-mono text-xs text-stone-400 mr-1">#{employee.employeeNumber}</span>{dispName(employee)}</div>
              <div className="text-xs text-stone-500">เงินเดือนปัจจุบัน {fmtMoney(current)} ฿</div>
            </div>
          </div>
          <FormField label="เงินเดือนใหม่ (บาท)" required>
            <input type="number" min="0" step="0.01" autoFocus value={newSalary} onChange={(e) => setNewSalary(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder={`เดิม ${fmtMoney(current)}`} />
            {newVal > 0 && diff !== 0 && (
              <p className={`text-xs mt-1 font-medium ${diff > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {diff > 0 ? '▲ เพิ่มขึ้น' : '▼ ลดลง'} {fmtMoney(Math.abs(diff))} ฿ ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
              </p>
            )}
          </FormField>
          <FormField label="เดือนที่มีผล" required>
            <select value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}{o.isCurrent ? ' (เดือนนี้)' : ''}</option>
              ))}
            </select>
            {isFuture
              ? <p className="text-xs text-amber-700 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />ตั้งล่วงหน้า — เงินเดือนจะปรับอัตโนมัติเมื่อถึงต้นเดือน {selectedOpt.label}</p>
              : <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />ปรับทันทีสำหรับเดือนนี้</p>}
          </FormField>
          <FormField label="เหตุผล" required>
            <div className="grid grid-cols-2 gap-2">
              {SALARY_REASONS.map((r) => (
                <button key={r.value} type="button" onClick={() => setReason(r.value)} className={`px-3 py-2 rounded-lg border-2 text-sm transition-all ${reason === r.value ? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-900' : 'border-stone-200 text-stone-700 hover:border-stone-300'}`}>{r.label}</button>
              ))}
            </div>
          </FormField>
          <FormField label="หมายเหตุ">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" />
          </FormField>
        </div>
        <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"><TrendingUp className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : (isFuture ? 'ตั้งเวลาปรับ' : 'บันทึก + ปรับทันที')}</button>
        </div>
      </div>
    </div>
  );
}

function EmployeeDetailModal({ employee, salaryReload, zones, positions, employees, businesses, canWrite, canResign, canRaise, isOwner = false, ops, onClose, onEdit, onDelete, onResign, onRehire, onRaise }) {
  const zone = zones.find((z) => z.id === employee.zoneId);
  const pos = positions.find((p) => p.id === employee.positionId);
  const mgr = employees.find((e) => e.id === employee.managerId);
  const reports = employees.filter((e) => e.managerId === employee.id);
  const primaryBiz = businesses?.find((b) => b.id === employee.businessId);
  const additionalBizs = (employee.additionalBusinessIds || []).map((id) => businesses?.find((b) => b.id === id)).filter(Boolean);
  const resigned = !isActive(employee);
  const [salaryHistory, setSalaryHistory] = useState(null);
  useEffect(() => {
    if (!canRaise || !ops) return;
    let cancelled = false;
    (async () => {
      const h = await ops.salaryChange.listByEmployee(employee.id);
      if (!cancelled) setSalaryHistory(h);
    })();
    return () => { cancelled = true; };
  }, [employee.id, canRaise, salaryReload]);
  const fmt = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : null);
  const yos = employee.startDate ? Math.floor((Date.now() - new Date(employee.startDate)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const display = dispName(employee);
  const hasNick = employee.nickname?.trim() && employee.nickname.trim() !== employee.name?.trim();
  const initials = display.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const foreign = isForeign(employee.nationality);
  const [showCard, setShowCard] = useState(false);

  // คำนวณว่าบัตรแรงงานหมดอายุหรือใกล้หมดอายุไหม
  let permitStatus = null;
  if (employee.workPermitExpiry) {
    const days = Math.ceil((new Date(employee.workPermitExpiry) - Date.now()) / (24 * 60 * 60 * 1000));
    if (days < 0) permitStatus = { label: 'หมดอายุแล้ว', cls: 'text-red-700 bg-red-100' };
    else if (days < 30) permitStatus = { label: `เหลือ ${days} วัน`, cls: 'text-amber-800 bg-amber-100' };
    else permitStatus = { label: `เหลือ ${days} วัน`, cls: 'text-emerald-700 bg-emerald-50' };
  }
  // ข้อความสถานะวันหมดอายุ (ใช้กับบัตรประจำตัว/พาสปอร์ต)
  const expLabel = (d) => {
    if (!d) return '';
    const days = Math.ceil((new Date(d) - Date.now()) / 86400000);
    return days < 0 ? 'หมดอายุแล้ว' : `เหลือ ${days} วัน`;
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">รายละเอียดพนักงาน</h2>
          <div className="flex items-center gap-2">
            {canResign && <button onClick={() => setShowCard(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium"><CreditCard className="w-4 h-4" /> บัตรพนักงาน</button>}
            <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-500"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 p-6">
            <div className="aspect-square bg-gradient-to-br from-stone-100 to-stone-200 rounded-2xl overflow-hidden">
              {employee.photo ? <img src={employee.photo} alt={display} className="w-full h-full object-contain" /> : (
                <div className="w-full h-full flex items-center justify-center"><div className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 text-white text-5xl font-semibold flex items-center justify-center">{initials}</div></div>
              )}
            </div>
            <div>
              <div className="text-sm font-mono text-stone-500">#{employee.employeeNumber || '—'}</div>
              <h1 className="text-3xl font-bold text-stone-800">{display}</h1>
              {hasNick && <div className="text-sm text-stone-500 mt-0.5">ชื่อจริง: {employee.name}</div>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {pos && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-sm font-medium rounded-md"><Award className="w-3.5 h-3.5" />{pos.name}</span>}
                {zone ? <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-100 text-stone-700 text-sm rounded-md"><MapPin className="w-3.5 h-3.5" />{zone.name}</span>
                  : pos?.crossZone && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 text-sm font-medium rounded-md"><MapPin className="w-3.5 h-3.5" />ไม่จำกัดโซน</span>}
                {employee.nationality && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 text-sky-800 text-sm rounded-md"><span className="leading-none">{natFlag(employee.nationality)}</span>{natLabel(employee.nationality)}</span>}
              </div>
              {additionalBizs.length > 0 && (
                <div className="mt-3 p-3 bg-sky-50/60 border border-sky-200 rounded-lg">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-sky-900 mb-1.5">
                    <Building2 className="w-3.5 h-3.5" />ดูแลธุรกิจ ({1 + additionalBizs.length} ที่)
                  </div>
                  <div className="space-y-1">
                    {[primaryBiz, ...additionalBizs].filter(Boolean).map((b, i) => {
                      const bp = positions.find((p) => p.id === businessPositionId(employee, b.id));
                      const bsal = businessBaseSalary(employee, b.id);
                      return (
                        <div key={b.id} className="flex items-center justify-between gap-2 px-2 py-1 bg-white border border-stone-200 rounded text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="font-medium text-stone-800">{b.name}</span>
                            {i === 0 && <span className="text-[9px] text-emerald-600">หลัก</span>}
                            {bp && <span className="text-stone-500">• {bp.name}</span>}
                          </span>
                          {canRaise && bsal > 0 && <span className="text-stone-600">{fmtMoney(bsal)} ฿</span>}
                        </div>
                      );
                    })}
                  </div>
                  {canRaise && hasSalarySplit(employee) && <p className="text-[11px] text-sky-700 mt-1.5">แยกเงินเดือน + ทำสลิปแยกต่อธุรกิจ</p>}
                </div>
              )}
              {resigned && (
                <div className="mt-3 p-3 bg-stone-100 border border-stone-300 rounded-lg">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-stone-700 mb-1">
                    <LogOut className="w-4 h-4" />ลาออกแล้ว
                  </div>
                  <div className="text-xs text-stone-600 space-y-0.5">
                    <div>วันที่ลาออก: <strong>{fmt(employee.resignedDate) || '—'}</strong></div>
                    <div>เหตุผล: <strong>{resignLabel(employee.resignReason)}</strong></div>
                    {employee.resignNote && <div>หมายเหตุ: {employee.resignNote}</div>}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-5">
                <InfoItem icon={Phone} label="เบอร์โทร" value={employee.phone} />
                <InfoItem icon={Mail} label="อีเมล" value={employee.email} />
                <InfoItem icon={Calendar} label="วันเริ่มงาน" value={fmt(employee.startDate)} hint={yos != null ? `${yos} ปี` : null} />
                <InfoItem icon={Calendar} label="วันเกิด" value={fmt(employee.birthDate)} />
                <InfoItem icon={UserCircle} label="หัวหน้าโดยตรง" value={dispName(mgr) || null} />
                <InfoItem icon={Shield} label="ผู้ติดต่อฉุกเฉิน" value={employee.emergencyContact} />
              </div>
            </div>
          </div>

          {foreign && (
            <div className="px-6 pb-2">
              <div className="bg-sky-50/50 border border-sky-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-sky-700" />
                  <h3 className="text-sm font-medium text-sky-900">เอกสารแรงงานต่างด้าว</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <div className="flex items-start gap-2.5">
                    <CreditCard className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-stone-500">บัตรแรงงาน</div>
                      <div className="text-sm text-stone-800">
                        {employee.hasWorkPermit === true ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="font-medium">ทำแล้ว</span>
                            {permitStatus && <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${permitStatus.cls}`}>{permitStatus.label}</span>}
                          </span>
                        ) : employee.hasWorkPermit === false ? <span className="text-amber-700 font-medium">ยังไม่ทำบัตร</span>
                        : <span className="text-stone-400">—</span>}
                      </div>
                      {employee.workPermitExpiry && <div className="text-xs text-stone-500 mt-0.5">หมดอายุ {fmt(employee.workPermitExpiry)}</div>}
                      <DocList paths={employee.workPermitDocs} />
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <BookOpen className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-stone-500">พาสปอร์ต</div>
                      <div className="text-sm text-stone-800">
                        {employee.hasPassport === true ? <span className="font-medium">มี</span>
                        : employee.hasPassport === false ? <span className="text-amber-700">ไม่มี</span>
                        : <span className="text-stone-400">—</span>}
                      </div>
                      <DocList paths={employee.passportDocs} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {employee.applicationDocs?.length > 0 && (
            <div className="px-6 pb-2">
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="w-4 h-4 text-stone-600" />
                  <h3 className="text-sm font-medium text-stone-800">เอกสารสมัครงาน</h3>
                </div>
                <DocList paths={employee.applicationDocs} />
              </div>
            </div>
          )}

          {(employee.address || employee.nationalId || employee.idCardExpiry || employee.passportExpiry || employee.notes) && (
            <div className="px-6 pb-6 space-y-4 pt-4">
              {employee.address && <DetailBlock icon={MapPin} label="ที่อยู่" value={employee.address} />}
              {employee.nationalId && <DetailBlock icon={Shield} label="เลขบัตรประชาชน" value={employee.nationalId} mono />}
              {employee.idCardExpiry && <DetailBlock icon={Shield} label="บัตรประจำตัวหมดอายุ" value={`${fmt(employee.idCardExpiry)} • ${expLabel(employee.idCardExpiry)}`} />}
              {employee.passportExpiry && <DetailBlock icon={BookOpen} label="พาสปอร์ตหมดอายุ" value={`${fmt(employee.passportExpiry)} • ${expLabel(employee.passportExpiry)}`} />}
              {employee.notes && <DetailBlock icon={Edit2} label="บันทึกเพิ่มเติม" value={employee.notes} />}
            </div>
          )}
          {canRaise && (
            <div className="px-6 pb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap"><Wallet className="w-4 h-4 text-stone-500" /><h3 className="font-medium text-stone-700">เงินเดือนปัจจุบัน {fmtMoney(employee.baseSalary)} ฿</h3>{employee.onProbation && Number(employee.probationSalary) > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded"><Clock className="w-3 h-3" />ทดลองงาน {fmtMoney(employee.probationSalary)} ฿ • {employee.probationMonths || 0} รอบบิล</span>}</div>
                {!resigned && <button onClick={onRaise} className="flex items-center gap-1.5 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 border border-emerald-300 rounded-lg text-sm font-medium"><TrendingUp className="w-3.5 h-3.5" /> ปรับเงินเดือน</button>}
              </div>
              {salaryHistory === null ? (
                <div className="text-xs text-stone-400">กำลังโหลดประวัติ...</div>
              ) : salaryHistory.length === 0 ? (
                <div className="text-xs text-stone-400 italic">ยังไม่มีประวัติการปรับเงินเดือน</div>
              ) : (
                <div className="space-y-2">
                  {salaryHistory.map((sc) => {
                    const diff = Number(sc.newSalary) - Number(sc.oldSalary);
                    const pct = Number(sc.oldSalary) > 0 ? (diff / Number(sc.oldSalary)) * 100 : 0;
                    const pending = sc.status === 'pending';
                    return (
                      <div key={sc.id} className={`flex items-start gap-3 p-3 rounded-lg border ${pending ? 'bg-amber-50/50 border-amber-200' : 'bg-stone-50 border-stone-200'}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${diff >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                          {diff >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-700" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-stone-800">{fmtMoney(sc.oldSalary)} → {fmtMoney(sc.newSalary)} ฿</span>
                            <span className={`text-xs font-medium ${diff >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>({diff >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
                            {pending && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded"><Clock className="w-2.5 h-2.5" />รอมีผล</span>}
                          </div>
                          <div className="text-xs text-stone-500 mt-0.5">{salaryReasonLabel(sc.reason)} • มีผล {sc.effectiveDate ? `${MONTH_NAMES[new Date(sc.effectiveDate).getMonth()]} ${new Date(sc.effectiveDate).getFullYear() + 543}` : '—'}</div>
                          {sc.note && <div className="text-xs text-stone-400 mt-0.5">{sc.note}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {reports.length > 0 && (
            <div className="px-6 pb-6">
              <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-stone-500" /><h3 className="font-medium text-stone-700">ลูกน้องโดยตรง ({reports.length} คน)</h3></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {reports.map((r) => {
                  const rp = positions.find((p) => p.id === r.positionId);
                  return (<div key={r.id} className="flex items-center gap-3 p-2.5 bg-stone-50 rounded-lg"><Avatar photo={r.photo} name={dispName(r)} size={36} /><div className="min-w-0"><div className="text-sm font-medium text-stone-800 truncate"><span className="font-mono text-xs text-stone-400 mr-1.5">#{r.employeeNumber}</span>{dispName(r)}</div><div className="text-xs text-stone-500 truncate">{rp?.name || '—'}</div></div></div>);
                })}
              </div>
            </div>
          )}
        </div>
        {canWrite && (
          <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex justify-between gap-2">
            <div>
              {canResign && (resigned ? (
                <button onClick={onRehire} className="flex items-center gap-2 px-4 py-2 text-emerald-700 hover:bg-emerald-50 border border-emerald-300 rounded-lg text-sm font-medium"><UserCircle className="w-4 h-4" /> จ้างกลับ</button>
              ) : (
                <button onClick={onResign} className="flex items-center gap-2 px-4 py-2 text-stone-700 hover:bg-stone-100 border border-stone-300 rounded-lg text-sm font-medium"><LogOut className="w-4 h-4" /> ลาออก</button>
              ))}
            </div>
            <div className="flex gap-2">
              {isOwner && <button onClick={onDelete} className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"><Trash2 className="w-4 h-4" /> ลบ</button>}
              {!resigned && <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Edit2 className="w-4 h-4" /> แก้ไข</button>}
            </div>
          </div>
        )}
      </div>
      {showCard && (
        <EmployeeIDCard employee={employee} business={primaryBiz} zone={zone} position={pos} onClose={() => setShowCard(false)} />
      )}
    </div>
  );
}

// ============ บัตรพนักงาน (ID CARD) — CR80 แนวตั้ง 54×85.6mm ============
// สร้าง QR code เป็น data URL (ใช้ lib qrcode-generator จาก CDN ใน index.html)
function makeQRDataUrl(text) {
  try {
    if (typeof window === 'undefined' || !window.qrcode) return null;
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(5, 0);
  } catch { return null; }
}

// สีแบรนด์คงที่ (ไม่ตามธีม) เพื่อให้บัตรพิมพ์ออกมาตรงเสมอ
const CARD = {
  green1: '#065f46', green2: '#053d31', greenDeep: '#04332a',
  gold: '#d4a017', goldLight: '#f0b429', ink: '#1c1917', muted: '#9a958f', line: '#ece9e4',
};

function EmployeeIDCard({ employee, business, zone, position, onClose }) {
  const display = dispName(employee);
  const initials = display.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
  const hasRealNick = employee.nickname && employee.name && employee.nickname !== employee.name;

  // QR: เข้ารหัสรหัสพนักงาน + ชื่อ + บริษัท
  const qrText = `${business?.name || 'บริษัท'} | #${employee.employeeNumber || '-'} | ${display}${employee.phone ? ' | ' + employee.phone : ''}`;
  const [qrUrl, setQrUrl] = useState(() => makeQRDataUrl(qrText));
  useEffect(() => {
    if (qrUrl) return;
    let tries = 0;
    const t = setInterval(() => {
      const u = makeQRDataUrl(qrText);
      if (u || ++tries > 20) { if (u) setQrUrl(u); clearInterval(t); }
    }, 150);
    return () => clearInterval(t);
  }, []);

  const printCard = () => {
    const cardEl = document.getElementById('emp-id-card');
    if (!cardEl) return;
    const w = window.open('', '_blank', 'width=440,height=720');
    if (!w) { alert('กรุณาอนุญาต popup เพื่อพิมพ์บัตร'); return; }
    w.document.write(`<!DOCTYPE html><html lang="th"><head><title>บัตรพนักงาน - ${display}</title>
      <meta charset="utf-8" />
      <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Prompt:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>
        @page { size: 54mm 85.6mm; margin: 0; }
        * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        body { font-family:'Prompt',sans-serif; display:flex; align-items:center; justify-content:center; background:#e7e5e4; }
        .wrap { width:54mm; height:85.6mm; overflow:hidden; }
        .wrap > #emp-id-card { transform: scale(0.7559); transform-origin: top left; box-shadow:none !important; }
        @media print { body { background:#fff; } }
      </style></head><body>
      <div class="wrap">${cardEl.outerHTML}</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},500);};window.onafterprint=function(){window.close();};</script>
      </body></html>`);
    w.document.close();
  };

  const rows = [
    { icon: Hash, label: 'รหัสพนักงาน', value: `#${employee.employeeNumber || '—'}` },
    { icon: MapPin, label: 'สังกัด / โซน', value: zone?.name || (position?.crossZone ? 'ไม่จำกัดโซน' : '—') },
    { icon: Phone, label: 'เบอร์โทร', value: employee.phone || '—' },
    { icon: Calendar, label: 'เริ่มงาน', value: fmtDate(employee.startDate) },
  ];

  return (
    <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-4 my-auto">
        {/* ===== บัตร (inline styles ทั้งหมด เพื่อพิมพ์ตรงจอ) ===== */}
        <div id="emp-id-card" style={{ width: '270px', height: '428px', position: 'relative', borderRadius: '16px', overflow: 'hidden', background: '#ffffff', boxShadow: '0 20px 50px rgba(0,0,0,0.35)', fontFamily: "'Prompt', sans-serif", border: `1px solid ${CARD.line}` }}>
          {/* แถบหัวโค้ง + ลายเส้น guilloché */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '136px', background: `linear-gradient(135deg, ${CARD.green1} 0%, ${CARD.greenDeep} 100%)`, borderBottomLeftRadius: '40px 22px', borderBottomRightRadius: '40px 22px' }}>
            <svg width="270" height="136" viewBox="0 0 270 136" style={{ position: 'absolute', inset: 0, opacity: 0.12 }} preserveAspectRatio="none">
              {[...Array(9)].map((_, i) => <ellipse key={i} cx="135" cy="20" rx={40 + i * 26} ry={14 + i * 9} fill="none" stroke="#ffffff" strokeWidth="0.6" />)}
            </svg>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${CARD.gold}, ${CARD.goldLight}, ${CARD.gold})` }} />
          </div>

          {/* ลายน้ำโลโก้ */}
          <div style={{ position: 'absolute', top: '170px', left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: 0.05, pointerEvents: 'none' }}>
            {business?.logo ? <img src={business.logo} alt="" style={{ width: '150px', height: '150px', objectFit: 'contain' }} /> : <Building2 style={{ width: '150px', height: '150px', color: CARD.green1 }} />}
          </div>

          {/* หัว: โลโก้ + ชื่อบริษัท */}
          <div style={{ position: 'relative', padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, boxShadow: `0 0 0 1.5px ${CARD.gold}` }}>
              {business?.logo ? <img src={business.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Building2 style={{ width: '18px', height: '18px', color: CARD.green1 }} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: "'Kanit', sans-serif" }}>{business?.name || 'บริษัท'}</div>
              <div style={{ fontSize: '7.5px', letterSpacing: '2.5px', color: CARD.goldLight, fontWeight: 500 }}>EMPLOYEE ID CARD</div>
            </div>
          </div>

          {/* รูปพนักงาน */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
            <div style={{ width: '106px', height: '106px', borderRadius: '14px', overflow: 'hidden', background: '#f5f5f4', boxShadow: `0 0 0 3px #ffffff, 0 0 0 5px ${CARD.gold}, 0 8px 18px rgba(0,0,0,0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {employee.photo ? <img src={employee.photo} alt={display} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${CARD.green1}, ${CARD.greenDeep})`, color: '#fff', fontSize: '32px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Kanit', sans-serif" }}>{initials}</div>}
            </div>
          </div>

          {/* ชื่อ + ตำแหน่ง */}
          <div style={{ position: 'relative', textAlign: 'center', padding: '0 14px', marginTop: '9px' }}>
            <div style={{ fontWeight: 700, color: CARD.ink, fontSize: '17px', lineHeight: 1.15, fontFamily: "'Kanit', sans-serif" }}>{display}</div>
            {hasRealNick && <div style={{ fontSize: '9.5px', color: CARD.muted, lineHeight: 1.3, marginTop: '1px' }}>{employee.name}</div>}
            <div style={{ display: 'inline-block', marginTop: '5px', padding: '2px 12px', background: `linear-gradient(90deg, ${CARD.gold}, ${CARD.goldLight})`, color: '#fff', fontSize: '10px', fontWeight: 600, borderRadius: '999px', fontFamily: "'Kanit', sans-serif", boxShadow: '0 2px 5px rgba(212,160,23,0.4)' }}>{position?.name || 'พนักงาน'}</div>
          </div>

          {/* ข้อมูล */}
          <div style={{ position: 'relative', padding: '0 18px', marginTop: '11px' }}>
            {rows.map((r, i) => {
              const Icon = r.icon;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', borderBottom: i < rows.length - 1 ? `1px solid ${CARD.line}` : 'none', padding: '4px 0' }}>
                  <Icon style={{ width: '12px', height: '12px', color: CARD.green1, flexShrink: 0 }} />
                  <span style={{ fontSize: '8.5px', color: CARD.muted, letterSpacing: '0.3px', flexShrink: 0, width: '62px' }}>{r.label}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: CARD.ink, textAlign: 'right', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.value}</span>
                </div>
              );
            })}
          </div>

          {/* ท้ายบัตร: QR + ป้าย */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
            <div style={{ background: '#faf9f7', borderTop: `1px solid ${CARD.line}`, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '7px', background: '#fff', border: `1px solid ${CARD.line}`, padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {qrUrl ? <img src={qrUrl} alt="QR" style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} /> : <Building2 style={{ width: '20px', height: '20px', color: CARD.muted }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '7.5px', color: CARD.muted, letterSpacing: '1px' }}>STAFF ID</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: CARD.green1, fontFamily: "'Kanit', sans-serif", lineHeight: 1.1 }}>#{employee.employeeNumber || '—'}</div>
                <div style={{ fontSize: '7px', color: CARD.muted, lineHeight: 1.2, marginTop: '1px' }}>ทรัพย์สินของบริษัท · พบกรุณาส่งคืน</div>
              </div>
            </div>
            <div style={{ height: '5px', background: `linear-gradient(90deg, ${CARD.green1}, ${CARD.gold})` }} />
          </div>
        </div>

        {/* ปุ่ม */}
        <div className="flex gap-2">
          <button onClick={printCard} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium shadow-lg"><FileText className="w-4 h-4" /> พิมพ์ / บันทึก PDF</button>
          <button onClick={onClose} className="px-5 py-2.5 bg-white hover:bg-stone-100 text-stone-700 rounded-lg text-sm font-medium shadow-lg">ปิด</button>
        </div>
      </div>
    </div>
  );
}


function EmployeeForm({ initial, zones, positions, allPositions, employees, businesses, onSave, onCancel, lockedZoneId, allowedZoneIds, businessId, isOwner, canEditPay }) {
  const [name, setName] = useState(initial?.name || '');
  const [nickname, setNickname] = useState(initial?.nickname || '');
  const [employeeNumber, setEmployeeNumber] = useState(initial?.employeeNumber || '');
  const [photo, setPhoto] = useState(initial?.photo || '');
  const [zoneId, setZoneId] = useState(initial?.zoneId || lockedZoneId || '');
  const [positionId, setPositionId] = useState(initial?.positionId || '');
  const [businessPositions, setBusinessPositions] = useState(initial?.businessPositions || {});
  const [managerId, setManagerId] = useState(initial?.managerId || '');
  const [additionalBusinessIds, setAdditionalBusinessIds] = useState(initial?.additionalBusinessIds || []);
  const [phone, setPhone] = useState(initial?.phone || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [startDate, setStartDate] = useState(initial?.startDate || '');
  const [birthDate, setBirthDate] = useState(initial?.birthDate || '');
  const [nationalId, setNationalId] = useState(initial?.nationalId || '');
  const [idCardExpiry, setIdCardExpiry] = useState(initial?.idCardExpiry || '');
  const [emergencyContact, setEmergencyContact] = useState(initial?.emergencyContact || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [nationality, setNationality] = useState(initial?.nationality || 'thai');
  const [hasWorkPermit, setHasWorkPermit] = useState(initial?.hasWorkPermit ?? null);
  const [workPermitExpiry, setWorkPermitExpiry] = useState(initial?.workPermitExpiry || '');
  const [hasPassport, setHasPassport] = useState(initial?.hasPassport ?? null);
  const [passportExpiry, setPassportExpiry] = useState(initial?.passportExpiry || '');
  const [workPermitDocs, setWorkPermitDocs] = useState(initial?.workPermitDocs || []);
  const [passportDocs, setPassportDocs] = useState(initial?.passportDocs || []);
  const [applicationDocs, setApplicationDocs] = useState(initial?.applicationDocs || []);
  const [baseSalary, setBaseSalary] = useState(initial?.baseSalary ?? '');
  const [salarySplitEnabled, setSalarySplitEnabled] = useState(!!(initial?.salarySplit && Object.keys(initial.salarySplit).length));
  const [salarySplit, setSalarySplit] = useState(initial?.salarySplit || {});
  const [onProbation, setOnProbation] = useState(initial?.onProbation ?? false);
  const [probationSalary, setProbationSalary] = useState(initial?.probationSalary ?? '');
  const [probationMonths, setProbationMonths] = useState(initial?.probationMonths ?? '');
  const [holidayQuota, setHolidayQuota] = useState(initial?.holidayQuota ?? 4);
  const [commissionPct, setCommissionPct] = useState(initial?.commissionPct ?? '');
  const [hasSocialSecurity, setHasSocialSecurity] = useState(initial?.hasSocialSecurity ?? false);
  const [roomFee, setRoomFee] = useState(initial?.roomFee ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  // แยกเงินเดือนตามธุรกิจ: ธุรกิจหลัก + ธุรกิจเพิ่มเติม
  const mainBizId = initial?.businessId || businessId;
  const splitBizIds = [mainBizId, ...additionalBusinessIds].filter((v, i, a) => v && a.indexOf(v) === i);
  const splitTotal = splitBizIds.reduce((s, id) => s + (Number(salarySplit[id]) || 0), 0);
  const canSplit = splitBizIds.length > 1;
  const setSplitAmount = (id, val) => setSalarySplit((prev) => ({ ...prev, [id]: val }));
  const toggleSplit = () => {
    if (!salarySplitEnabled) {
      setSalarySplit((prev) => (Object.keys(prev).length ? prev : { [mainBizId]: Number(baseSalary) || 0 }));
      setSalarySplitEnabled(true);
    } else { setSalarySplitEnabled(false); }
  };
  const bizName = (id) => businesses?.find((b) => b.id === id)?.name || '—';

  const handlePhoto = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { setPhoto(await resizeImage(f, 400)); } finally { setUploading(false); }
  };

  const sel = positions.find((p) => p.id === positionId);
  const isCrossZone = sel?.crossZone;
  const foreign = isForeign(nationality);

  const submit = () => {
    if (!name.trim()) return alert('กรุณากรอกชื่อ');
    if (!zoneId && !isCrossZone) return alert('กรุณาเลือกโซน');
    onSave({
      name: name.trim(), nickname: nickname.trim() || null, photo,
      employeeNumber: employeeNumber.trim() || null,
      zoneId: zoneId || null, positionId: positionId || null, managerId: managerId || null,
      additionalBusinessIds: additionalBusinessIds.filter((id) => id !== businessId),
      businessPositions: (() => { const m = {}; additionalBusinessIds.forEach((bid) => { if (businessPositions[bid]) m[bid] = businessPositions[bid]; }); return Object.keys(m).length ? m : null; })(),
      phone: phone.trim(), email: email.trim(), address: address.trim(),
      startDate: startDate || null, birthDate: birthDate || null, nationalId: nationalId.trim(),
      idCardExpiry: idCardExpiry || null,
      emergencyContact: emergencyContact.trim(), notes: notes.trim(),
      nationality: nationality || null,
      hasWorkPermit: foreign ? hasWorkPermit : null,
      workPermitExpiry: foreign && hasWorkPermit === true ? (workPermitExpiry || null) : null,
      hasPassport: foreign ? hasPassport : null,
      passportExpiry: foreign && hasPassport === true ? (passportExpiry || null) : null,
      workPermitDocs: foreign ? workPermitDocs : [],
      passportDocs: foreign ? passportDocs : [],
      applicationDocs,
      ...(canEditPay ? {
        baseSalary: salarySplitEnabled ? splitTotal : (Number(baseSalary) || 0),
        salarySplit: salarySplitEnabled ? splitBizIds.reduce((o, id) => { o[id] = Number(salarySplit[id]) || 0; return o; }, {}) : null,
        commissionPct: commissionPct === '' ? null : Number(commissionPct),
        onProbation,
        probationSalary: onProbation ? (Number(probationSalary) || 0) : null,
        probationMonths: onProbation ? (Number(probationMonths) || null) : null,
        holidayQuota: Number(holidayQuota) || 0,
        hasSocialSecurity: !!hasSocialSecurity,
        roomFee: Number(roomFee) || 0,
      } : {}),
    });
  };

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-2">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar photo={photo} name={dispName({ nickname, name })} size={80} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="absolute -bottom-1 -right-1 w-7 h-7 bg-amber-500 hover:bg-amber-400 text-emerald-950 rounded-full flex items-center justify-center shadow-md disabled:opacity-50"><Camera className="w-3.5 h-3.5" /></button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
        </div>
        <div><div className="text-sm font-medium text-stone-700">รูปโปรไฟล์</div><div className="text-xs text-stone-500 mt-0.5">{uploading ? 'กำลังประมวลผล...' : 'คลิกที่ไอคอนกล้องเพื่ออัปโหลด'}</div></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="หมายเลขพนักงาน">
          <input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 font-mono" placeholder={initial?.id ? '' : 'เว้นว่างเพื่อสร้างอัตโนมัติ'} />
          {!initial?.id && <p className="text-xs text-stone-500 mt-1">ถ้าเว้นว่าง ระบบจะใส่เลขถัดไปให้อัตโนมัติ (เช่น 001, 002, ...)</p>}
        </FormField>
        <div /> {/* spacer for grid alignment */}
        <FormField label="ชื่อ-นามสกุล" required><input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น สมชาย ใจดี" /></FormField>
        <FormField label="ชื่อเล่น"><input value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="ชื่อที่ใช้แสดงในระบบ" /></FormField>
        <FormField label="ตำแหน่ง">
          <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
            <option value="">— ยังไม่กำหนด —</option>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.crossZone ? ' (ไม่จำกัดโซน)' : ''}</option>)}
          </select>
        </FormField>
        <FormField label={isCrossZone ? 'โซน (ไม่จำเป็น)' : 'โซน'} required={!isCrossZone}>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={!!lockedZoneId} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white disabled:bg-stone-100">
            <option value="">{isCrossZone ? '— ไม่จำกัดโซน —' : '— เลือกโซน —'}</option>
            {(allowedZoneIds && allowedZoneIds.length ? zones.filter((z) => allowedZoneIds.includes(z.id)) : zones).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          {isCrossZone && <p className="text-xs text-amber-700 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />ตำแหน่งนี้ไม่จำกัดโซน เลือกหรือเว้นว่างก็ได้</p>}
        </FormField>
        <FormField label="หัวหน้าโดยตรง">
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
            <option value="">— ไม่มี —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>#{e.employeeNumber} {dispName(e)}{e.nickname && e.nickname !== e.name ? ` (${e.name})` : ''}</option>)}
          </select>
        </FormField>
        <FormField label="สัญชาติ">
          <select value={nationality} onChange={(e) => setNationality(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
            {NATIONALITIES.map((n) => <option key={n.value} value={n.value}>{n.flag} {n.label}</option>)}
          </select>
        </FormField>
        <FormField label="เบอร์โทร"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0XX-XXX-XXXX" /></FormField>
        <FormField label="อีเมล"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label="วันเริ่มงาน"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label="วันเกิด"><input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label={nationality === 'thai' ? 'เลขบัตรประชาชน' : 'เลขบัตรประจำตัว'}><input value={nationalId} onChange={(e) => setNationalId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label="บัตรประจำตัวหมดอายุ"><input type="date" value={idCardExpiry} onChange={(e) => setIdCardExpiry(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white" /><p className="text-xs text-stone-400 mt-1">เว้นว่างได้ถ้าไม่ต้องการให้เตือน</p></FormField>
        <FormField label="ผู้ติดต่อฉุกเฉิน"><input value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
      </div>

      {isOwner && businesses && businesses.length > 1 && (
        <FormField label="ดูแลธุรกิจเพิ่มเติม">
          <div className="space-y-2">
            <p className="text-xs text-stone-500 -mt-1">ปกติพนักงานสังกัดธุรกิจเดียว ติ๊กที่นี่ถ้าต้องดูแลธุรกิจอื่นด้วย (เช่น ผู้จัดการเขต)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {businesses.filter((b) => b.id !== businessId).map((b) => {
                const checked = additionalBusinessIds.includes(b.id);
                return (
                  <label key={b.id} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition-all ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                    <input type="checkbox" checked={checked} onChange={(e) => {
                      if (e.target.checked) setAdditionalBusinessIds([...additionalBusinessIds, b.id]);
                      else setAdditionalBusinessIds(additionalBusinessIds.filter((id) => id !== b.id));
                    }} className="w-4 h-4 rounded text-emerald-700" />
                    <Building2 className={`w-4 h-4 ${checked ? 'text-emerald-700' : 'text-stone-400'}`} />
                    <span className={`text-sm ${checked ? 'font-medium text-emerald-900' : 'text-stone-700'}`}>{b.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </FormField>
      )}

      {isOwner && additionalBusinessIds.length > 0 && (
        <FormField label="ตำแหน่งในธุรกิจอื่น (รับหน้าที่ต่างกันได้)">
          <div className="space-y-2">
            <p className="text-xs text-stone-500 -mt-1">ตำแหน่งหลักด้านบนใช้กับ "{businesses?.find((b) => b.id === businessId)?.name || 'ธุรกิจหลัก'}" — ตั้งตำแหน่งของธุรกิจอื่นที่นี่ (เว้นว่าง = ใช้ตำแหน่งหลัก)</p>
            {additionalBusinessIds.map((bid) => {
              const b = businesses?.find((x) => x.id === bid);
              const opts = (allPositions || []).filter((p) => p.businessId === bid);
              return (
                <div key={bid} className="flex items-center gap-2">
                  <span className="text-xs text-stone-600 w-32 truncate flex-shrink-0" title={b?.name}>{b?.name || bid}</span>
                  <select value={businessPositions[bid] || ''} onChange={(e) => setBusinessPositions((prev) => { const n = { ...prev }; if (e.target.value) n[bid] = e.target.value; else delete n[bid]; return n; })} className="flex-1 px-3 py-2 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                    <option value="">— ใช้ตำแหน่งหลัก —</option>
                    {opts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.crossZone ? ' (ไม่จำกัดโซน)' : ''}</option>)}
                  </select>
                </div>
              );
            })}
            {(allPositions || []).filter((p) => additionalBusinessIds.includes(p.businessId)).length === 0 && (
              <p className="text-xs text-amber-600">ธุรกิจที่เลือกยังไม่มีตำแหน่ง — ไปสร้างตำแหน่งในธุรกิจนั้นที่หน้า "ตำแหน่ง" ก่อน</p>
            )}
          </div>
        </FormField>
      )}

      {canEditPay && (
        <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-medium text-emerald-900">ข้อมูลค่าจ้าง (สำหรับคำนวณเงินเดือน)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="เงินเดือนฐาน (บาท)">
              {!salarySplitEnabled ? (
                <>
                  <input type="number" min="0" step="0.01" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 12000" />
                  {Number(baseSalary) > 0 && <p className="text-xs text-stone-500 mt-1">ค่าแรง/วัน = {fmtMoney(Number(baseSalary) / 30)} บาท</p>}
                </>
              ) : (
                <div className="space-y-2">
                  {splitBizIds.map((id) => (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-xs text-stone-600 w-32 truncate flex-shrink-0" title={bizName(id)}>{bizName(id)}{id === mainBizId ? ' (หลัก)' : ''}</span>
                      <input type="number" min="0" step="0.01" value={salarySplit[id] ?? ''} onChange={(e) => setSplitAmount(id, e.target.value)} className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0" />
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm pt-1 border-t border-emerald-100">
                    <span className="text-stone-600">รวมเงินเดือน</span>
                    <span className="font-semibold text-emerald-800">{fmtMoney(splitTotal)} ฿</span>
                  </div>
                </div>
              )}
              {canSplit && (
                <button type="button" onClick={toggleSplit} className="mt-2 text-xs text-emerald-700 hover:underline">
                  {salarySplitEnabled ? '↩ กลับไปใส่เงินเดือนก้อนเดียว' : '⊞ แยกเงินเดือนตามธุรกิจ (ทำงานหลายที่)'}
                </button>
              )}
            </FormField>
            <FormField label="โควต้าวันหยุด/เดือน">
              <input type="number" min="0" value={holidayQuota} onChange={(e) => setHolidayQuota(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 4" />
              <p className="text-xs text-stone-500 mt-1">หยุดเกินจากนี้จะถูกหักเป็นรายวัน</p>
            </FormField>
            <FormField label="% คอมมิชชั่น (ตั้งต้นในหน้าคอม)">
              <input type="number" min="0" step="0.001" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 4.3 (= 4.3%)" />
              <p className="text-xs text-stone-500 mt-1">เว้นว่างได้ถ้าไม่ได้คอมตาม % — ใส่คอมเป็นจำนวนเงินในหน้าคอมได้</p>
            </FormField>
            <FormField label="ค่าห้องพัก/เดือน (บาท)">
              <input type="number" min="0" step="0.01" value={roomFee} onChange={(e) => setRoomFee(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0 = ไม่พักห้องตลาด" />
            </FormField>
            <FormField label="ประกันสังคม">
              <label className="flex items-center gap-2 p-2.5 rounded-lg border-2 border-stone-200 cursor-pointer hover:border-stone-300 mt-0.5">
                <input type="checkbox" checked={hasSocialSecurity} onChange={(e) => setHasSocialSecurity(e.target.checked)} className="w-4 h-4 rounded text-emerald-700" />
                <span className="text-sm text-stone-700">มีประกันสังคม (หัก 5% สูงสุด 750)</span>
              </label>
            </FormField>
          </div>
          <div className="pt-3 border-t border-emerald-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={onProbation} onChange={(e) => setOnProbation(e.target.checked)} className="w-4 h-4 rounded text-emerald-700" />
              <span className="text-sm font-medium text-stone-700">อยู่ระหว่างทดลองงาน (เงินเดือนช่วงทดลองต่ำกว่าปกติ)</span>
            </label>
            {onProbation && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <FormField label="เงินเดือนช่วงทดลองงาน (บาท)">
                  <input type="number" min="0" step="0.01" value={probationSalary} onChange={(e) => setProbationSalary(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 9000" />
                  <p className="text-xs text-stone-500 mt-1">เงินเดือนเต็มหลังผ่านทดลอง = {fmtMoney(Number(baseSalary) || 0)} บาท</p>
                </FormField>
                <FormField label="ทดลองงานกี่รอบบิล (เดือน)">
                  <input type="number" min="1" max="12" value={probationMonths} onChange={(e) => setProbationMonths(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 2" />
                  <p className={`text-xs mt-1 ${startDate ? 'text-stone-500' : 'text-amber-600'}`}>{startDate ? `นับจากเดือนเริ่มงาน (${fmt(startDate)}) — ครบ ${Number(probationMonths) || 0} รอบบิลแล้วใช้เงินเดือนเต็มอัตโนมัติ` : 'ต้องระบุ "วันเริ่มงาน" ด้วย ระบบจึงนับรอบบิลได้'}</p>
                </FormField>
              </div>
            )}
          </div>
        </div>
      )}

      {foreign && (
        <div className="bg-sky-50/50 border border-sky-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-700" />
            <h3 className="text-sm font-medium text-sky-900">เอกสารแรงงานต่างด้าว</h3>
          </div>
          <FormField label="บัตรแรงงาน">
            <div className="grid grid-cols-2 gap-2">
              <PillRadio selected={hasWorkPermit === true} onClick={() => setHasWorkPermit(true)} icon={CheckCircle2}>ทำบัตรแล้ว</PillRadio>
              <PillRadio selected={hasWorkPermit === false} onClick={() => setHasWorkPermit(false)} icon={Clock}>ยังไม่ทำบัตร</PillRadio>
            </div>
          </FormField>
          {hasWorkPermit === true && (
            <>
              <FormField label="บัตรหมดอายุ">
                <input type="date" value={workPermitExpiry} onChange={(e) => setWorkPermitExpiry(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white" />
              </FormField>
              <MultiDocUpload label="ไฟล์/รูปบัตรแรงงาน" paths={workPermitDocs} businessId={businessId} docType="work_permit" onChange={setWorkPermitDocs} />
            </>
          )}
          <FormField label="พาสปอร์ต">
            <div className="grid grid-cols-2 gap-2">
              <PillRadio selected={hasPassport === true} onClick={() => setHasPassport(true)} icon={BookOpen}>มีพาสปอร์ต</PillRadio>
              <PillRadio selected={hasPassport === false} onClick={() => setHasPassport(false)} icon={X}>ไม่มี</PillRadio>
            </div>
          </FormField>
          {hasPassport === true && (
            <>
              <FormField label="พาสปอร์ตหมดอายุ">
                <input type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white" />
              </FormField>
              <MultiDocUpload label="ไฟล์/รูปพาสปอร์ต" paths={passportDocs} businessId={businessId} docType="passport" onChange={setPassportDocs} />
            </>
          )}
        </div>
      )}

      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-stone-600" />
          <h3 className="text-sm font-medium text-stone-800">เอกสารสมัครงาน</h3>
        </div>
        <p className="text-xs text-stone-500 -mt-1">เช่น ใบสมัคร, สำเนาวุฒิการศึกษา, รูปถ่าย, เอกสารอ้างอิง (อัปโหลดได้ทุกคน ทั้งคนไทยและต่างชาติ)</p>
        <MultiDocUpload label="ไฟล์/รูปเอกสารสมัครงาน" paths={applicationDocs} businessId={businessId} docType="application" onChange={setApplicationDocs} />
      </div>

      <FormField label="ที่อยู่"><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <FormField label="บันทึกเพิ่มเติม"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}


function DocList({ paths }) {
  const list = Array.isArray(paths) ? paths : [];
  if (list.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.map((p, i) => <DocViewChip key={p} path={p} index={i} total={list.length} />)}
    </div>
  );
}

function DocViewChip({ path, index, total }) {
  const [opening, setOpening] = useState(false);
  const filename = path.split('/').pop() || '';
  const isPdf = filename.toLowerCase().endsWith('.pdf');
  const open = async () => {
    setOpening(true);
    const url = await getDocumentUrl(path);
    setOpening(false);
    if (url) window.open(url, '_blank');
  };
  const label = total > 1 ? `ไฟล์ ${index + 1}` : 'ดูไฟล์';
  return (
    <button type="button" onClick={open} disabled={opening} className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-md font-medium border border-emerald-200 disabled:opacity-50" title={filename}>
      {isPdf ? <FileText className="w-3 h-3" /> : <Paperclip className="w-3 h-3" />}
      {opening ? '...' : label}
    </button>
  );
}

function MultiDocUpload({ label, paths, businessId, docType, onChange }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const list = Array.isArray(paths) ? paths : [];

  const handlePick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const oversized = files.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) return alert(`ไฟล์ ${oversized.name} ใหญ่เกิน 10MB`);
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of files) {
        const p = await uploadDocument(f, businessId, docType);
        if (p) uploaded.push(p);
      }
      if (uploaded.length) onChange([...list, ...uploaded]);
    } finally {
      setUploading(false);
    }
  };

  const removeOne = async (path) => {
    if (!confirm('ลบไฟล์นี้?')) return;
    await deleteDocument(path);
    onChange(list.filter((p) => p !== path));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}{list.length > 0 && <span className="ml-2 text-xs text-stone-500">({list.length} ไฟล์)</span>}</label>
      <div className="space-y-2">
        {list.map((path) => (
          <DocItem key={path} path={path} onRemove={() => removeOne(path)} />
        ))}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-stone-300 hover:border-emerald-400 hover:bg-emerald-50/30 rounded-lg text-sm text-stone-600 hover:text-emerald-700 disabled:opacity-50">
          {uploading ? <><Clock className="w-4 h-4 animate-pulse" /> กำลังอัปโหลด...</> : <><Upload className="w-4 h-4" /> เพิ่มไฟล์{list.length > 0 ? ' (เลือกหลายไฟล์ได้)' : ' (รูปหรือ PDF, ไม่เกิน 10MB ต่อไฟล์)'}</>}
        </button>
      </div>
      <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handlePick} className="hidden" />
    </div>
  );
}

function DocItem({ path, onRemove }) {
  const [opening, setOpening] = useState(false);
  const filename = path.split('/').pop() || 'ไฟล์';
  const isPdf = filename.toLowerCase().endsWith('.pdf');
  const open = async () => {
    setOpening(true);
    const url = await getDocumentUrl(path);
    setOpening(false);
    if (url) window.open(url, '_blank');
  };
  return (
    <div className="flex items-center gap-2 p-2.5 bg-white border border-stone-200 rounded-lg">
      <div className="w-9 h-9 rounded bg-emerald-50 flex items-center justify-center flex-shrink-0">
        {isPdf ? <FileText className="w-4 h-4 text-emerald-700" /> : <Paperclip className="w-4 h-4 text-emerald-700" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-stone-500 truncate" title={filename}>{filename}</div>
      </div>
      <button type="button" onClick={open} disabled={opening} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 rounded-md font-medium disabled:opacity-50">
        <ExternalLink className="w-3.5 h-3.5" />{opening ? '...' : 'ดู'}
      </button>
      <button type="button" onClick={onRemove} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}


export {
  EmployeesPage,
};
