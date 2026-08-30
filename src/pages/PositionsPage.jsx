import React, { useState } from 'react';
import { MapPin, Plus, Edit2, Trash2, Layers, AlertCircle, CheckCircle2, Award, Wallet } from 'lucide-react';
import { businessPositionId } from '../lib/business.js';
import { isActive } from '../lib/format.js';
import { allDepartments } from '../lib/order.js';
import { Modal, FormField, FormActions, EmptyState, PageHeader } from '../ui/index.jsx';

// ============ POSITIONS PAGE ============
function PositionsPage({ businesses, positions, employees, profile, activeBusinessId, ops }) {
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const isOwner = profile.isOwner;
  const canManageBiz = isOwner || profile.isBM;
  const canManagePayroll = profile.canManagePayroll;
  const bizPositions = positions.filter((p) => p.businessId === activeBusinessId);

  const save = async (d) => {
    if (editing?.id) await ops.position.update(editing.id, d);
    else await ops.position.add({ ...d, businessId: activeBusinessId });
    setShowModal(false); setEditing(null);
  };
  const del = async (id) => {
    if (employees.some((e) => e.positionId === id)) return alert('มีพนักงานในตำแหน่งนี้');
    if (positions.some((p) => p.parentId === id)) return alert('มีตำแหน่งอื่นรายงานต่อตำแหน่งนี้');
    if (!confirm('ลบตำแหน่งนี้?')) return;
    await ops.position.delete(id);
  };

  if (!activeBusinessId) return (
    <div className="h-full overflow-auto"><PageHeader title="ตำแหน่ง" /><div className="p-4 md:p-8"><EmptyState icon={Award} title="เลือกธุรกิจที่ sidebar" description="ตำแหน่งเป็นข้อมูลเฉพาะของแต่ละธุรกิจ — ต้องเลือกธุรกิจที่ sidebar ก่อน" /></div></div>
  );
  const roots = bizPositions.filter((p) => !p.parentId);
  const shortages = bizPositions
    .map((p) => { const count = employees.filter((e) => businessPositionId(e, activeBusinessId) === p.id && isActive(e)).length; const target = p.targetHeadcount || 0; return { p, count, target, short: target > 0 ? Math.max(0, target - count) : 0 }; })
    .filter((x) => x.short > 0)
    .sort((a, b) => b.short - a.short);
  const totalShort = shortages.reduce((s, x) => s + x.short, 0);

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ตำแหน่ง" subtitle={`ธุรกิจ: ${businesses.find((b) => b.id === activeBusinessId)?.name}`}>
        {canManageBiz && <button onClick={() => { setEditing({}); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" /> เพิ่มตำแหน่ง</button>}
      </PageHeader>
      <div className="p-4 md:p-8">
        {bizPositions.length === 0 ? (
          <EmptyState icon={Award} title="ยังไม่มีตำแหน่ง" description="เพิ่มตำแหน่งและกำหนดสายบังคับบัญชา (เช่น ผู้จัดการ → หัวหน้าโซน → พนักงาน)" />
        ) : (
          <>
            {shortages.length > 0 && (
              <div className="mb-4 bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-200 flex items-center justify-center"><AlertCircle className="w-5 h-5 text-amber-800" /></div>
                  <div>
                    <h3 className="font-semibold text-amber-900">ตำแหน่งที่พนักงานขาด</h3>
                    <div className="text-xs text-amber-700">ขาดรวม <b>{totalShort} อัตรา</b> ใน {shortages.length} ตำแหน่ง</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {shortages.map(({ p, count, target, short }) => (
                    <span key={p.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-sm">
                      <span className="font-medium text-stone-800">{p.name}</span>
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">ขาด {short}</span>
                      <span className="text-xs text-stone-400">{count}/{target}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <PositionTree positions={roots} allPositions={bizPositions} employees={employees} activeBusinessId={activeBusinessId} onEdit={(p) => { setEditing(p); setShowModal(true); }} onDelete={del} isOwner={canManageBiz} canManagePayroll={canManagePayroll} level={0} />
            </div>
          </>
        )}
      </div>
      {showModal && (
        <Modal title={editing?.id ? 'แก้ไขตำแหน่ง' : 'เพิ่มตำแหน่งใหม่'} onClose={() => { setShowModal(false); setEditing(null); }}>
          <PositionForm initial={editing} positions={bizPositions} allPositions={positions} canManagePayroll={canManagePayroll} onSave={save} onCancel={() => { setShowModal(false); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

function PositionTree({ positions, allPositions, employees, activeBusinessId, onEdit, onDelete, isOwner, canManagePayroll, level }) {
  return (
    <div className={level === 0 ? 'space-y-2' : 'mt-2 ml-6 pl-4 border-l-2 border-stone-200 space-y-2'}>
      {positions.map((pos) => {
        const children = allPositions.filter((p) => p.parentId === pos.id);
        const count = employees.filter((e) => businessPositionId(e, activeBusinessId) === pos.id && isActive(e)).length;
        const target = pos.targetHeadcount || 0;
        const shortage = target > 0 ? Math.max(0, target - count) : 0;
        const over = target > 0 ? Math.max(0, count - target) : 0;
        const full = target > 0 && count === target;
        return (
          <div key={pos.id}>
            <div className={`flex items-center justify-between p-3 rounded-lg group ${shortage > 0 ? 'bg-amber-50 hover:bg-amber-100 border-l-4 border-amber-400' : 'bg-stone-50 hover:bg-stone-100'}`}>
              <div className="flex items-center gap-3">
                <Award className={`w-4 h-4 ${shortage > 0 ? 'text-amber-700' : 'text-emerald-700'}`} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap"><div className="font-medium text-stone-800">{pos.name}</div>
                    {pos.department && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-medium rounded-full"><Layers className="w-2.5 h-2.5" />{pos.department}</span>}
                    {pos.crossZone && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-medium rounded-full"><MapPin className="w-2.5 h-2.5" />ไม่จำกัดโซน</span>}
                    {target > 0 && (
                      full
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-medium rounded-full"><CheckCircle2 className="w-2.5 h-2.5" />ครบ {count}/{target}</span>
                        : over > 0
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-medium rounded-full"><AlertCircle className="w-2.5 h-2.5" />เกิน {over} ({count}/{target})</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full"><AlertCircle className="w-3 h-3" />ขาด {shortage} คน ({count}/{target})</span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500">{count} คน{target > 0 ? ` (ต้องการ ${target})` : ''}{pos.description ? ` • ${pos.description}` : ''}</div>
                  {canManagePayroll && pos.standardSalary && (
                    <div className="mt-1.5 inline-flex items-start gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <Wallet className="w-3.5 h-3.5 text-emerald-700 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide">Standard Salary</div>
                        <div className="text-xs text-stone-700 whitespace-pre-line">{pos.standardSalary}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {isOwner && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEdit(pos)} className="p-1.5 hover:bg-white rounded text-stone-600"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => onDelete(pos.id)} className="p-1.5 hover:bg-red-50 rounded text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
            {children.length > 0 && <PositionTree positions={children} allPositions={allPositions} employees={employees} activeBusinessId={activeBusinessId} onEdit={onEdit} onDelete={onDelete} isOwner={isOwner} canManagePayroll={canManagePayroll} level={level + 1} />}
          </div>
        );
      })}
    </div>
  );
}

function PositionForm({ initial, positions, allPositions, canManagePayroll, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [parentId, setParentId] = useState(initial?.parentId || '');
  const [crossZone, setCrossZone] = useState(initial?.crossZone || false);
  const [department, setDepartment] = useState(initial?.department || '');
  const [targetHeadcount, setTargetHeadcount] = useState(initial?.targetHeadcount ?? 0);
  const [standardSalary, setStandardSalary] = useState(initial?.standardSalary || '');
  const submit = () => {
    if (!name.trim()) return alert('กรุณากรอกชื่อตำแหน่ง');
    onSave({
      name: name.trim(), description: description.trim(), parentId: parentId || null, crossZone, targetHeadcount: Number(targetHeadcount) || 0,
      department: department.trim() || null,
      ...(canManagePayroll ? { standardSalary: standardSalary.trim() || null } : {}),
    });
  };
  const isDescendant = (id, of) => { let p = positions.find((x) => x.id === id); while (p) { if (p.id === of) return true; p = positions.find((x) => x.id === p.parentId); } return false; };
  const validParents = positions.filter((p) => p.id !== initial?.id && !isDescendant(p.id, initial?.id));

  return (
    <div className="space-y-4">
      <FormField label="ชื่อตำแหน่ง" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น ผู้จัดการ" /></FormField>
      <FormField label="แผนก">
        <input list="dept-options" value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น รปภ. · ห้องอาหาร · ช่าง" />
        <datalist id="dept-options">{allDepartments(allPositions || positions).map((d) => <option key={d} value={d} />)}</datalist>
        <p className="text-xs text-stone-500 mt-1">ใช้จัดกลุ่มในหน้าเงินเดือน — ตำแหน่งที่ใส่ชื่อแผนกเดียวกันจะอยู่กลุ่มเดียวกัน (เว้นว่าง = ไม่ระบุแผนก)</p>
      </FormField>
      <FormField label="รายงานต่อตำแหน่ง">
        <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
          <option value="">— ตำแหน่งสูงสุด (ไม่มีหัวหน้า) —</option>
          {validParents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </FormField>
      <FormField label="จำนวนที่ต้องการ (อัตรากำลัง)">
        <input type="number" min="0" value={targetHeadcount} onChange={(e) => setTargetHeadcount(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0 = ไม่กำหนด" />
        <p className="text-xs text-stone-500 mt-1">ระบุจำนวนพนักงานที่ตำแหน่งนี้ควรมี — ถ้ายังไม่ครบ ระบบจะเตือนให้หาคนเพิ่ม (ใส่ 0 = ไม่เตือน)</p>
      </FormField>
      {canManagePayroll && (
        <FormField label="Standard Salary">
          <textarea value={standardSalary} onChange={(e) => setStandardSalary(e.target.value)} rows={3} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" placeholder="เช่น เริ่มต้น 12,000 / ผ่านโปร 13,500 / มีประสบการณ์ 15,000+" />
          <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1"><Wallet className="w-3 h-3" />เห็นเฉพาะผู้ที่มีสิทธิ์ดูเงินเดือนเท่านั้น</p>
        </FormField>
      )}
      <FormField label="รายละเอียด"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <label className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg cursor-pointer hover:bg-stone-100 border border-stone-200">
        <input type="checkbox" checked={crossZone} onChange={(e) => setCrossZone(e.target.checked)} className="mt-0.5 w-4 h-4 rounded text-emerald-700" />
        <div><div className="text-sm font-medium text-stone-800">ตำแหน่งนี้ไม่จำกัดโซน</div><div className="text-xs text-stone-500 mt-0.5">เหมาะกับตำแหน่งที่ดูแลข้ามโซน เช่น ผู้จัดการ</div></div>
      </label>
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}


export {
  PositionsPage,
};
