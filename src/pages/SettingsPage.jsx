import React, { useState, useEffect } from 'react';
import { Calendar, Save, CheckCircle2, BellRing } from 'lucide-react';
import { FormField, PageHeader } from '../ui/index.jsx';

// ============ SETTINGS PAGE ============
function SettingsPage({ expiryWarnMonths, birthdayNotify, birthdayWarnDays, ops, onSaved, onSavedBirthday }) {
  const [months, setMonths] = useState(expiryWarnMonths ?? 2);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => { setMonths(expiryWarnMonths ?? 2); }, [expiryWarnMonths]);

  // วันเกิด
  const [bdayOn, setBdayOn] = useState(birthdayNotify ?? true);
  const [bdayDays, setBdayDays] = useState(birthdayWarnDays ?? 7);
  const [savingB, setSavingB] = useState(false);
  const [savedBAt, setSavedBAt] = useState(0);
  useEffect(() => { setBdayOn(birthdayNotify ?? true); setBdayDays(birthdayWarnDays ?? 7); }, [birthdayNotify, birthdayWarnDays]);

  const clamp = (n) => Math.min(12, Math.max(1, Math.round(Number(n) || 1)));
  const dirty = clamp(months) !== (expiryWarnMonths ?? 2);
  const clampD = (n) => Math.min(60, Math.max(0, Math.round(Number(n) || 0)));
  const dirtyB = bdayOn !== (birthdayNotify ?? true) || clampD(bdayDays) !== (birthdayWarnDays ?? 7);

  const save = async () => {
    const m = clamp(months);
    setSaving(true);
    const ok = await ops.settings.update({ expiryWarnMonths: m });
    setSaving(false);
    if (ok) { setMonths(m); onSaved?.(m); setSavedAt(Date.now()); }
  };
  const saveBirthday = async () => {
    const d = clampD(bdayDays);
    setSavingB(true);
    const ok = await ops.settings.update({ birthdayNotifyEnabled: bdayOn, birthdayWarnDays: d });
    setSavingB(false);
    if (ok) { setBdayDays(d); onSavedBirthday?.(bdayOn, d); setSavedBAt(Date.now()); }
  };

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ตั้งค่า" subtitle="ตั้งค่าที่มีผลกับทั้งระบบ" />
      <div className="p-8 max-w-2xl space-y-5">
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center"><BellRing className="w-5 h-5 text-red-600" /></div>
            <h3 className="font-semibold text-stone-800">แจ้งเตือนเอกสารใกล้หมดอายุ</h3>
          </div>
          <p className="text-sm text-stone-500 mb-5">เตือนล่วงหน้าก่อนเอกสารหมดอายุ — มีผลกับบัตรแรงงาน, พาสปอร์ต และบัตรประจำตัว ของพนักงานทุกคนทั้งระบบ</p>

          <FormField label="เตือนก่อนหมดอายุ (เดือน)">
            <div className="flex flex-wrap items-center gap-2">
              {[1, 2, 3, 6].map((m) => (
                <button key={m} type="button" onClick={() => setMonths(m)} className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${clamp(months) === m ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-stone-200 text-stone-600 hover:border-stone-300'}`}>{m} เดือน</button>
              ))}
              <div className="flex items-center gap-2 ml-1">
                <span className="text-sm text-stone-400">หรือกำหนดเอง</span>
                <input type="number" min={1} max={12} value={months} onChange={(e) => setMonths(e.target.value)} className="w-20 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 text-center" />
                <span className="text-sm text-stone-500">เดือน</span>
              </div>
            </div>
          </FormField>

          <p className="text-xs text-stone-500 mt-3">ระบบจะแจ้งเตือนเมื่อเอกสารเหลืออายุไม่เกิน {clamp(months)} เดือน หรือหมดอายุไปแล้ว (ตั้งได้ 1–12 เดือน)</p>

          <div className="flex items-center gap-3 mt-6">
            <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-200 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
              <Save className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            {savedAt > 0 && !dirty && <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" />บันทึกแล้ว</span>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-pink-100 flex items-center justify-center"><Calendar className="w-5 h-5 text-pink-600" /></div>
              <h3 className="font-semibold text-stone-800">แจ้งเตือนวันเกิดพนักงาน</h3>
            </div>
            <button type="button" onClick={() => setBdayOn((v) => !v)} className={`relative w-12 h-7 rounded-full transition-colors ${bdayOn ? 'bg-emerald-600' : 'bg-stone-300'}`} aria-label="เปิด/ปิดแจ้งเตือนวันเกิด">
              <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${bdayOn ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <p className="text-sm text-stone-500 mb-5">แจ้งเตือนวันเกิดของพนักงานทุกคนทั้งระบบ — แยกจากการเตือนเอกสารหมดอายุ</p>

          <div className={bdayOn ? '' : 'opacity-40 pointer-events-none'}>
            <FormField label="เตือนล่วงหน้า (วัน)">
              <div className="flex flex-wrap items-center gap-2">
                {[0, 1, 3, 7].map((d) => (
                  <button key={d} type="button" onClick={() => setBdayDays(d)} className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${clampD(bdayDays) === d ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-stone-200 text-stone-600 hover:border-stone-300'}`}>{d === 0 ? 'เฉพาะวันเกิด' : `${d} วัน`}</button>
                ))}
                <div className="flex items-center gap-2 ml-1">
                  <span className="text-sm text-stone-400">หรือกำหนดเอง</span>
                  <input type="number" min={0} max={60} value={bdayDays} onChange={(e) => setBdayDays(e.target.value)} className="w-20 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 text-center" />
                  <span className="text-sm text-stone-500">วัน</span>
                </div>
              </div>
            </FormField>
            <p className="text-xs text-stone-500 mt-3">{clampD(bdayDays) === 0 ? 'แจ้งเตือนเฉพาะวันเกิดเท่านั้น' : `แจ้งเตือนล่วงหน้า ${clampD(bdayDays)} วันก่อนวันเกิด`} (ตั้งได้ 0–60 วัน)</p>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button onClick={saveBirthday} disabled={savingB || !dirtyB} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-200 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
              <Save className="w-4 h-4" />{savingB ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            {savedBAt > 0 && !dirtyB && <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" />บันทึกแล้ว</span>}
          </div>
        </div>

        <p className="text-xs text-stone-400">หมายเหตุ: การแจ้งเตือนจะอัปเดตเมื่อเจ้าของระบบเปิดแอป (ระบบ generate ฝั่งเจ้าของ) — ค่าที่ตั้งมีผลกับทั้งระบบทันทีหลังบันทึก</p>
      </div>
    </div>
  );
}



export {
  SettingsPage,
};
