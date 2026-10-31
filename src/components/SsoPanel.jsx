import React, { useState, useEffect } from 'react';
import { Shield, Plus, Upload, FileText, Trash2, History, Hospital } from 'lucide-react';
import { useSso, sso, todayBkk } from '../lib/sso.js';
import { uploadDocument, deleteDocument, getDocumentUrl } from '../lib/storage.js';

// ============ กล่อง "ประกันสังคม" ในหน้ารายละเอียดพนักงาน ============
// ทะเบียนแยกต่อธุรกิจ (= บัญชีนายจ้างแยกตามธุรกิจ) · โรงพยาบาล + ประวัติเปลี่ยน · เอกสาร
// เขียนได้: เจ้าของ + คนมีสิทธิ์เงินเดือน (RLS บังคับซ้ำ) · เปิดดูไฟล์ได้เฉพาะเจ้าของ (storage policy เดิม)

const STATUS = {
  pending: { label: 'รอขึ้นทะเบียน', cls: 'bg-amber-100 text-amber-800' },
  active: { label: 'มีสิทธิ์', cls: 'bg-emerald-100 text-emerald-800' },
  ended: { label: 'สิ้นสุดแล้ว', cls: 'bg-stone-200 text-stone-600' },
};
const DOC_KINDS = [
  ['sso_1_03', 'สปส.1-03 (ขึ้นทะเบียน)'],
  ['id_card', 'สำเนาบัตรประชาชน'],
  ['hospital', 'หลักฐานเลือก รพ.'],
  ['sso_9_02', 'สปส.9-02 (เปลี่ยน รพ.)'],
  ['sso_6_09', 'สปส.6-09 (แจ้งลาออก)'],
  ['other', 'อื่นๆ'],
];
const docLabel = (k) => (DOC_KINDS.find(([v]) => v === k) || [k, k])[1];
const thDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function SsoPanel({ employee, businesses, isOwner }) {
  const { loading, ok, regs: allRegs, hospitals, reload } = useSso();
  const regs = allRegs.filter((r) => r.employeeId === employee.id);
  const [docs, setDocs] = useState([]);
  const [docsEpoch, setDocsEpoch] = useState(0);
  const regIdsKey = regs.map((r) => r.id).sort().join(',');
  useEffect(() => {
    let c = false;
    (async () => { const d = await sso.listDocuments(regIdsKey ? regIdsKey.split(',') : []); if (!c) setDocs(d); })();
    return () => { c = true; };
  }, [regIdsKey, docsEpoch]);

  const empBizIds = [employee.businessId, ...(employee.additionalBusinessIds || [])].filter(Boolean);
  const bizName = (id) => businesses.find((b) => b.id === id)?.name || '—';
  const missingBiz = empBizIds.filter((id) => !regs.some((r) => r.businessId === id));

  const addReg = async (businessId) => {
    if (!confirm(`เพิ่มทะเบียนประกันสังคมที่ "${bizName(businessId)}"?\n\nจะเริ่มหักเงินเดือนของธุรกิจนี้ตั้งแต่งวดที่ทำเงินเดือนครั้งถัดไป`)) return;
    if (await sso.addRegistration({ employeeId: employee.id, businessId, status: 'pending' })) reload();
  };

  if (loading) return <div className="text-xs text-stone-400">กำลังโหลด...</div>;
  if (!ok) return <div className="text-xs text-red-600">โหลดข้อมูลประกันสังคมไม่สำเร็จ — ลองรีเฟรช</div>;

  return (
    <div className="space-y-3">
      {regs.length === 0 && <div className="text-xs text-stone-400 italic">ไม่มีประกันสังคม</div>}
      {regs.map((r) => (
        <RegCard key={r.id} reg={r} bizName={bizName(r.businessId)} hospitals={hospitals}
          docs={docs.filter((d) => d.employeeSsoId === r.id)} isOwner={isOwner}
          onChanged={reload} onDocsChanged={() => setDocsEpoch((n) => n + 1)} />
      ))}
      {missingBiz.map((id) => (
        <button key={id} onClick={() => addReg(id)} className="flex items-center gap-1.5 text-xs text-emerald-700 hover:underline">
          <Plus className="w-3.5 h-3.5" /> เพิ่มทะเบียนประกันสังคมที่ {bizName(id)}
        </button>
      ))}
    </div>
  );
}

function RegCard({ reg, bizName, hospitals, docs, isOwner, onChanged, onDocsChanged }) {
  const st = STATUS[reg.status] || STATUS.pending;
  const [edit, setEdit] = useState(false);
  const fromReg = () => ({ status: reg.status, registeredDate: reg.registeredDate || '', endedDate: reg.endedDate || '', note: reg.note || '' });
  const [f, setF] = useState(fromReg);
  const openEdit = () => { setF(fromReg()); setEdit(true); };
  const [busy, setBusy] = useState(false);
  const hospital = hospitals.find((h) => h.id === reg.hospitalId);
  const [showHosp, setShowHosp] = useState(false);
  const [history, setHistory] = useState(null);

  const save = async () => {
    if (f.status === 'ended' && !f.endedDate) { alert('สถานะ "สิ้นสุดแล้ว" ต้องใส่วันสิ้นสุด'); return; }
    if (f.status === 'active' && !f.registeredDate) {
      if (!confirm('ยังไม่ได้ใส่วันขึ้นทะเบียน — บันทึกเป็น "มีสิทธิ์" เลยไหม? (จะขึ้นในรายการ "ข้อมูลไม่ครบ")')) return;
    }
    setBusy(true);
    const ok = await sso.updateRegistration(reg.id, {
      status: f.status,
      registeredDate: f.registeredDate || null,
      endedDate: f.status === 'ended' ? f.endedDate : null,
      note: f.note.trim() || null,
    });
    setBusy(false);
    if (ok) { setEdit(false); onChanged(); }
  };

  const loadHistory = async () => setHistory(await sso.hospitalHistory(reg.id));

  return (
    <div className="rounded-lg border border-stone-200 p-3 bg-white">
      <div className="flex items-center gap-2 flex-wrap">
        <Shield className="w-4 h-4 text-stone-500" />
        <span className="text-sm font-medium text-stone-800">{bizName}</span>
        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${st.cls}`}>{st.label}</span>
        <div className="flex-1" />
        {!edit && <button onClick={openEdit} className="text-xs text-emerald-700 hover:underline">แก้ไข</button>}
      </div>

      {!edit ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
          <div><div className="text-stone-500">ขึ้นทะเบียน</div><div className={reg.registeredDate ? 'text-stone-800' : 'text-amber-700'}>{reg.registeredDate ? thDate(reg.registeredDate) : 'ยังไม่ใส่'}</div></div>
          <div className="col-span-2 sm:col-span-2"><div className="text-stone-500">โรงพยาบาล</div><div className={hospital ? 'text-stone-800' : 'text-amber-700'}>{hospital?.name || 'ยังไม่เลือก'}</div></div>
          <div><div className="text-stone-500">สิ้นสุด</div><div className="text-stone-800">{thDate(reg.endedDate)}</div></div>
          {reg.note && <div className="col-span-2 sm:col-span-4 text-stone-500">{reg.note}</div>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-xs">
          <label className="block"><span className="text-stone-500">สถานะ</span>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, endedDate: e.target.value === 'ended' ? (f.endedDate || todayBkk()) : f.endedDate })} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg bg-white">
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-stone-500">วันขึ้นทะเบียน {f.registeredDate && <span className="text-stone-400">({thDate(f.registeredDate)})</span>}</span>
            <input type="date" value={f.registeredDate} onChange={(e) => setF({ ...f, registeredDate: e.target.value })} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" />
          </label>
          {f.status === 'ended' && (
            <label className="block"><span className="text-stone-500">วันสิ้นสุด {f.endedDate && <span className="text-stone-400">({thDate(f.endedDate)})</span>}</span>
              <input type="date" value={f.endedDate} onChange={(e) => setF({ ...f, endedDate: e.target.value })} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" />
            </label>
          )}
          <label className="block sm:col-span-2"><span className="text-stone-500">หมายเหตุ</span>
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" />
          </label>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button onClick={() => { setEdit(false); setF(fromReg()); }} className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded-lg">ยกเลิก</button>
            <button onClick={save} disabled={busy} className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg">บันทึก</button>
          </div>
        </div>
      )}

      {/* โรงพยาบาล */}
      <div className="mt-3 pt-2 border-t border-stone-100 flex items-center gap-3 flex-wrap text-xs">
        <button onClick={() => setShowHosp((v) => !v)} className="flex items-center gap-1 text-emerald-700 hover:underline"><Hospital className="w-3.5 h-3.5" />{hospital ? 'เปลี่ยนโรงพยาบาล' : 'เลือกโรงพยาบาล'}</button>
        <button onClick={loadHistory} className="flex items-center gap-1 text-stone-500 hover:underline"><History className="w-3.5 h-3.5" />ประวัติ รพ.</button>
      </div>
      {showHosp && <HospitalPicker reg={reg} hospitals={hospitals} onDone={() => { setShowHosp(false); setHistory(null); onChanged(); }} />}
      {history && (
        <div className="mt-2 text-xs text-stone-600 space-y-0.5">
          {history.length === 0 ? <div className="text-stone-400">ยังไม่มีประวัติ</div> : history.map((h) => (
            <div key={h.id}>{thDate(h.effectiveFrom)} · {hospitals.find((x) => x.id === h.hospitalId)?.name || '—'}{h.note ? ` · ${h.note}` : ''}</div>
          ))}
        </div>
      )}

      {/* เอกสาร */}
      <DocSection reg={reg} docs={docs} isOwner={isOwner} onChanged={onDocsChanged} />
    </div>
  );
}

function HospitalPicker({ reg, hospitals, onDone }) {
  const active = hospitals.filter((h) => h.isActive !== false);
  const [hid, setHid] = useState(reg.hospitalId || '');
  const [newName, setNewName] = useState('');
  const [newProv, setNewProv] = useState('');
  const [eff, setEff] = useState(todayBkk());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    let id = hid;
    if (id === '__new__') {
      const h = await sso.addHospital(newName, newProv);
      if (!h) { setBusy(false); return; }
      id = h.id;
    }
    if (!id) { setBusy(false); alert('เลือกโรงพยาบาลก่อน'); return; }
    const ok = await sso.changeHospital(reg.id, id, eff, note);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="mt-2 p-2.5 bg-stone-50 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
      <label className="block sm:col-span-2"><span className="text-stone-500">โรงพยาบาล</span>
        <select value={hid} onChange={(e) => setHid(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg bg-white">
          <option value="">— เลือก —</option>
          {active.map((h) => <option key={h.id} value={h.id}>{h.name}{h.province ? ` (${h.province})` : ''}</option>)}
          <option value="__new__">+ เพิ่มโรงพยาบาลใหม่</option>
        </select>
      </label>
      {hid === '__new__' && (
        <>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อโรงพยาบาล" className="px-2 py-1.5 border border-stone-300 rounded-lg" />
          <input value={newProv} onChange={(e) => setNewProv(e.target.value)} placeholder="จังหวัด (ไม่บังคับ)" className="px-2 py-1.5 border border-stone-300 rounded-lg" />
        </>
      )}
      <label className="block"><span className="text-stone-500">มีผลตั้งแต่</span>
        <input type="date" value={eff} onChange={(e) => setEff(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" />
      </label>
      <label className="block"><span className="text-stone-500">หมายเหตุ</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น เปลี่ยนรอบประจำปี" className="w-full mt-0.5 px-2 py-1.5 border border-stone-300 rounded-lg" />
      </label>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button onClick={onDone} className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded-lg">ยกเลิก</button>
        <button onClick={submit} disabled={busy} className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg">บันทึก</button>
      </div>
    </div>
  );
}

function DocSection({ reg, docs, isOwner, onChanged }) {
  const [kind, setKind] = useState('sso_1_03');
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    const path = await uploadDocument(file, reg.businessId, `sso-${kind}`);
    if (path && await sso.addDocument(reg.id, kind, path, file.name)) onChanged();
    setBusy(false);
  };
  const open = async (d) => {
    const url = await getDocumentUrl(d.storagePath);
    if (url) window.open(url, '_blank', 'noopener');
    else alert('เปิดไฟล์ไม่ได้ (เปิดดูได้เฉพาะเจ้าของ)');
  };
  const remove = async (d) => {
    if (!confirm(`ลบเอกสาร "${docLabel(d.kind)}"?`)) return;
    if (await sso.deleteDocument(d.id)) { await deleteDocument(d.storagePath); onChanged(); }
  };
  return (
    <div className="mt-3 pt-2 border-t border-stone-100 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="w-3.5 h-3.5 text-stone-500" />
        <span className="text-stone-600 font-medium">เอกสาร ({docs.length})</span>
        <div className="flex-1" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="px-2 py-1 border border-stone-300 rounded-lg bg-white">
          {DOC_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className={`flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-300 text-emerald-700 cursor-pointer hover:bg-emerald-50 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload className="w-3.5 h-3.5" />{busy ? 'กำลังอัป...' : 'อัปโหลด'}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {docs.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 px-2 py-1 bg-stone-50 rounded">
              <span className="text-stone-700">{docLabel(d.kind)}</span>
              <span className="text-stone-400 truncate">{d.fileName || ''} · {thDate(d.uploadedAt)}</span>
              <div className="flex-1" />
              {isOwner && <button onClick={() => open(d)} className="text-emerald-700 hover:underline">เปิด</button>}
              {isOwner && <button onClick={() => remove(d)} className="text-red-600 hover:bg-red-50 rounded p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          {!isOwner && <div className="text-[11px] text-stone-400">เปิดดูไฟล์ได้เฉพาะเจ้าของ</div>}
        </div>
      )}
    </div>
  );
}

export { SsoPanel, STATUS as SSO_STATUS, docLabel as ssoDocLabel };
