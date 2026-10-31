import { useState, useEffect, useCallback } from 'react';
import { supabase, fromDB, toDB } from '../supabase.js';

// ============ ประกันสังคม — อ่าน/เขียน DB ============
// ตาราง: sso_rates · sso_hospitals · employee_sso (ทะเบียนต่อพนักงาน×ธุรกิจ) · employee_sso_hospital_changes · employee_sso_documents
// employees.has_social_security = trigger เขียนให้จาก employee_sso — ห้ามเขียนตรง
// RLS: เจ้าของทั้งหมด · คนมีสิทธิ์เงินเดือน (can_manage_payroll) เฉพาะธุรกิจของตัวเอง

const todayBkk = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

const fail = (msg, error) => { alert(`${msg}: ${error.message}`); return null; };

const sso = {
  async loadAll() {
    const [r, g, h] = await Promise.all([
      supabase.from('sso_rates').select('*').order('effective_from'),
      supabase.from('employee_sso').select('*'),
      supabase.from('sso_hospitals').select('*').order('name'),
    ]);
    const err = r.error || g.error || h.error;
    if (err) { console.error('sso load error:', err); return { ok: false, rates: [], regs: [], hospitals: [] }; }
    return { ok: true, rates: fromDB(r.data || []), regs: fromDB(g.data || []), hospitals: fromDB(h.data || []) };
  },

  // ---------- ทะเบียน ----------
  async addRegistration(d) {
    const { data, error } = await supabase.from('employee_sso').insert(toDB(d)).select().single();
    return error ? fail('เพิ่มทะเบียนประกันสังคมไม่สำเร็จ', error) : fromDB(data);
  },
  async updateRegistration(id, d) {
    const { data, error } = await supabase.from('employee_sso')
      .update(toDB({ ...d, updatedAt: new Date().toISOString() })).eq('id', id).select();
    if (error) return fail('แก้ทะเบียนประกันสังคมไม่สำเร็จ', error);
    if (!data?.length) { alert('แก้ทะเบียนไม่สำเร็จ: ไม่มีสิทธิ์ หรือข้อมูลถูกลบไปแล้ว'); return null; }
    return fromDB(data[0]);
  },

  // ติ๊ก/เอาติ๊ก "มีประกันสังคม" ในฟอร์มพนักงาน → สร้าง/ปิดทะเบียนที่ธุรกิจหลัก
  async setEnrollment(employeeId, businessId, want) {
    const { data, error } = await supabase.from('employee_sso').select('*').eq('employee_id', employeeId);
    if (error) return fail('อ่านทะเบียนประกันสังคมไม่สำเร็จ', error);
    const regs = fromDB(data || []);
    if (want) {
      const here = regs.find((r) => r.businessId === businessId);
      if (!here) return sso.addRegistration({ employeeId, businessId, status: 'pending' });
      if (here.status === 'ended') return sso.updateRegistration(here.id, { status: 'pending', endedDate: null });
      return here;
    }
    for (const r of regs.filter((x) => x.status !== 'ended')) {
      // ติ๊กผิด (ยังรอขึ้นทะเบียน ไม่มีวันขึ้นทะเบียน ไม่มีเอกสาร/รพ.) → ลบทิ้ง ไม่ให้หักเดือนนี้ + ไม่เตือน สปส.6-09
      if (r.status === 'pending' && !r.registeredDate && !r.hospitalId && await sso.isEmpty(r.id)) {
        const { error: delErr } = await supabase.from('employee_sso').delete().eq('id', r.id);
        if (!delErr) continue;
      }
      await sso.updateRegistration(r.id, { status: 'ended', endedDate: todayBkk() });
    }
    return true;
  },

  // ไม่มีเอกสาร + ไม่มีประวัติ รพ. (ลบได้โดยไม่เสียข้อมูล)
  async isEmpty(regId) {
    const [d, h] = await Promise.all([
      supabase.from('employee_sso_documents').select('id', { count: 'exact', head: true }).eq('employee_sso_id', regId),
      supabase.from('employee_sso_hospital_changes').select('id', { count: 'exact', head: true }).eq('employee_sso_id', regId),
    ]);
    return !d.error && !h.error && (d.count || 0) === 0 && (h.count || 0) === 0;
  },

  // ลาออก → ปิดทะเบียนที่ยังเปิดทุกธุรกิจ (วันสิ้นสุด = วันลาออก)
  async endAllForEmployee(employeeId, endedDate) {
    const { data, error } = await supabase.from('employee_sso').select('id, status').eq('employee_id', employeeId).neq('status', 'ended');
    if (error) return fail('อ่านทะเบียนประกันสังคมไม่สำเร็จ', error);
    for (const r of data || []) await sso.updateRegistration(r.id, { status: 'ended', endedDate: endedDate || todayBkk() });
    return (data || []).length;
  },

  // ---------- โรงพยาบาล ----------
  async addHospital(name, province) {
    const n = (name || '').trim();
    if (!n) return null;
    const { data, error } = await supabase.from('sso_hospitals').insert({ name: n, province: (province || '').trim() || null }).select().single();
    return error ? fail('เพิ่มโรงพยาบาลไม่สำเร็จ (ชื่อซ้ำ?)', error) : fromDB(data);
  },
  // เปลี่ยน รพ. → บันทึกประวัติ + ตั้งค่าที่ทะเบียน
  async changeHospital(regId, hospitalId, effectiveFrom, note) {
    const { error } = await supabase.from('employee_sso_hospital_changes')
      .insert({ employee_sso_id: regId, hospital_id: hospitalId, effective_from: effectiveFrom || todayBkk(), note: (note || '').trim() || null });
    if (error) return fail('บันทึกประวัติเปลี่ยนโรงพยาบาลไม่สำเร็จ', error);
    return sso.updateRegistration(regId, { hospitalId });
  },
  async hospitalHistory(regId) {
    const { data, error } = await supabase.from('employee_sso_hospital_changes').select('*').eq('employee_sso_id', regId).order('effective_from', { ascending: false });
    if (error) { console.error(error); return []; }
    return fromDB(data || []);
  },

  // ---------- เอกสาร ----------
  async listDocuments(regIds) {
    if (!regIds?.length) return [];
    const { data, error } = await supabase.from('employee_sso_documents').select('*').in('employee_sso_id', regIds).order('uploaded_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return fromDB(data || []);
  },
  async addDocument(regId, kind, storagePath, fileName) {
    const { data, error } = await supabase.from('employee_sso_documents')
      .insert({ employee_sso_id: regId, kind, storage_path: storagePath, file_name: fileName || null }).select().single();
    return error ? fail('บันทึกเอกสารไม่สำเร็จ', error) : fromDB(data);
  },
  async deleteDocument(id) {
    const { error } = await supabase.from('employee_sso_documents').delete().eq('id', id);
    if (error) { fail('ลบเอกสารไม่สำเร็จ', error); return false; }
    return true;
  },

  // ---------- เรท + ตั้งค่าธุรกิจ (เจ้าของ) ----------
  async addRate(d) {
    const { data, error } = await supabase.from('sso_rates').insert(toDB(d)).select().single();
    return error ? fail('เพิ่มเรทไม่สำเร็จ', error) : fromDB(data);
  },

  // ---------- เงินเดือน ----------
  // งวดของทุกธุรกิจที่มองเห็น (หน้ารายงาน)
  async payrollsForPeriod(businessId, year, month) {
    const { data, error } = await supabase.from('payrolls')
      .select('id, employee_id, business_id, base_salary, commission, social_security, social_security_employer, social_security_wage_base, status, updated_at')
      .eq('business_id', businessId).eq('period_year', year).eq('period_month', month);
    if (error) { console.error(error); return null; }
    return fromDB(data || []);
  },
  async updatePayrollSso(id, c) {
    const { data, error } = await supabase.from('payrolls')
      .update({ social_security: c.employee, social_security_employer: c.employer, social_security_wage_base: c.wageBase, updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'draft').select('id');
    if (error) { console.error(error); return false; }
    return (data || []).length === 1;
  },
};

// hook: โหลดเรท + ทะเบียน + รพ. ครั้งเดียว · reload() หลังแก้
function useSso() {
  const [state, setState] = useState({ loading: true, ok: true, rates: [], regs: [], hospitals: [] });
  const reload = useCallback(async () => {
    const r = await sso.loadAll();
    setState({ loading: false, ...r });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export { sso, useSso, todayBkk };
