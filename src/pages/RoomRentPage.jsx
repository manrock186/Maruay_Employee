import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, X, Calendar, KeyRound, Check } from 'lucide-react';
import { dispName, isActive } from '../lib/format.js';
import { MONTH_NAMES, payMonthLabel, fmtMoney, fmt } from '../lib/payroll.js';
import { roomTotal, roomUnits, roomRentMapFromPool } from '../lib/pools.js';
import { FormField, EmptyState, PageHeader } from '../ui/index.jsx';

// ============ ROOM RENT PAGE (ค่าห้องพนักงานจากมิเตอร์) ============
function RoomRentPage({ businesses, employees, activeBusinessId, ops }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rooms, setRooms] = useState([]);
  const [prevDate, setPrevDate] = useState('');
  const [currDate, setCurrDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [carried, setCarried] = useState(false);

  // ค่าห้องเป็นส่วนกลางของทุกธุรกิจ — ผูกได้กับพนักงานทุกคนที่ยังทำงานอยู่ (ไม่ว่าสังกัดธุรกิจไหน)
  const allEmployees = useMemo(() => employees.filter((e) => isActive(e)), [employees]);
  const bizName = (e) => businesses.find((b) => b.id === e.businessId)?.name || '';
  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? dispName(e) : '— ไม่พบ —'; };
  const newRoom = () => ({ id: `r${Date.now()}${Math.floor(Math.random() * 1000)}`, floor: '', roomNo: '', occupantText: '', occupantIds: [], rent: '', waterFlat: '', elecRate: 7, meterPrev: '', meterCurr: '', note: '' });
  const mapRoom = (r) => ({ ...newRoom(), ...r, occupantText: r.occupantText ?? r.label ?? '', rent: r.rent != null ? r.rent : (r.fixedExtra ?? '') });

  useEffect(() => {
    let cancelled = false;
    setCarried(false);
    (async () => {
      const pool = await ops.roomRent.getByPeriod(year, month);
      if (cancelled) return;
      if (pool) {
        setRooms((pool.rooms || []).map(mapRoom));
        setPrevDate(pool.prevDate || ''); setCurrDate(pool.currDate || '');
        setNote(pool.note || ''); setSavedAt(pool.updatedAt || pool.createdAt || null);
        return;
      }
      const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
      const prevPool = await ops.roomRent.getByPeriod(prev.y, prev.m);
      if (cancelled) return;
      if (prevPool && (prevPool.rooms || []).length) {
        setRooms(prevPool.rooms.map((r) => ({ ...mapRoom(r), meterPrev: r.meterCurr ?? '', meterCurr: '' })));
        setPrevDate(prevPool.currDate || ''); setCurrDate('');
        setCarried(true);
      } else { setRooms([]); setPrevDate(''); setCurrDate(''); }
      setNote(''); setSavedAt(null);
    })();
    return () => { cancelled = true; };
  }, [year, month]);

  const setRoom = (id, patch) => setRooms((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));
  const addRoom = () => setRooms((rs) => [...rs, newRoom()]);
  const rmRoom = (id) => setRooms((rs) => rs.filter((r) => r.id !== id));
  const addOccupant = (roomId, empId) => { if (!empId) return; setRooms((rs) => rs.map((r) => r.id === roomId && !r.occupantIds.includes(empId) ? { ...r, occupantIds: [...r.occupantIds, empId] } : r)); };
  const rmOccupant = (roomId, empId) => setRooms((rs) => rs.map((r) => r.id === roomId ? { ...r, occupantIds: r.occupantIds.filter((x) => x !== empId) } : r));

  const grandTotal = rooms.reduce((s, r) => s + roomTotal(r), 0);
  const perEmp = roomRentMapFromPool({ rooms });

  const save = async () => {
    setSaving(true);
    const clean = rooms.map((r) => ({
      id: r.id, floor: r.floor || '', roomNo: r.roomNo || '', occupantText: r.occupantText || '',
      occupantIds: r.occupantIds || [], rent: Number(r.rent) || 0, waterFlat: Number(r.waterFlat) || 0,
      elecRate: Number(r.elecRate) || 0, meterPrev: Number(r.meterPrev) || 0, meterCurr: Number(r.meterCurr) || 0, note: r.note || '',
    }));
    const ok = await ops.roomRent.upsert({ periodYear: year, periodMonth: month, rooms: clean, prevDate: prevDate || null, currDate: currDate || null, note: note.trim() || null });
    setSaving(false);
    if (ok) { setSavedAt(new Date().toISOString()); setCarried(false); alert('บันทึกค่าห้องแล้ว — ยอดของผู้พักที่ผูกพนักงานไว้ จะไปขึ้นช่องค่าห้องในหน้าเงินเดือนงวดเดียวกันอัตโนมัติ'); }
  };

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  const cellInput = "w-full px-2 py-1.5 border border-stone-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-emerald-500/40";

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ค่าห้องพนักงาน" subtitle={`ส่วนกลาง — ทุกธุรกิจ • งวด ${MONTH_NAMES[month - 1]} ${year + 543} (จ่าย ${payMonthLabel(year, month)})`}>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium"><Check className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกค่าห้อง'}</button>
      </PageHeader>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-sm"><span className="text-stone-500">วันจดมิเตอร์ครั้งก่อน</span><input type="date" value={prevDate} onChange={(e) => setPrevDate(e.target.value)} className="px-2 py-1.5 border border-stone-300 rounded-lg" /></div>
          <div className="flex items-center gap-1.5 text-sm"><span className="text-stone-500">ปัจจุบัน</span><input type="date" value={currDate} onChange={(e) => setCurrDate(e.target.value)} className="px-2 py-1.5 border border-stone-300 rounded-lg" /></div>
          {savedAt && <span className="text-xs text-stone-400">บันทึกล่าสุด {fmt(savedAt)}</span>}
        </div>

        {carried && (
          <div className="flex items-start gap-2 p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-800">
            <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>ดึงรายการห้อง + เลขมิเตอร์เดือนก่อนมาให้แล้ว — <b>มิเตอร์ครั้งก่อน</b> เติมจากเลขล่าสุดอัตโนมัติ ใส่แค่เลขมิเตอร์ปัจจุบัน แล้วบันทึก</span>
          </div>
        )}

        {rooms.length === 0 ? (
          <EmptyState icon={KeyRound} title="ยังไม่มีห้อง" description="เพิ่มห้อง กรอกชั้น/เลขที่/ผู้พัก + เลขมิเตอร์ ระบบคิดค่าไฟ (หน่วย×เรต) + เหมาน้ำให้" action={<button onClick={addRoom} className="px-4 py-2 bg-emerald-900 text-white rounded-lg text-sm font-medium">เพิ่มห้องแรก</button>} />
        ) : (
          <div className="overflow-x-auto border border-stone-200 rounded-xl bg-white">
            <table className="text-sm min-w-[1180px] w-full">
              <thead>
                <tr className="bg-stone-50 text-xs text-stone-500 border-b border-stone-200">
                  <th className="px-2 py-2 font-medium w-14">ชั้น</th>
                  <th className="px-2 py-2 font-medium w-16">เลขที่</th>
                  <th className="px-2 py-2 font-medium text-left min-w-[200px]">ผู้พัก</th>
                  <th className="px-2 py-2 font-medium w-24">ค่าเช่า</th>
                  <th className="px-2 py-2 font-medium w-24">ค่าน้ำเหมา</th>
                  <th className="px-2 py-2 font-medium w-28">มิเตอร์ก่อน{prevDate ? <div className="font-normal text-[10px]">{fmt(prevDate)}</div> : null}</th>
                  <th className="px-2 py-2 font-medium w-28">มิเตอร์ปัจจุบัน{currDate ? <div className="font-normal text-[10px]">{fmt(currDate)}</div> : null}</th>
                  <th className="px-2 py-2 font-medium w-16">ใช้ไป</th>
                  <th className="px-2 py-2 font-medium w-16">/หน่วย</th>
                  <th className="px-2 py-2 font-medium w-24">ค่าไฟรวม</th>
                  <th className="px-2 py-2 font-medium w-28">สรุปค่าเช่า</th>
                  <th className="px-2 py-2 font-medium text-left min-w-[140px]">หมายเหตุ</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => {
                  const units = roomUnits(r);
                  const elec = units * (Number(r.elecRate) || 0);
                  const total = roomTotal(r);
                  const occ = (r.occupantIds || []).filter(Boolean);
                  const share = occ.length ? total / occ.length : 0;
                  const available = allEmployees.filter((e) => !occ.includes(e.id));
                  return (
                    <tr key={r.id} className="border-b border-stone-100 align-top">
                      <td className="px-2 py-2"><input value={r.floor} onChange={(e) => setRoom(r.id, { floor: e.target.value })} className="w-full px-2 py-1.5 border border-stone-200 rounded text-center" /></td>
                      <td className="px-2 py-2"><input value={r.roomNo} onChange={(e) => setRoom(r.id, { roomNo: e.target.value })} className="w-full px-2 py-1.5 border border-stone-200 rounded text-center" /></td>
                      <td className="px-2 py-2">
                        <input value={r.occupantText} onChange={(e) => setRoom(r.id, { occupantText: e.target.value })} className="w-full px-2 py-1.5 border border-stone-200 rounded" placeholder="เช่น 2 คน / ว่าง" />
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {occ.map((id) => (
                            <span key={id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] rounded">{empName(id)}<button onClick={() => rmOccupant(r.id, id)}><X className="w-2.5 h-2.5" /></button></span>
                          ))}
                          {available.length > 0 && (
                            <select value="" onChange={(e) => { addOccupant(r.id, e.target.value); e.target.value = ''; }} className="text-[11px] px-1 py-0.5 border border-stone-200 rounded bg-white text-stone-500">
                              <option value="">+ ผูกเงินเดือน</option>
                              {available.map((e) => <option key={e.id} value={e.id}>{dispName(e)}{bizName(e) ? ` · ${bizName(e)}` : ''}</option>)}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={r.rent} onChange={(e) => setRoom(r.id, { rent: e.target.value })} className={cellInput} placeholder="0" /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={r.waterFlat} onChange={(e) => setRoom(r.id, { waterFlat: e.target.value })} className={cellInput} placeholder="0" /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={r.meterPrev} onChange={(e) => setRoom(r.id, { meterPrev: e.target.value })} className={cellInput} placeholder="0" /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={r.meterCurr} onChange={(e) => setRoom(r.id, { meterCurr: e.target.value })} className={cellInput} placeholder="0" /></td>
                      <td className="px-2 py-2 text-right text-stone-600">{units}</td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={r.elecRate} onChange={(e) => setRoom(r.id, { elecRate: e.target.value })} className={cellInput} placeholder="7" /></td>
                      <td className="px-2 py-2 text-right text-stone-600">{fmtMoney(elec)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-emerald-800">{fmtMoney(total)}{occ.length > 1 ? <div className="text-[10px] font-normal text-stone-400">คนละ {fmtMoney(share)}</div> : null}</td>
                      <td className="px-2 py-2"><input value={r.note} onChange={(e) => setRoom(r.id, { note: e.target.value })} className="w-full px-2 py-1.5 border border-stone-200 rounded" placeholder="เช่น แจ้งหัวหน้าโซนแล้ว" /></td>
                      <td className="px-2 py-2"><button onClick={() => rmRoom(r.id)} className="p-1 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50 font-semibold text-stone-800 border-t-2 border-stone-200">
                  <td colSpan={10} className="px-2 py-2 text-right">รวมค่าห้องทั้งหมด</td>
                  <td className="px-2 py-2 text-right text-emerald-800">{fmtMoney(grandTotal)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {rooms.length > 0 && (
          <button onClick={addRoom} className="w-full py-2.5 border-2 border-dashed border-stone-300 rounded-xl text-sm text-stone-500 hover:border-emerald-400 hover:text-emerald-700 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />เพิ่มห้อง</button>
        )}

        {Object.keys(perEmp).length > 0 && (
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="text-sm font-medium text-stone-700 mb-2">ยอดที่จะหักเข้าเงินเดือน (เฉพาะผู้พักที่ผูกพนักงานไว้)</div>
            <div className="text-xs text-stone-500 space-y-0.5">
              {Object.entries(perEmp).map(([id, amt]) => (
                <div key={id} className="flex justify-between"><span>{empName(id)}</span><span>{fmtMoney(amt)} ฿</span></div>
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-3">ยอดนี้จะไปขึ้นช่อง "ค่าห้องพัก" ในหน้าเงินเดือนงวดเดียวกันอัตโนมัติ (เฉพาะงวดที่ยังไม่ได้ทำ) — ผู้พักที่กรอกแค่ชื่อ (ไม่ผูกพนักงาน) จะถูกบันทึกไว้เฉยๆ ไม่หักเข้าเงินเดือน</p>
          </div>
        )}

        <FormField label="หมายเหตุงวดนี้"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg resize-none max-w-2xl" /></FormField>
      </div>
    </div>
  );
}


export {
  RoomRentPage,
};
