import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users, Building2, MapPin, Briefcase, Settings, LogOut,
  Plus, Edit2, Trash2, Search, X, Upload, ChevronRight,
  Home, UserCircle, Shield, Layers, Camera, Calendar, Phone, Mail,
  Eye, EyeOff, Network, Save, ChevronDown, ChevronUp, User,
  KeyRound, AlertCircle, CheckCircle2, Crown, Award, MapPinned, Clock,
  Globe, CreditCard, BookOpen, FileText, ExternalLink, Paperclip,
  Wallet, Banknote, Calculator, Receipt, Minus, TrendingUp, TrendingDown, Bell, BellRing, Check, CheckCheck, Hash
} from 'lucide-react';
import { supabase, fromDB, toDB } from './supabase.js';

// ============ DISPLAY NAME HELPER ============
// ทุกหน้าให้แสดงชื่อเล่นเป็นหลัก ถ้าไม่มีชื่อเล่นค่อย fallback ใช้ชื่อจริง
const dispName = (e) => (e?.nickname?.trim() || e?.name?.trim() || '');

// ============ NATIONALITY ============
const NATIONALITIES = [
  { value: 'thai',     label: 'ไทย' },
  { value: 'myanmar',  label: 'พม่า' },
  { value: 'cambodia', label: 'กัมพูชา' },
  { value: 'laos',     label: 'ลาว' },
  { value: 'other',    label: 'อื่นๆ' },
];
const natLabel = (v) => NATIONALITIES.find((n) => n.value === v)?.label || (v ? 'อื่นๆ' : '—');
const isForeign = (v) => v && v !== 'thai';

// ============ การลาออก ============
const RESIGN_REASONS = [
  { value: 'voluntary',    label: 'ลาออกเอง' },
  { value: 'terminated',   label: 'เลิกจ้าง' },
  { value: 'contract_end', label: 'หมดสัญญา' },
  { value: 'other',        label: 'อื่นๆ' },
];
const resignLabel = (v) => RESIGN_REASONS.find((r) => r.value === v)?.label || 'อื่นๆ';
const isActive = (e) => (e?.status || 'active') === 'active';

// ============ การปรับเงินเดือน ============
const SALARY_REASONS = [
  { value: 'performance',    label: 'ผลงานดี' },
  { value: 'annual',         label: 'ปรับขั้นประจำปี' },
  { value: 'promotion',      label: 'เลื่อนตำแหน่ง' },
  { value: 'cost_of_living', label: 'ปรับตามค่าครองชีพ' },
  { value: 'other',          label: 'อื่นๆ' },
];
const salaryReasonLabel = (v) => SALARY_REASONS.find((r) => r.value === v)?.label || 'อื่นๆ';
const todayStr = () => new Date().toISOString().slice(0, 10);

// ============ ธีมสี ============
const THEMES = [
  { value: 'default', label: 'ค่าเริ่มต้น', desc: 'เขียว + ทอง',   primary: '#059669', accent: '#f59e0b' },
  { value: 'calm',    label: 'สบายตา',     desc: 'เขียวเทา เย็นตา', primary: '#0d9488', accent: '#f59e0b' },
  { value: 'vibrant', label: 'สีสัน',      desc: 'ม่วง + ชมพู สดใส', primary: '#7c3aed', accent: '#ec4899' },
  { value: 'ocean',   label: 'ฟ้าทะเล',    desc: 'น้ำเงิน + ฟ้า',   primary: '#2563eb', accent: '#06b6d4' },
  { value: 'grape',   label: 'ม่วง',       desc: 'ม่วง + ทอง หรูหรา', primary: '#9333ea', accent: '#f59e0b' },
  { value: 'dark',    label: 'ดาร์กโหมด',  desc: 'พื้นดำ ถนอมสายตา', primary: '#10b981', accent: '#1c1c22', dark: true },
];
const applyTheme = (theme) => {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme || 'default';
};

// ============ PAYROLL HELPERS ============
const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// คำนวณประกันสังคม: 5% ของฐาน สูงสุด 750
const calcSocialSecurity = (baseSalary) => Math.min(Math.round(Number(baseSalary) * 0.05 * 100) / 100, 750);

// คำนวณยอดเงินเดือนสุทธิจากข้อมูล payroll + รายการ items
function computePayroll(p, items = []) {
  const daily = (Number(p.baseSalary) || 0) / 30;
  // รายรับ
  const holidayWorkPay = (Number(p.holidayWorkDays) || 0) * daily;
  const bonusTasks = items.filter((i) => i.kind === 'bonus_task').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalIncome = (Number(p.baseSalary) || 0) + (Number(p.commission) || 0) + holidayWorkPay + bonusTasks;
  // รายการหัก
  const excessDays = Math.max(0, (Number(p.holidayDaysTaken) || 0) - (Number(p.holidayQuota) || 0));
  const excessHolidayDeduction = excessDays * daily;
  const advances = items.filter((i) => i.kind === 'advance').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const otherDeductions = items.filter((i) => i.kind === 'other_deduction').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalDeduction = excessHolidayDeduction + (Number(p.lateDeduction) || 0) + (Number(p.socialSecurity) || 0)
    + (Number(p.roomFee) || 0) + (Number(p.paidViaCompany) || 0) + advances + otherDeductions;
  const net = totalIncome - totalDeduction;
  return { daily, holidayWorkPay, bonusTasks, totalIncome, excessDays, excessHolidayDeduction, advances, otherDeductions, totalDeduction, net };
}

// สร้าง draft ตั้งต้นสำหรับ payroll (จาก payroll เดิม หรือ default จากโปรไฟล์พนักงาน)
function buildPayrollDraft(emp, payroll, items) {
  if (payroll) {
    return {
      baseSalary: payroll.baseSalary ?? 0,
      holidayQuota: payroll.holidayQuota ?? 4,
      commission: payroll.commission ?? 0,
      holidayWorkDays: payroll.holidayWorkDays ?? 0,
      holidayDaysTaken: payroll.holidayDaysTaken ?? 0,
      lateDeduction: payroll.lateDeduction ?? 0,
      socialSecurity: payroll.socialSecurity ?? 0,
      roomFee: payroll.roomFee ?? 0,
      paidViaCompany: payroll.paidViaCompany ?? 0,
      note: payroll.note ?? '',
      status: payroll.status ?? 'draft',
      items: (items || []).map((i) => ({ kind: i.kind, label: i.label, amount: i.amount })),
    };
  }
  return {
    baseSalary: emp.baseSalary ?? 0,
    holidayQuota: emp.holidayQuota ?? 4,
    commission: 0, holidayWorkDays: 0, holidayDaysTaken: 0, lateDeduction: 0,
    socialSecurity: emp.hasSocialSecurity ? calcSocialSecurity(emp.baseSalary) : 0,
    roomFee: emp.roomFee ?? 0,
    paidViaCompany: 0, note: '', status: 'draft', items: [],
  };
}

// detect หน้าจอมือถือ
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ============ FILE UPLOAD HELPERS ============
// Upload เอกสารแรงงาน (รูป/PDF) ไปยัง Supabase Storage
// Path เก็บแบบ: businessId/docType-timestamp-random.ext
async function uploadDocument(file, businessId, docType) {
  if (!file) return null;
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${businessId || 'misc'}/${docType}-${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage.from('employee-docs').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) { alert('อัปโหลดไฟล์ไม่สำเร็จ: ' + error.message); return null; }
  return path;
}

// ลบเอกสารเก่าออกจาก storage
async function deleteDocument(path) {
  if (!path) return;
  await supabase.storage.from('employee-docs').remove([path]);
}

// สร้าง signed URL (expire 1 ชั่วโมง) เพื่อดู/download เอกสาร
async function getDocumentUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('employee-docs').createSignedUrl(path, 3600);
  if (error) { console.error('signed url error:', error); return null; }
  return data.signedUrl;
}

// ============ IMAGE HELPER ============
const resizeImage = (file, maxSize = 400) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > h && w > maxSize) { h = h * (maxSize / w); w = maxSize; }
      else if (h > maxSize) { w = w * (maxSize / h); h = maxSize; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ============ MAIN APP ============
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const [view, setView] = useState('dashboard');
  const [businesses, setBusinesses] = useState([]);
  const [zones, setZones] = useState([]);
  const [positions, setPositions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notiReads, setNotiReads] = useState([]); // [{notificationId, userId}]

  const [activeBusinessId, setActiveBusinessId] = useState(null);
  const [activeZoneId, setActiveZoneId] = useState(null);

  // ---- AUTH ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ---- LOAD PROFILE ----
  useEffect(() => {
    if (!session) { setProfile(null); return; }
    (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error) console.error('Profile load error:', error);
      const p = fromDB(data);
      if (p) {
        p.businessIds = p.businessIds || [];
        p.zoneIds = p.zoneIds || [];
        p.isOwner = p.role === 'owner';
        p.isBM = p.role === 'business_manager';
        p.isZM = p.role === 'zone_manager';
        p.isViewer = p.role === 'viewer';
        p.canWrite = ['owner', 'business_manager', 'zone_manager'].includes(p.role);
      }
      setProfile(p);
      if (p?.theme) applyTheme(p.theme);
    })();
  }, [session]);

  // ---- APPLY THEME เมื่อค่าธีมเปลี่ยน ----
  useEffect(() => { applyTheme(profile?.theme); }, [profile?.theme]);

  // ---- LOAD ALL DATA + REALTIME ----
  useEffect(() => {
    if (!profile || profile.role === 'pending') return;

    let cancelled = false;
    setDataLoading(true);
    (async () => {
      const [b, z, p, e, up, noti, reads] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at'),
        supabase.from('zones').select('*').order('created_at'),
        supabase.from('positions').select('*').order('created_at'),
        supabase.from('employees').select('*').order('created_at'),
        profile.isOwner
          ? supabase.from('user_profiles').select('*, email:id').order('created_at')
          : Promise.resolve({ data: [profile] }),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }),
        supabase.from('notification_reads').select('*'),
      ]);
      if (cancelled) return;
      setBusinesses(fromDB(b.data || []));
      setZones(fromDB(z.data || []));
      setPositions(fromDB(p.data || []));
      setEmployees(fromDB(e.data || []));
      setProfiles(fromDB(up.data || []));
      setNotifications(fromDB(noti.data || []));
      setNotiReads(fromDB(reads.data || []));
      // เลือกธุรกิจเริ่มต้น
      const allBiz = b.data || [];
      const allZones = z.data || [];
      if (!activeBusinessId) {
        if (profile.isOwner) {
          if (allBiz[0]) setActiveBusinessId(allBiz[0].id);
        } else if (profile.isBM && profile.businessIds.length > 0) {
          setActiveBusinessId(profile.businessIds[0]);
        } else if (profile.isZM && profile.zoneIds.length > 0) {
          const zone = allZones.find((zn) => zn.id === profile.zoneIds[0]);
          if (zone) setActiveBusinessId(zone.business_id);
        } else if (allBiz[0]) {
          setActiveBusinessId(allBiz[0].id);
        }
      }
      setDataLoading(false);

      // ---- auto-apply การปรับเงินเดือนที่ถึงกำหนด (owner เท่านั้น) ----
      if (profile.isOwner) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: pending } = await supabase.from('salary_changes')
          .select('*').eq('status', 'pending').lte('effective_date', today);
        if (pending && pending.length > 0 && !cancelled) {
          for (const sc of pending) {
            // อัปเดต base_salary ของพนักงานเป็นค่าใหม่
            await supabase.from('employees').update({ base_salary: sc.new_salary }).eq('id', sc.employee_id);
            // mark applied
            await supabase.from('salary_changes').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', sc.id);
          }
          // refresh employees ในหน้าจอ
          const { data: e2 } = await supabase.from('employees').select('*').order('created_at');
          if (!cancelled && e2) setEmployees(fromDB(e2));
        }

        // ---- sync notifications (owner สร้าง/อัปเดตให้ทุก role) ----
        if (!cancelled) {
          try {
            const fresh = await syncNotifications();
            if (!cancelled && fresh) setNotifications(fresh);
          } catch (err) { console.error('syncNotifications', err); }
        }
      }
    })();

    // Realtime
    const enrichProfile = (p) => {
      if (!p) return p;
      const out = fromDB(p);
      out.businessIds = out.businessIds || [];
      out.zoneIds = out.zoneIds || [];
      out.isOwner = out.role === 'owner';
      out.isBM = out.role === 'business_manager';
      out.isZM = out.role === 'zone_manager';
      out.isViewer = out.role === 'viewer';
      out.canWrite = ['owner', 'business_manager', 'zone_manager'].includes(out.role);
      return out;
    };
    const handle = (setter) => (payload) => {
      const { eventType, new: nv, old: ov } = payload;
      if (eventType === 'INSERT') {
        setter((prev) => (prev.some((r) => r.id === nv.id) ? prev : [...prev, fromDB(nv)]));
      } else if (eventType === 'UPDATE') {
        setter((prev) => prev.map((r) => (r.id === nv.id ? fromDB(nv) : r)));
        // If current user's profile changed, re-enrich
        if (nv.id === session?.user?.id) setProfile(enrichProfile(nv));
      } else if (eventType === 'DELETE') {
        setter((prev) => prev.filter((r) => r.id !== ov.id));
      }
    };
    const ch = supabase
      .channel('app')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, handle(setBusinesses))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones' }, handle(setZones))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, handle(setPositions))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, handle(setEmployees))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, handle(setProfiles))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, handle(setNotifications))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, (payload) => {
        const { eventType, new: nv, old: ov } = payload;
        if (eventType === 'INSERT') setNotiReads((prev) => prev.some((r) => r.notificationId === nv.notification_id && r.userId === nv.user_id) ? prev : [...prev, fromDB(nv)]);
        else if (eventType === 'DELETE') setNotiReads((prev) => prev.filter((r) => !(r.notificationId === ov.notification_id && r.userId === ov.user_id)));
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [profile?.id, profile?.role]);

  // ---- HANDLERS ----
  const changeBusiness = (id) => { setActiveBusinessId(id || null); setActiveZoneId(null); };
  const changeTheme = async (theme) => {
    applyTheme(theme); // เปลี่ยนทันที
    setProfile((prev) => prev ? { ...prev, theme } : prev);
    await supabase.from('user_profiles').update({ theme }).eq('id', session.user.id);
  };
  const openZoneEmployees = (bid, zid) => {
    setActiveBusinessId(bid); setActiveZoneId(zid); setView('employees');
  };

  // ---- สร้าง/อัปเดต notifications (owner client) — reconcile แบบ derived ----
  const syncNotifications = async () => {
    // ดึงข้อมูลล่าสุด
    const [{ data: emps }, { data: poss }, { data: bizs }, { data: zns }, { data: profs }, { data: pendingRaises }] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('positions').select('*'),
      supabase.from('businesses').select('*'),
      supabase.from('zones').select('*'),
      supabase.from('user_profiles').select('*'),
      supabase.from('salary_changes').select('*').eq('status', 'pending'),
    ]);
    const E = fromDB(emps || []), P = fromDB(poss || []), B = fromDB(bizs || []), Z = fromDB(zns || []), PR = fromDB(profs || []), SR = fromDB(pendingRaises || []);
    const bizName = (id) => B.find((b) => b.id === id)?.name || '';
    const empName = (id) => { const e = E.find((x) => x.id === id); return e ? (e.nickname || e.name) : ''; };
    const active = E.filter((e) => (e.status || 'active') === 'active');
    const today = new Date();
    const desired = []; // {dedupeKey, businessId, zoneId, type, severity, title, body}

    // 1) ผู้ใช้รออนุมัติ (global → owner)
    PR.filter((p) => p.role === 'pending').forEach((p) => {
      desired.push({ dedupeKey: `pending_user:${p.id}`, businessId: null, zoneId: null, type: 'pending_user', severity: 'warning', title: 'มีผู้ใช้รออนุมัติ', body: `${p.name || p.id} สมัครเข้าระบบ — รอกำหนดสิทธิ์` });
    });
    // 2) บัตรแรงงานใกล้หมด (active + มีบัตร + เหลือ <=30 วัน หรือหมดแล้ว)
    active.filter((e) => e.hasWorkPermit && e.workPermitExpiry).forEach((e) => {
      const days = Math.ceil((new Date(e.workPermitExpiry) - today) / 86400000);
      if (days <= 30) {
        desired.push({ dedupeKey: `permit_expiry:${e.id}`, businessId: e.businessId, zoneId: e.zoneId, type: 'permit_expiry', severity: days < 0 ? 'urgent' : 'warning', title: 'บัตรแรงงานใกล้หมดอายุ', body: `${e.nickname || e.name} — ${days < 0 ? 'หมดอายุแล้ว' : `เหลือ ${days} วัน`}` });
      }
    });
    // 3) ตำแหน่งว่าง (ต่อโซน: มีคนลาออกแต่ไม่เหลือ active)
    Z.forEach((zone) => {
      const inZone = E.filter((e) => e.zoneId === zone.id);
      const byPos = {};
      inZone.forEach((e) => { if (e.positionId) (byPos[e.positionId] ||= []).push(e); });
      Object.entries(byPos).forEach(([posId, list]) => {
        const act = list.filter((e) => (e.status || 'active') === 'active').length;
        const resigned = list.filter((e) => (e.status || 'active') !== 'active');
        if (act === 0 && resigned.length > 0) {
          const pos = P.find((p) => p.id === posId);
          desired.push({ dedupeKey: `vacancy:${posId}:${zone.id}`, businessId: zone.businessId, zoneId: zone.id, type: 'vacancy', severity: 'warning', title: 'ตำแหน่งว่าง', body: `${pos?.name || 'ตำแหน่ง'} (${zone.name}) ไม่มีคนทำงาน` });
        }
      });
    });
    // 4/5) ขาด/เกินอัตรากำลัง (ต่อตำแหน่ง รวมทั้งธุรกิจ)
    P.forEach((pos) => {
      const target = pos.targetHeadcount || 0;
      if (target <= 0) return;
      const count = active.filter((e) => e.positionId === pos.id).length;
      if (count < target) desired.push({ dedupeKey: `understaffed:${pos.id}`, businessId: pos.businessId, zoneId: null, type: 'understaffed', severity: 'warning', title: 'ตำแหน่งขาดคน', body: `${pos.name} — มี ${count}/${target} ขาดอีก ${target - count} คน` });
      else if (count > target) desired.push({ dedupeKey: `overstaffed:${pos.id}`, businessId: pos.businessId, zoneId: null, type: 'overstaffed', severity: 'info', title: 'ตำแหน่งมีคนเกิน', body: `${pos.name} — มี ${count}/${target} เกิน ${count - target} คน` });
    });
    // 6) เงินเดือนยังไม่ปิดงวด (เฉพาะใกล้สิ้นเดือน วันที่ >= 25)
    if (today.getDate() >= 25) {
      const yr = today.getFullYear(), mo = today.getMonth() + 1;
      const { data: pys } = await supabase.from('payrolls').select('employee_id,business_id,status').eq('period_year', yr).eq('period_month', mo);
      const finalizedByBiz = {};
      (pys || []).forEach((p) => { if (p.status === 'finalized') (finalizedByBiz[p.business_id] ||= new Set()).add(p.employee_id); });
      B.forEach((biz) => {
        const need = active.filter((e) => (e.businessId === biz.id || (e.additionalBusinessIds || []).includes(biz.id)) && Number(e.baseSalary) > 0);
        const done = finalizedByBiz[biz.id] || new Set();
        const remaining = need.filter((e) => !done.has(e.id)).length;
        if (need.length > 0 && remaining > 0) {
          desired.push({ dedupeKey: `payroll_incomplete:${biz.id}:${yr}-${mo}`, businessId: biz.id, zoneId: null, type: 'payroll_incomplete', severity: 'warning', title: 'เงินเดือนยังไม่ปิดงวด', body: `${biz.name} — เดือน ${MONTH_NAMES[mo - 1]} ยังไม่ปิดงวด ${remaining} คน` });
        }
      });
    }
    // 7) เงินเดือนรอมีผล
    SR.forEach((sc) => {
      const d = sc.effectiveDate ? new Date(sc.effectiveDate) : null;
      const monthLabel = d ? `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear() + 543}` : '';
      desired.push({ dedupeKey: `pending_raise:${sc.id}`, businessId: sc.businessId, zoneId: null, type: 'pending_raise', severity: 'info', title: 'ปรับเงินเดือนรอมีผล', body: `${empName(sc.employeeId)} → ${fmtMoney(sc.newSalary)} ฿ (มีผล ${monthLabel})` });
    });

    // reconcile: ลบของเก่าที่ไม่อยู่ในชุดปัจจุบัน + insert ที่ขาด
    const { data: existing } = await supabase.from('notifications').select('id,dedupe_key');
    const existKeys = new Set((existing || []).map((n) => n.dedupe_key));
    const desiredKeys = new Set(desired.map((d) => d.dedupeKey));
    const toDelete = (existing || []).filter((n) => !desiredKeys.has(n.dedupe_key));
    const toInsert = desired.filter((d) => !existKeys.has(d.dedupeKey));
    if (toDelete.length > 0) await supabase.from('notifications').delete().in('id', toDelete.map((n) => n.id));
    if (toInsert.length > 0) await supabase.from('notifications').insert(toInsert.map((d) => toDB(d)));
    const { data: finalNoti } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
    return fromDB(finalNoti || []);
  };

  // CRUD: generic
  const insertRow = async (table, data) => {
    const { data: row, error } = await supabase.from(table).insert(toDB(data)).select().single();
    if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return null; }
    return fromDB(row);
  };
  const updateRow = async (table, id, data) => {
    const { error } = await supabase.from(table).update(toDB(data)).eq('id', id);
    if (error) { alert('แก้ไขไม่สำเร็จ: ' + error.message); return false; }
    return true;
  };
  const deleteRow = async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return false; }
    return true;
  };

  const ops = {
    business: {
      add: async (d) => { const r = await insertRow('businesses', d); if (r && !activeBusinessId) setActiveBusinessId(r.id); },
      update: (id, d) => updateRow('businesses', id, d),
      delete: (id) => deleteRow('businesses', id),
    },
    zone: {
      add: (d) => insertRow('zones', d),
      update: (id, d) => updateRow('zones', id, d),
      delete: (id) => deleteRow('zones', id),
    },
    position: {
      add: (d) => insertRow('positions', d),
      update: (id, d) => updateRow('positions', id, d),
      delete: (id) => deleteRow('positions', id),
    },
    employee: {
      add: (d) => insertRow('employees', d),
      update: (id, d) => updateRow('employees', id, d),
      delete: (id) => deleteRow('employees', id),
      resign: (id, d) => updateRow('employees', id, { status: 'resigned', resignedDate: d.resignedDate, resignReason: d.resignReason, resignNote: d.resignNote }),
      rehire: (id) => updateRow('employees', id, { status: 'active', resignedDate: null, resignReason: null, resignNote: null }),
    },
    profile: {
      update: (id, d) => updateRow('user_profiles', id, d),
      delete: (id) => deleteRow('user_profiles', id),
    },
    payroll: {
      listByPeriod: async (businessId, year, month) => {
        const { data, error } = await supabase.from('payrolls').select('*')
          .eq('business_id', businessId).eq('period_year', year).eq('period_month', month);
        if (error) { console.error(error); return []; }
        return fromDB(data || []);
      },
      upsert: async (d) => {
        const { data, error } = await supabase.from('payrolls')
          .upsert(toDB(d), { onConflict: 'employee_id,period_year,period_month' })
          .select().single();
        if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return null; }
        return fromDB(data);
      },
      update: (id, d) => updateRow('payrolls', id, d),
      delete: (id) => deleteRow('payrolls', id),
    },
    payrollItem: {
      listByPayrolls: async (ids) => {
        if (!ids.length) return [];
        const { data, error } = await supabase.from('payroll_items').select('*').in('payroll_id', ids);
        if (error) { console.error(error); return []; }
        return fromDB(data || []);
      },
      add: (d) => insertRow('payroll_items', d),
      delete: (id) => deleteRow('payroll_items', id),
    },
    salaryChange: {
      listByEmployee: async (employeeId) => {
        const { data, error } = await supabase.from('salary_changes').select('*')
          .eq('employee_id', employeeId).order('effective_date', { ascending: false });
        if (error) { console.error(error); return []; }
        return fromDB(data || []);
      },
      add: (d) => insertRow('salary_changes', d),
      delete: (id) => deleteRow('salary_changes', id),
    },
    notification: {
      markRead: async (notificationId, userId) => {
        const { error } = await supabase.from('notification_reads').upsert({ notification_id: notificationId, user_id: userId }, { onConflict: 'notification_id,user_id' });
        if (error) console.error(error);
      },
      markAllRead: async (notificationIds, userId) => {
        if (!notificationIds.length) return;
        const rows = notificationIds.map((id) => ({ notification_id: id, user_id: userId }));
        const { error } = await supabase.from('notification_reads').upsert(rows, { onConflict: 'notification_id,user_id' });
        if (error) console.error(error);
      },
      markUnread: async (notificationId, userId) => {
        const { error } = await supabase.from('notification_reads').delete().eq('notification_id', notificationId).eq('user_id', userId);
        if (error) console.error(error);
      },
    },
  };

  if (authLoading) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  if (!profile) return <LoadingScreen msg="กำลังโหลดโปรไฟล์..." />;
  if (profile.role === 'pending') return <PendingScreen profile={profile} />;
  if (dataLoading) return <LoadingScreen msg="กำลังโหลดข้อมูล..." />;

  return (
    <div className="min-h-screen bg-stone-50 flex">
      <Sidebar
        view={view}
        setView={setView}
        profile={profile}
        businesses={businesses}
        zones={zones}
        activeBusinessId={activeBusinessId}
        setActiveBusinessId={changeBusiness}
        onThemeChange={changeTheme}
        notiBell={
          <NotificationBell
            notifications={notifications}
            notiReads={notiReads}
            userId={session.user.id}
            ops={ops}
            onJump={(n) => {
              if (n.type === 'pending_user') setView('users');
              else if (n.type === 'payroll_incomplete' || n.type === 'pending_raise') { if (n.businessId) changeBusiness(n.businessId); setView(n.type === 'payroll_incomplete' ? 'payroll' : 'employees'); }
              else if (n.type === 'permit_expiry' || n.type === 'vacancy') { if (n.businessId) changeBusiness(n.businessId); setView('employees'); }
              else { if (n.businessId) changeBusiness(n.businessId); setView('positions'); }
            }}
          />
        }
      />
      <main className="flex-1 overflow-hidden">
        {view === 'dashboard' && (
          <Dashboard
            profile={profile}
            businesses={businesses}
            zones={zones}
            employees={employees}
            positions={positions}
            activeBusinessId={activeBusinessId}
            setView={setView}
          />
        )}
        {view === 'businesses' && (profile.isOwner || profile.isBM) && (
          <BusinessesPage
            businesses={businesses}
            zones={zones}
            employees={employees}
            positions={positions}
            profile={profile}
            ops={ops}
            activeBusinessId={activeBusinessId}
            setActiveBusinessId={changeBusiness}
            onOpenZone={openZoneEmployees}
          />
        )}
        {view === 'positions' && (
          <PositionsPage
            businesses={businesses}
            positions={positions}
            employees={employees}
            profile={profile}
            activeBusinessId={activeBusinessId}
            ops={ops}
          />
        )}
        {view === 'employees' && (
          <EmployeesPage
            businesses={businesses}
            zones={zones}
            positions={positions}
            employees={employees}
            profile={profile}
            activeBusinessId={activeBusinessId}
            activeZoneId={activeZoneId}
            setActiveZoneId={setActiveZoneId}
            ops={ops}
          />
        )}
        {view === 'orgchart' && (
          <OrgChartPage
            businesses={businesses}
            zones={zones}
            positions={positions}
            employees={employees}
            profile={profile}
            activeBusinessId={activeBusinessId}
          />
        )}
        {view === 'payroll' && profile.isOwner && (
          <PayrollPage
            businesses={businesses}
            zones={zones}
            positions={positions}
            employees={employees}
            activeBusinessId={activeBusinessId}
            ops={ops}
          />
        )}
        {view === 'users' && profile.isOwner && (
          <UsersPage
            profiles={profiles}
            businesses={businesses}
            zones={zones}
            ops={ops}
            currentUserId={session.user.id}
          />
        )}
      </main>
    </div>
  );
}

// ============ LOADING ============
function LoadingScreen({ msg = 'กำลังโหลด...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-stone-500">{msg}</div>
    </div>
  );
}

// ============ AUTH SCREEN ============
function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  const handleSubmit = async () => {
    setError(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { name: name || email.split('@')[0] } },
        });
        if (error) throw error;
        setInfo('สมัครสำเร็จ! ถ้า Supabase ตั้งให้ยืนยันอีเมล กรุณาเช็คอีเมล มิฉะนั้นเข้าสู่ระบบได้เลย');
      }
    } catch (e) {
      setError(e.message || 'เกิดข้อผิดพลาด');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-stone-900 p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 mb-4 shadow-lg shadow-amber-500/30">
            <Users className="w-8 h-8 text-emerald-950" strokeWidth={2.5} />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">ระบบจัดการพนักงาน</h1>
          <p className="text-emerald-200/70 mt-2 text-sm">Employee Management System</p>
        </div>
        <div onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 border border-white/20">
          <div className="flex gap-1 p-1 bg-stone-100 rounded-lg mb-6">
            <button onClick={() => setMode('login')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'login' ? 'bg-white text-emerald-900 shadow-sm' : 'text-stone-500'}`}>เข้าสู่ระบบ</button>
            <button onClick={() => setMode('signup')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'signup' ? 'bg-white text-emerald-900 shadow-sm' : 'text-stone-500'}`}>สมัครสมาชิก</button>
          </div>
          <div className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">ชื่อ-นามสกุล</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="คุณ A" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">อีเมล</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="you@example.com" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">รหัสผ่าน</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-10 py-2.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="••••••••" />
                <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'signup' && <p className="text-xs text-stone-500 mt-1">อย่างน้อย 6 ตัวอักษร</p>}
            </div>
            {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>}
            {info && <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /><span>{info}</span></div>}
            <button onClick={handleSubmit} disabled={busy} className="w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white font-medium rounded-lg transition-colors shadow-lg shadow-emerald-900/20">
              {busy ? 'กำลังดำเนินการ...' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </button>
          </div>
          {mode === 'signup' && (
            <div className="mt-5 text-xs text-stone-500 text-center">
              คนแรกที่สมัครจะเป็นเจ้าของระบบโดยอัตโนมัติ <br />คนถัดไปจะรอเจ้าของอนุมัติ
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ PENDING SCREEN ============
function PendingScreen({ profile }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <div className="max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 mb-4">
          <Clock className="w-8 h-8 text-amber-700" />
        </div>
        <h2 className="text-xl font-semibold text-stone-800">รออนุมัติ</h2>
        <p className="text-stone-600 mt-2">บัญชีของคุณ ({profile.name}) ได้รับการสร้างแล้ว แต่ยังรอเจ้าของระบบอนุมัติและกำหนดสิทธิ์</p>
        <button onClick={() => supabase.auth.signOut()} className="mt-6 px-4 py-2 text-sm text-stone-700 hover:bg-stone-200 rounded-lg">ออกจากระบบ</button>
      </div>
    </div>
  );
}

// ============ NOTIFICATION BELL ============
const NOTI_META = {
  pending_user:       { icon: UserCircle, color: 'text-amber-600 bg-amber-100' },
  permit_expiry:      { icon: CreditCard, color: 'text-red-600 bg-red-100' },
  vacancy:            { icon: Award, color: 'text-amber-600 bg-amber-100' },
  understaffed:       { icon: Users, color: 'text-rose-600 bg-rose-100' },
  overstaffed:        { icon: Users, color: 'text-sky-600 bg-sky-100' },
  payroll_incomplete: { icon: Wallet, color: 'text-amber-600 bg-amber-100' },
  pending_raise:      { icon: TrendingUp, color: 'text-emerald-600 bg-emerald-100' },
};
function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  return `${Math.floor(s / 86400)} วันที่แล้ว`;
}
function NotificationBell({ notifications, notiReads, userId, ops, onJump }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const readSet = useMemo(() => new Set(notiReads.filter((r) => r.userId === userId).map((r) => r.notificationId)), [notiReads, userId]);
  const sorted = useMemo(() => [...notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [notifications]);
  const unread = sorted.filter((n) => !readSet.has(n.id));
  const unreadCount = unread.length;

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const clickNoti = (n) => {
    if (!readSet.has(n.id)) ops.notification.markRead(n.id, userId);
    if (onJump) onJump(n);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-lg hover:bg-emerald-900 text-emerald-100/90 transition-colors" title="การแจ้งเตือน">
        {unreadCount > 0 ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-[340px] max-w-[90vw] bg-white rounded-xl shadow-2xl border border-stone-200 z-[70] overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between bg-stone-50">
            <div className="font-semibold text-stone-800 text-sm">การแจ้งเตือน {unreadCount > 0 && <span className="text-red-500">({unreadCount})</span>}</div>
            {unreadCount > 0 && (
              <button onClick={() => ops.notification.markAllRead(unread.map((n) => n.id), userId)} className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-medium"><CheckCheck className="w-3.5 h-3.5" />อ่านทั้งหมด</button>
            )}
          </div>
          <div className="max-h-[420px] overflow-auto">
            {sorted.length === 0 ? (
              <div className="px-4 py-10 text-center text-stone-400 text-sm"><Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />ไม่มีการแจ้งเตือน</div>
            ) : (
              sorted.map((n) => {
                const meta = NOTI_META[n.type] || { icon: Bell, color: 'text-stone-600 bg-stone-100' };
                const Icon = meta.icon;
                const isUnread = !readSet.has(n.id);
                return (
                  <button key={n.id} onClick={() => clickNoti(n)} className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-stone-100 hover:bg-stone-50 transition-colors ${isUnread ? 'bg-emerald-50/40' : ''}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.color}`}><Icon className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm truncate ${isUnread ? 'font-semibold text-stone-800' : 'font-medium text-stone-600'}`}>{n.title}</span>
                        {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                      </div>
                      {n.body && <div className="text-xs text-stone-500 mt-0.5 break-words">{n.body}</div>}
                      <div className="text-[11px] text-stone-400 mt-1">{timeAgo(n.createdAt)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ THEME PICKER ============
function ThemePicker({ current, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const cur = THEMES.find((t) => t.value === current) || THEMES[0];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-emerald-100/80 hover:bg-emerald-900 hover:text-white transition-colors">
        <div className="flex -space-x-1">
          <span className="w-4 h-4 rounded-full border border-emerald-950" style={{ background: cur.primary }} />
          <span className="w-4 h-4 rounded-full border border-emerald-950" style={{ background: cur.accent }} />
        </div>
        <span className="flex-1 text-left">ธีม: {cur.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-xl shadow-2xl border border-stone-200 z-[70] overflow-hidden p-1.5">
          <div className="px-2 py-1.5 text-xs font-medium text-stone-400">เลือกธีมสี</div>
          {THEMES.map((t) => {
            const active = t.value === current;
            return (
              <button key={t.value} onClick={() => { onSelect(t.value); setOpen(false); }} className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${active ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
                <div className="flex -space-x-1 flex-shrink-0">
                  <span className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: t.primary }} />
                  <span className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: t.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-800">{t.label}</div>
                  <div className="text-[11px] text-stone-500">{t.desc}</div>
                </div>
                {active && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ SIDEBAR ============
function Sidebar({ view, setView, profile, businesses, zones, activeBusinessId, setActiveBusinessId, notiBell, onThemeChange }) {
  const isOwner = profile.isOwner;
  const isBM = profile.isBM;
  const isZM = profile.isZM;
  const isViewer = profile.isViewer;
  const canManageBiz = isOwner || isBM;
  const roleLabel = isOwner ? 'เจ้าของระบบ' : isBM ? 'หัวหน้าธุรกิจ' : isZM ? 'หัวหน้าโซน' : isViewer ? 'ผู้ดู' : 'รออนุมัติ';
  const RoleIcon = isOwner ? Crown : isViewer ? Eye : User;
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'ภาพรวม', icon: Home },
    { id: 'businesses', label: 'ธุรกิจและโซน', icon: Building2, show: canManageBiz },
    { id: 'positions', label: 'ตำแหน่ง', icon: Award },
    { id: 'employees', label: 'พนักงาน', icon: Users },
    { id: 'orgchart', label: 'แผนผังองค์กร', icon: Network },
    { id: 'payroll', label: 'เงินเดือน', icon: Wallet, show: isOwner },
    { id: 'users', label: 'ผู้ใช้ระบบ', icon: Shield, show: isOwner },
  ];

  // ธุรกิจที่ user เลือกได้
  const accessibleBiz = (() => {
    if (isOwner) return businesses;
    if (isBM) return businesses.filter((b) => (profile.businessIds || []).includes(b.id));
    if (isZM) {
      const bizIds = new Set((zones || []).filter((z) => (profile.zoneIds || []).includes(z.id)).map((z) => z.businessId));
      return businesses.filter((b) => bizIds.has(b.id));
    }
    if (isViewer) {
      const hasScope = profile.businessIds.length > 0 || profile.zoneIds.length > 0;
      if (!hasScope) return businesses;
      const bizIds = new Set([
        ...profile.businessIds,
        ...(zones || []).filter((z) => profile.zoneIds.includes(z.id)).map((z) => z.businessId),
      ]);
      return businesses.filter((b) => bizIds.has(b.id));
    }
    return businesses;
  })();

  return (
    <aside className="w-64 bg-emerald-950 text-emerald-50 flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-emerald-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-950" strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-white text-sm">ระบบพนักงาน</div>
            <div className="text-xs text-emerald-300/70">Employee System</div>
          </div>
          {notiBell}
        </div>
      </div>
      {(() => {
        const activeBiz = activeBusinessId ? businesses.find((b) => b.id === activeBusinessId) : null;
        if (!activeBiz) return null;
        return (
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2.5 px-2.5 py-2 bg-emerald-900/60 rounded-lg">
              <div className="w-9 h-9 rounded-lg bg-white/95 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {activeBiz.logo ? <img src={activeBiz.logo} alt={activeBiz.name} className="w-full h-full object-contain" /> : <Building2 className="w-5 h-5 text-emerald-800" />}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-emerald-300/70">ธุรกิจที่กำลังดู</div>
                <div className="text-sm text-white font-medium truncate">{activeBiz.name}</div>
              </div>
            </div>
          </div>
        );
      })()}
      {accessibleBiz.length > 1 && (
        <div className="p-3 border-b border-emerald-900">
          <label className="block text-xs text-emerald-300/70 mb-1.5 px-1">เปลี่ยนธุรกิจ</label>
          <select value={activeBusinessId || ''} onChange={(e) => setActiveBusinessId(e.target.value)} className="w-full px-3 py-2 bg-emerald-900 border border-emerald-800 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500">
            {isOwner && <option value="">🌐 ทุกธุรกิจ (ภาพรวม)</option>}
            {accessibleBiz.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          if (item.show === false) return null;
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button key={item.id} onClick={() => setView(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${active ? 'bg-amber-500 text-emerald-950 font-medium shadow-lg shadow-amber-500/20' : 'text-emerald-100/80 hover:bg-emerald-900 hover:text-white'}`}>
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-emerald-900">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-9 h-9 rounded-full bg-emerald-800 flex items-center justify-center">
            <RoleIcon className={`w-4 h-4 ${isOwner ? 'text-amber-400' : 'text-emerald-200'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{profile.name || 'ผู้ใช้'}</div>
            <div className="text-xs text-emerald-300/70">{roleLabel}</div>
          </div>
        </div>
        <ThemePicker current={profile.theme} onSelect={onThemeChange} />
        <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-emerald-100/80 hover:bg-emerald-900 hover:text-white transition-colors">
          <LogOut className="w-4 h-4" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}

// ============ PAGE HEADER ============
function PageHeader({ title, subtitle, children }) {
  return (
    <div className="bg-white border-b border-stone-200 px-8 py-5 flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-stone-800 tracking-tight">{title}</h1>
        {subtitle && <p className="text-[15px] text-stone-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// ============ DASHBOARD ============
function Dashboard({ profile, businesses, zones, employees, positions, activeBusinessId, setView }) {
  const isOwner = profile.isOwner;
  const isBM = profile.isBM;
  const isZM = profile.isZM;
  const isViewer = profile.isViewer;
  const visibleEmployees = useMemo(() => {
    const act = employees.filter(isActive);
    if (isOwner) return activeBusinessId
      ? act.filter((e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))
      : act;
    if (isBM) {
      const ids = profile.businessIds || [];
      let list = act.filter((e) => ids.includes(e.businessId) || (e.additionalBusinessIds || []).some((id) => ids.includes(id)));
      if (activeBusinessId) list = list.filter((e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId));
      return list;
    }
    if (isZM) {
      const zoneIds = profile.zoneIds || [];
      return act.filter((e) => zoneIds.includes(e.zoneId));
    }
    if (isViewer) {
      const noScope = profile.businessIds.length === 0 && profile.zoneIds.length === 0;
      if (noScope) return activeBusinessId ? act.filter((e) => e.businessId === activeBusinessId) : act;
      return act.filter((e) => profile.businessIds.includes(e.businessId) || profile.zoneIds.includes(e.zoneId));
    }
    return [];
  }, [employees, profile, activeBusinessId, isOwner, isBM, isZM, isViewer]);
  const visibleZones = useMemo(() => {
    if (isOwner) return activeBusinessId ? zones.filter((z) => z.businessId === activeBusinessId) : zones;
    if (isBM) return zones.filter((z) => (profile.businessIds || []).includes(z.businessId));
    if (isZM) return zones.filter((z) => (profile.zoneIds || []).includes(z.id));
    if (isViewer) {
      const noScope = profile.businessIds.length === 0 && profile.zoneIds.length === 0;
      if (noScope) return zones;
      return zones.filter((z) => profile.businessIds.includes(z.businessId) || profile.zoneIds.includes(z.id));
    }
    return [];
  }, [zones, profile, activeBusinessId, isOwner, isBM, isZM, isViewer]);

  // ตำแหน่งว่าง: ตำแหน่งที่มีคนลาออก แต่ไม่มีคน active อยู่แล้ว
  const vacancies = useMemo(() => {
    const scopeEmp = (() => {
      if (isOwner) return activeBusinessId ? employees.filter((e) => e.businessId === activeBusinessId) : employees;
      if (isBM) return employees.filter((e) => (profile.businessIds || []).includes(e.businessId));
      if (isZM) return employees.filter((e) => (profile.zoneIds || []).includes(e.zoneId));
      return [];
    })();
    const result = [];
    visibleZones.forEach((zone) => {
      const inZone = scopeEmp.filter((e) => e.zoneId === zone.id);
      const byPos = {};
      inZone.forEach((e) => { if (e.positionId) (byPos[e.positionId] ||= []).push(e); });
      Object.entries(byPos).forEach(([posId, list]) => {
        const activeCount = list.filter(isActive).length;
        const resignedList = list.filter((e) => !isActive(e));
        if (activeCount === 0 && resignedList.length > 0) {
          const pos = positions.find((p) => p.id === posId);
          const lastResigned = resignedList.slice().sort((a, b) => (b.resignedDate || '').localeCompare(a.resignedDate || ''))[0];
          result.push({ zone, position: pos, lastResigned });
        }
      });
    });
    return result;
  }, [employees, visibleZones, positions, isOwner, isBM, isZM, profile, activeBusinessId]);

  // ตำแหน่งที่อัตรากำลังไม่ตรง (นับรวมทั้งธุรกิจ): ขาด หรือ เกิน
  const staffingIssues = useMemo(() => {
    const scopePos = (() => {
      if (isOwner) return activeBusinessId ? positions.filter((p) => p.businessId === activeBusinessId) : positions;
      if (isBM) return positions.filter((p) => (profile.businessIds || []).includes(p.businessId));
      return [];
    })();
    const under = [], over = [];
    scopePos.forEach((pos) => {
      const target = pos.targetHeadcount || 0;
      if (target <= 0) return;
      const count = employees.filter((e) => e.positionId === pos.id && isActive(e)).length;
      const biz = businesses.find((b) => b.id === pos.businessId);
      if (count < target) under.push({ position: pos, biz, count, target, shortage: target - count });
      else if (count > target) over.push({ position: pos, biz, count, target, excess: count - target });
    });
    under.sort((a, b) => b.shortage - a.shortage);
    over.sort((a, b) => b.excess - a.excess);
    return { under, over };
  }, [positions, employees, businesses, isOwner, isBM, profile, activeBusinessId]);
  const understaffed = staffingIssues.under;
  const overstaffed = staffingIssues.over;

  const stats = [
    isOwner && { label: 'ธุรกิจ', value: businesses.length, icon: Building2, color: 'emerald' },
    { label: 'โซน', value: visibleZones.length, icon: MapPin, color: 'amber' },
    { label: 'ตำแหน่ง', value: isOwner && activeBusinessId ? positions.filter((p) => p.businessId === activeBusinessId).length : positions.length, icon: Award, color: 'rose' },
    { label: 'พนักงาน', value: visibleEmployees.length, icon: Users, color: 'sky' },
  ].filter(Boolean);

  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
  };

  const recentEmployees = [...visibleEmployees].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);

  return (
    <div className="h-screen overflow-auto">
      <PageHeader title={`สวัสดี, ${profile.name || 'ผู้ใช้'}`} subtitle="ภาพรวมข้อมูลในระบบ" />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white rounded-xl border border-stone-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-stone-500">{s.label}</div>
                    <div className="text-3xl font-semibold text-stone-800 mt-1.5">{s.value}</div>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${colorMap[s.color]}`}><Icon className="w-5 h-5" /></div>
                </div>
              </div>
            );
          })}
        </div>
        {vacancies.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center"><AlertCircle className="w-4 h-4 text-amber-700" /></div>
              <h2 className="font-semibold text-amber-900">ตำแหน่งว่าง ({vacancies.length})</h2>
            </div>
            <p className="text-xs text-amber-700 mb-3">ตำแหน่งเหล่านี้มีคนลาออกและยังไม่มีคนทำงานแทน</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {vacancies.map((v, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-white border border-amber-200 rounded-lg">
                  <Award className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800 truncate">{v.position?.name || 'ไม่ระบุตำแหน่ง'}</div>
                    <div className="text-xs text-stone-500 truncate">{v.zone?.name}</div>
                    {v.lastResigned && <div className="text-[11px] text-amber-700 mt-0.5">{dispName(v.lastResigned)} ลาออก {v.lastResigned.resignedDate ? new Date(v.lastResigned.resignedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : ''}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {understaffed.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center"><Users className="w-4 h-4 text-rose-700" /></div>
              <h2 className="font-semibold text-rose-900">ตำแหน่งที่ต้องหาคนเพิ่ม ({understaffed.length})</h2>
            </div>
            <p className="text-xs text-rose-700 mb-3">ตำแหน่งเหล่านี้มีพนักงานไม่ครบตามอัตรากำลังที่กำหนด</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {understaffed.map((u, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-white border border-rose-200 rounded-lg">
                  <Award className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-stone-800 truncate">{u.position?.name}</div>
                    {!activeBusinessId && u.biz && <div className="text-xs text-stone-500 truncate">{u.biz.name}</div>}
                    <div className="text-[11px] text-rose-700 mt-0.5 font-medium">มี {u.count}/{u.target} คน — ขาดอีก {u.shortage} คน</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {overstaffed.length > 0 && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center"><Users className="w-4 h-4 text-sky-700" /></div>
              <h2 className="font-semibold text-sky-900">ตำแหน่งที่มีคนเกิน ({overstaffed.length})</h2>
            </div>
            <p className="text-xs text-sky-700 mb-3">ตำแหน่งเหล่านี้มีพนักงานมากกว่าอัตรากำลังที่กำหนด</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {overstaffed.map((u, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-white border border-sky-200 rounded-lg">
                  <Award className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-stone-800 truncate">{u.position?.name}</div>
                    {!activeBusinessId && u.biz && <div className="text-xs text-stone-500 truncate">{u.biz.name}</div>}
                    <div className="text-[11px] text-sky-700 mt-0.5 font-medium">มี {u.count}/{u.target} คน — เกิน {u.excess} คน</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {businesses.length === 0 && isOwner && (
          <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 rounded-2xl p-8 text-white mb-8">
            <h2 className="text-xl font-semibold mb-2">เริ่มต้นใช้งาน</h2>
            <p className="text-emerald-100/80 text-sm mb-5">เริ่มจากสร้างธุรกิจ → เพิ่มโซน → ตำแหน่ง → พนักงาน</p>
            <button onClick={() => setView('businesses')} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-emerald-950 font-medium rounded-lg">เริ่มสร้างธุรกิจ</button>
          </div>
        )}
        {recentEmployees.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
              <h2 className="font-semibold text-stone-800">พนักงานล่าสุด</h2>
              <button onClick={() => setView('employees')} className="text-sm text-emerald-700 hover:text-emerald-800 flex items-center gap-1">ดูทั้งหมด <ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="divide-y divide-stone-100">
              {recentEmployees.map((emp) => {
                const zone = zones.find((z) => z.id === emp.zoneId);
                const pos = positions.find((p) => p.id === emp.positionId);
                return (
                  <div key={emp.id} className="px-6 py-4 flex items-center gap-4 hover:bg-stone-50">
                    <Avatar photo={emp.photo} name={dispName(emp)} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-stone-800 truncate flex items-center gap-2">
                        <span className="font-mono text-xs text-stone-400">#{emp.employeeNumber}</span>
                        <span className="truncate">{dispName(emp)}</span>
                      </div>
                      <div className="text-sm text-stone-500 truncate">{pos?.name || 'ยังไม่กำหนดตำแหน่ง'} • {zone?.name || '—'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ AVATAR ============
function Avatar({ photo, name, size = 40 }) {
  const initials = (name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0" />;
  return <div style={{ width: size, height: size, fontSize: size * 0.35 }} className="rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 text-white font-medium flex items-center justify-center flex-shrink-0">{initials}</div>;
}

// ============ BUSINESSES + ZONES PAGE ============
function BusinessesPage({ businesses, zones, employees, positions, ops, activeBusinessId, setActiveBusinessId, onOpenZone }) {
  const [editingBiz, setEditingBiz] = useState(null);
  const [showBizModal, setShowBizModal] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [zoneModalBizId, setZoneModalBizId] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const saveBiz = async (data) => {
    if (editingBiz?.id) await ops.business.update(editingBiz.id, data);
    else await ops.business.add(data);
    setShowBizModal(false); setEditingBiz(null);
  };
  const delBiz = async (id) => {
    if (!confirm('ลบธุรกิจนี้? โซน ตำแหน่ง และพนักงานทั้งหมดในธุรกิจนี้จะถูกลบด้วย')) return;
    await ops.business.delete(id);
    if (activeBusinessId === id) {
      const remaining = businesses.filter((b) => b.id !== id);
      setActiveBusinessId(remaining.length ? remaining[0].id : null);
    }
  };
  const saveZone = async (data) => {
    if (editingZone?.id) await ops.zone.update(editingZone.id, data);
    else await ops.zone.add({ ...data, businessId: zoneModalBizId });
    setEditingZone(null); setZoneModalBizId(null);
  };
  const delZone = async (id) => {
    if (employees.some((e) => e.zoneId === id)) return alert('มีพนักงานในโซนนี้ กรุณาย้ายพนักงานออกก่อน');
    if (!confirm('ลบโซนนี้?')) return;
    await ops.zone.delete(id);
  };

  return (
    <div className="h-screen overflow-auto">
      <PageHeader title="ธุรกิจและโซน" subtitle="จัดการธุรกิจและโซนภายในแต่ละธุรกิจ">
        <button onClick={() => { setEditingBiz({}); setShowBizModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> เพิ่มธุรกิจ
        </button>
      </PageHeader>
      <div className="p-8">
        {businesses.length === 0 ? (
          <EmptyState icon={Building2} title="ยังไม่มีธุรกิจ" description="เริ่มต้นด้วยการเพิ่มธุรกิจแรก" action={<button onClick={() => { setEditingBiz({}); setShowBizModal(true); }} className="px-4 py-2 bg-emerald-900 text-white rounded-lg text-sm font-medium">เพิ่มธุรกิจ</button>} />
        ) : (
          <div className="space-y-4">
            {businesses.map((biz) => {
              const bizZones = zones.filter((z) => z.businessId === biz.id);
              const bizEmps = employees.filter((e) => e.businessId === biz.id || (e.additionalBusinessIds || []).includes(biz.id));
              const isCollapsed = collapsed[biz.id];
              return (
                <div key={biz.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  <div className="p-5 flex items-center gap-4 group hover:bg-stone-50">
                    <button onClick={() => toggle(biz.id)} className="p-1 hover:bg-stone-200 rounded">
                      {isCollapsed ? <ChevronRight className="w-5 h-5 text-stone-500" /> : <ChevronDown className="w-5 h-5 text-stone-500" />}
                    </button>
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {biz.logo ? <img src={biz.logo} alt={biz.name} className="w-full h-full object-contain" /> : <Building2 className="w-6 h-6 text-emerald-800" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-stone-800 text-lg">{biz.name}</h3>
                      {biz.description && <p className="text-sm text-stone-500 line-clamp-1">{biz.description}</p>}
                    </div>
                    <div className="flex items-center gap-6 text-sm flex-shrink-0">
                      <div className="text-center"><div className="text-stone-400 text-xs">โซน</div><div className="font-medium text-stone-700">{bizZones.length}</div></div>
                      <div className="text-center"><div className="text-stone-400 text-xs">พนักงาน</div><div className="font-medium text-stone-700">{bizEmps.length}</div></div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingBiz(biz); setShowBizModal(true); }} className="p-2 hover:bg-stone-200 rounded text-stone-600"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => delBiz(biz.id)} className="p-2 hover:bg-red-100 rounded text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="border-t border-stone-100 bg-stone-50/50 px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-stone-600"><MapPin className="w-4 h-4" /><span>โซนใน {biz.name}</span></div>
                        <button onClick={() => { setEditingZone({}); setZoneModalBizId(biz.id); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-amber-50 border border-stone-200 hover:border-amber-300 rounded-lg text-sm text-stone-700 hover:text-amber-700 font-medium">
                          <Plus className="w-3.5 h-3.5" /> เพิ่มโซน
                        </button>
                      </div>
                      {(() => {
                        const crossZoneEmps = employees.filter((e) => e.businessId === biz.id && !e.zoneId);
                        const empty = bizZones.length === 0 && crossZoneEmps.length === 0;
                        if (empty) return <div className="text-center py-6 text-sm text-stone-400 italic">ยังไม่มีโซนในธุรกิจนี้</div>;
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {bizZones.map((zone) => {
                              const count = employees.filter((e) => e.zoneId === zone.id).length;
                              return (
                                <div key={zone.id} onClick={() => onOpenZone(biz.id, zone.id)} className="bg-white rounded-lg border border-stone-200 p-4 hover:border-amber-400 hover:shadow-md hover:-translate-y-0.5 transition-all group/zone cursor-pointer">
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0"><MapPinned className="w-4 h-4 text-amber-700" /></div>
                                      <div className="min-w-0"><div className="font-medium text-stone-800 truncate">{zone.name}</div><div className="text-xs text-stone-500">{count} คน</div></div>
                                    </div>
                                    <div className="flex gap-0.5 opacity-0 group-hover/zone:opacity-100 transition-opacity">
                                      <button onClick={(e) => { e.stopPropagation(); setEditingZone(zone); setZoneModalBizId(biz.id); }} className="p-1 hover:bg-stone-100 rounded text-stone-600"><Edit2 className="w-3.5 h-3.5" /></button>
                                      <button onClick={(e) => { e.stopPropagation(); delZone(zone.id); }} className="p-1 hover:bg-red-50 rounded text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </div>
                                  {zone.description && <p className="text-xs text-stone-500 mt-2 line-clamp-2">{zone.description}</p>}
                                  <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-amber-700 opacity-0 group-hover/zone:opacity-100 transition-opacity"><span>ดูพนักงาน</span><ChevronRight className="w-3.5 h-3.5" /></div>
                                </div>
                              );
                            })}
                            {crossZoneEmps.length > 0 && (
                              <div onClick={() => onOpenZone(biz.id, '__nozone__')} className="bg-amber-50/60 rounded-lg border-2 border-dashed border-amber-300 p-4 hover:bg-amber-50 hover:border-amber-400 hover:shadow-md hover:-translate-y-0.5 transition-all group/nz cursor-pointer">
                                <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center"><MapPin className="w-4 h-4 text-amber-800" /></div><div><div className="font-medium text-amber-900">ไม่จำกัดโซน</div><div className="text-xs text-amber-700">{crossZoneEmps.length} คน</div></div></div>
                                <p className="text-xs text-amber-700/80 mt-2">พนักงานที่ดูแลข้ามโซน เช่น ผู้จัดการ</p>
                                <div className="mt-2 pt-2 border-t border-amber-200 flex items-center justify-between text-xs text-amber-800 opacity-0 group-hover/nz:opacity-100 transition-opacity"><span>ดูพนักงาน</span><ChevronRight className="w-3.5 h-3.5" /></div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showBizModal && (
        <Modal title={editingBiz?.id ? 'แก้ไขธุรกิจ' : 'เพิ่มธุรกิจใหม่'} onClose={() => { setShowBizModal(false); setEditingBiz(null); }}>
          <BusinessForm initial={editingBiz} onSave={saveBiz} onCancel={() => { setShowBizModal(false); setEditingBiz(null); }} />
        </Modal>
      )}
      {zoneModalBizId && (
        <Modal title={editingZone?.id ? 'แก้ไขโซน' : `เพิ่มโซนใน ${businesses.find((b) => b.id === zoneModalBizId)?.name}`} onClose={() => { setEditingZone(null); setZoneModalBizId(null); }}>
          <ZoneForm initial={editingZone} onSave={saveZone} onCancel={() => { setEditingZone(null); setZoneModalBizId(null); }} />
        </Modal>
      )}
    </div>
  );
}

function BusinessForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [logo, setLogo] = useState(initial?.logo || '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const handleLogo = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { setLogo(await resizeImage(f, 400)); } finally { setUploading(false); }
  };
  const submit = () => { if (!name.trim()) return alert('กรุณากรอกชื่อธุรกิจ'); onSave({ name: name.trim(), description: description.trim(), logo: logo || null }); };
  return (
    <div className="space-y-4">
      <FormField label="โลโก้ธุรกิจ">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logo ? <img src={logo} alt="logo" className="w-full h-full object-contain" /> : <Building2 className="w-7 h-7 text-stone-300" />}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-3 py-2 border border-stone-300 rounded-lg text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50">
              <Upload className="w-4 h-4" />{uploading ? 'กำลังอัปโหลด...' : (logo ? 'เปลี่ยนโลโก้' : 'อัปโหลดโลโก้')}
            </button>
            {logo && <button type="button" onClick={() => setLogo('')} className="text-xs text-red-600 hover:underline text-left">ลบโลโก้</button>}
          </div>
        </div>
      </FormField>
      <FormField label="ชื่อธุรกิจ" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น ร้านอาหาร ABC" /></FormField>
      <FormField label="รายละเอียด"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

function ZoneForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const submit = () => { if (!name.trim()) return alert('กรุณากรอกชื่อโซน'); onSave({ name: name.trim(), description: description.trim() }); };
  return (
    <div className="space-y-4">
      <FormField label="ชื่อโซน" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น สาขาสีลม" /></FormField>
      <FormField label="รายละเอียด"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

// ============ POSITIONS PAGE ============
function PositionsPage({ businesses, positions, employees, profile, activeBusinessId, ops }) {
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const isOwner = profile.isOwner;
  const canManageBiz = isOwner || profile.isBM;
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
    <div className="h-screen overflow-auto"><PageHeader title="ตำแหน่ง" /><div className="p-8"><EmptyState icon={Award} title="เลือกธุรกิจที่ sidebar" description="ตำแหน่งเป็นข้อมูลเฉพาะของแต่ละธุรกิจ — ต้องเลือกธุรกิจที่ sidebar ก่อน" /></div></div>
  );
  const roots = bizPositions.filter((p) => !p.parentId);

  return (
    <div className="h-screen overflow-auto">
      <PageHeader title="ตำแหน่ง" subtitle={`ธุรกิจ: ${businesses.find((b) => b.id === activeBusinessId)?.name}`}>
        {canManageBiz && <button onClick={() => { setEditing({}); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" /> เพิ่มตำแหน่ง</button>}
      </PageHeader>
      <div className="p-8">
        {bizPositions.length === 0 ? (
          <EmptyState icon={Award} title="ยังไม่มีตำแหน่ง" description="เพิ่มตำแหน่งและกำหนดสายบังคับบัญชา (เช่น ผู้จัดการ → หัวหน้าโซน → พนักงาน)" />
        ) : (
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <PositionTree positions={roots} allPositions={bizPositions} employees={employees} onEdit={(p) => { setEditing(p); setShowModal(true); }} onDelete={del} isOwner={canManageBiz} level={0} />
          </div>
        )}
      </div>
      {showModal && (
        <Modal title={editing?.id ? 'แก้ไขตำแหน่ง' : 'เพิ่มตำแหน่งใหม่'} onClose={() => { setShowModal(false); setEditing(null); }}>
          <PositionForm initial={editing} positions={bizPositions} onSave={save} onCancel={() => { setShowModal(false); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

function PositionTree({ positions, allPositions, employees, onEdit, onDelete, isOwner, level }) {
  return (
    <div className={level === 0 ? 'space-y-2' : 'mt-2 ml-6 pl-4 border-l-2 border-stone-200 space-y-2'}>
      {positions.map((pos) => {
        const children = allPositions.filter((p) => p.parentId === pos.id);
        const count = employees.filter((e) => e.positionId === pos.id && isActive(e)).length;
        const target = pos.targetHeadcount || 0;
        const shortage = target > 0 ? Math.max(0, target - count) : 0;
        const over = target > 0 ? Math.max(0, count - target) : 0;
        const full = target > 0 && count === target;
        return (
          <div key={pos.id}>
            <div className="flex items-center justify-between p-3 bg-stone-50 hover:bg-stone-100 rounded-lg group">
              <div className="flex items-center gap-3">
                <Award className="w-4 h-4 text-emerald-700" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap"><div className="font-medium text-stone-800">{pos.name}</div>
                    {pos.crossZone && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-medium rounded-full"><MapPin className="w-2.5 h-2.5" />ไม่จำกัดโซน</span>}
                    {target > 0 && (
                      full
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-medium rounded-full"><CheckCircle2 className="w-2.5 h-2.5" />ครบ {count}/{target}</span>
                        : over > 0
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-medium rounded-full"><AlertCircle className="w-2.5 h-2.5" />เกิน {over} ({count}/{target})</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-medium rounded-full"><AlertCircle className="w-2.5 h-2.5" />ขาด {shortage} ({count}/{target})</span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500">{count} คน{target > 0 ? ` (ต้องการ ${target})` : ''}{pos.description ? ` • ${pos.description}` : ''}</div>
                </div>
              </div>
              {isOwner && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEdit(pos)} className="p-1.5 hover:bg-white rounded text-stone-600"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => onDelete(pos.id)} className="p-1.5 hover:bg-red-50 rounded text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
            {children.length > 0 && <PositionTree positions={children} allPositions={allPositions} employees={employees} onEdit={onEdit} onDelete={onDelete} isOwner={isOwner} level={level + 1} />}
          </div>
        );
      })}
    </div>
  );
}

function PositionForm({ initial, positions, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [parentId, setParentId] = useState(initial?.parentId || '');
  const [crossZone, setCrossZone] = useState(initial?.crossZone || false);
  const [targetHeadcount, setTargetHeadcount] = useState(initial?.targetHeadcount ?? 0);
  const submit = () => { if (!name.trim()) return alert('กรุณากรอกชื่อตำแหน่ง'); onSave({ name: name.trim(), description: description.trim(), parentId: parentId || null, crossZone, targetHeadcount: Number(targetHeadcount) || 0 }); };
  const isDescendant = (id, of) => { let p = positions.find((x) => x.id === id); while (p) { if (p.id === of) return true; p = positions.find((x) => x.id === p.parentId); } return false; };
  const validParents = positions.filter((p) => p.id !== initial?.id && !isDescendant(p.id, initial?.id));

  return (
    <div className="space-y-4">
      <FormField label="ชื่อตำแหน่ง" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น ผู้จัดการ" /></FormField>
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
      <FormField label="รายละเอียด"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <label className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg cursor-pointer hover:bg-stone-100 border border-stone-200">
        <input type="checkbox" checked={crossZone} onChange={(e) => setCrossZone(e.target.checked)} className="mt-0.5 w-4 h-4 rounded text-emerald-700" />
        <div><div className="text-sm font-medium text-stone-800">ตำแหน่งนี้ไม่จำกัดโซน</div><div className="text-xs text-stone-500 mt-0.5">เหมาะกับตำแหน่งที่ดูแลข้ามโซน เช่น ผู้จัดการ</div></div>
      </label>
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

// ============ EMPLOYEES PAGE ============
function EmployeesPage({ businesses, zones, positions, employees, profile, activeBusinessId, activeZoneId, setActiveZoneId, ops }) {
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // active | resigned | all
  const [resigningEmp, setResigningEmp] = useState(null);
  const [raisingEmp, setRaisingEmp] = useState(null);
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
    if (editing?.id) await ops.employee.update(editing.id, payload);
    else await ops.employee.add(payload);
    setShowModal(false); setEditing(null);
  };
  const del = async (id) => {
    if (!confirm('ลบพนักงานคนนี้?')) return;
    const emp = employees.find((e) => e.id === id);
    const toDelete = [...(emp?.workPermitDocs || []), ...(emp?.passportDocs || [])];
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
    <div className="h-screen overflow-auto"><PageHeader title="พนักงาน" /><div className="p-8"><EmptyState icon={Users} title="ยังไม่มีธุรกิจ" description="สร้างธุรกิจก่อนที่หน้า 'ธุรกิจและโซน'" /></div></div>
  );

  return (
    <div className="h-screen overflow-auto">
      <PageHeader title={filteredZoneName ? `พนักงาน — ${filteredZoneName}` : (allMode ? 'พนักงานทุกคน — ภาพรวมทุกธุรกิจ' : 'พนักงาน')} subtitle={`${visibleEmployees.length} คน${filteredZoneName ? ' ในโซนนี้' : (allMode ? ' รวมทุกธุรกิจ' : '')}`}>
        {canWrite && !allMode && targetBusinessId && (
          <button onClick={() => { setEditing({}); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" /> เพิ่มพนักงาน</button>
        )}
      </PageHeader>
      <div className="p-8">
        {allMode && (
          <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-900">
            <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>กำลังดูพนักงานจาก<strong> ทุกธุรกิจ ({businesses.length} ที่)</strong> รวมกัน — เลือกธุรกิจที่ sidebar เพื่อกรองเฉพาะธุรกิจเดียว หรือเพิ่มพนักงานใหม่</div>
          </div>
        )}
        {isOwner && activeZoneId && (
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
          {isOwner && activeBusinessId && (
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
              const pos = positions.find((p) => p.id === emp.positionId);
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-900/90 text-white text-[10px] font-medium rounded-md backdrop-blur"><Globe className="w-2.5 h-2.5" />{natLabel(emp.nationality)}</span>
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
          <EmployeeForm initial={editing} zones={visibleZones} positions={positions.filter((p) => p.businessId === targetBusinessId)} employees={employees.filter((e) => e.businessId === targetBusinessId && e.id !== editing?.id)} businesses={businesses} onSave={save} onCancel={() => { setShowModal(false); setEditing(null); }} lockedZoneId={isZM && (profile.zoneIds || []).length === 1 ? profile.zoneIds[0] : null} allowedZoneIds={isZM ? (profile.zoneIds || []) : null} businessId={targetBusinessId} isOwner={isOwner || isBM} />
        </Modal>
      )}
      {viewing && (
        <EmployeeDetailModal employee={viewing} zones={zones} positions={positions} employees={employees} businesses={businesses} canWrite={canWrite} canResign={canResign} canRaise={isOwner} ops={ops} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setShowModal(true); setViewing(null); }} onDelete={() => { del(viewing.id); setViewing(null); }} onResign={() => setResigningEmp(viewing)} onRehire={() => doRehire(viewing)} onRaise={() => setRaisingEmp(viewing)} />
      )}
      {resigningEmp && (
        <ResignModal employee={resigningEmp} onClose={() => setResigningEmp(null)} onConfirm={doResign} />
      )}
      {raisingEmp && (
        <SalaryRaiseModal employee={raisingEmp} ops={ops} onClose={() => setRaisingEmp(null)} onSaved={() => setRaisingEmp(null)} />
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
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">บันทึกการลาออก</h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
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
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">ปรับเงินเดือน</h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-auto space-y-4">
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

function EmployeeDetailModal({ employee, zones, positions, employees, businesses, canWrite, canResign, canRaise, ops, onClose, onEdit, onDelete, onResign, onRehire, onRaise }) {
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
  }, [employee.id, canRaise]);
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
                {employee.nationality && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-50 text-sky-800 text-sm rounded-md"><Globe className="w-3.5 h-3.5" />{natLabel(employee.nationality)}</span>}
              </div>
              {additionalBizs.length > 0 && (
                <div className="mt-3 p-3 bg-sky-50/60 border border-sky-200 rounded-lg">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-sky-900 mb-1.5">
                    <Building2 className="w-3.5 h-3.5" />ดูแลธุรกิจ ({1 + additionalBizs.length} ที่)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {primaryBiz && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 text-xs font-medium rounded">{primaryBiz.name}<span className="text-[9px] text-emerald-600">หลัก</span></span>}
                    {additionalBizs.map((b) => <span key={b.id} className="inline-flex items-center px-2 py-0.5 bg-white border border-stone-300 text-stone-700 text-xs rounded">{b.name}</span>)}
                  </div>
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

          {(employee.address || employee.nationalId || employee.notes) && (
            <div className="px-6 pb-6 space-y-4 pt-4">
              {employee.address && <DetailBlock icon={MapPin} label="ที่อยู่" value={employee.address} />}
              {employee.nationalId && <DetailBlock icon={Shield} label="เลขบัตรประชาชน" value={employee.nationalId} mono />}
              {employee.notes && <DetailBlock icon={Edit2} label="บันทึกเพิ่มเติม" value={employee.notes} />}
            </div>
          )}
          {canRaise && (
            <div className="px-6 pb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><Wallet className="w-4 h-4 text-stone-500" /><h3 className="font-medium text-stone-700">เงินเดือนปัจจุบัน {fmtMoney(employee.baseSalary)} ฿</h3></div>
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
              <button onClick={onDelete} className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"><Trash2 className="w-4 h-4" /> ลบ</button>
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

function InfoItem({ icon: Icon, label, value, hint }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0"><div className="text-xs text-stone-500">{label}</div><div className="text-sm text-stone-800 break-words">{value || <span className="text-stone-400">—</span>}{hint && <span className="text-stone-500 text-xs ml-1.5">({hint})</span>}</div></div>
    </div>
  );
}

function DetailBlock({ icon: Icon, label, value, mono }) {
  return (
    <div className="bg-stone-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1.5"><Icon className="w-4 h-4 text-stone-500" /><div className="text-xs font-medium text-stone-600">{label}</div></div>
      <div className={`text-sm text-stone-800 whitespace-pre-wrap ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function EmployeeForm({ initial, zones, positions, employees, businesses, onSave, onCancel, lockedZoneId, allowedZoneIds, businessId, isOwner }) {
  const [name, setName] = useState(initial?.name || '');
  const [nickname, setNickname] = useState(initial?.nickname || '');
  const [employeeNumber, setEmployeeNumber] = useState(initial?.employeeNumber || '');
  const [photo, setPhoto] = useState(initial?.photo || '');
  const [zoneId, setZoneId] = useState(initial?.zoneId || lockedZoneId || '');
  const [positionId, setPositionId] = useState(initial?.positionId || '');
  const [managerId, setManagerId] = useState(initial?.managerId || '');
  const [additionalBusinessIds, setAdditionalBusinessIds] = useState(initial?.additionalBusinessIds || []);
  const [phone, setPhone] = useState(initial?.phone || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [startDate, setStartDate] = useState(initial?.startDate || '');
  const [birthDate, setBirthDate] = useState(initial?.birthDate || '');
  const [nationalId, setNationalId] = useState(initial?.nationalId || '');
  const [emergencyContact, setEmergencyContact] = useState(initial?.emergencyContact || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [nationality, setNationality] = useState(initial?.nationality || 'thai');
  const [hasWorkPermit, setHasWorkPermit] = useState(initial?.hasWorkPermit ?? null);
  const [workPermitExpiry, setWorkPermitExpiry] = useState(initial?.workPermitExpiry || '');
  const [hasPassport, setHasPassport] = useState(initial?.hasPassport ?? null);
  const [workPermitDocs, setWorkPermitDocs] = useState(initial?.workPermitDocs || []);
  const [passportDocs, setPassportDocs] = useState(initial?.passportDocs || []);
  const [baseSalary, setBaseSalary] = useState(initial?.baseSalary ?? '');
  const [holidayQuota, setHolidayQuota] = useState(initial?.holidayQuota ?? 4);
  const [hasSocialSecurity, setHasSocialSecurity] = useState(initial?.hasSocialSecurity ?? false);
  const [roomFee, setRoomFee] = useState(initial?.roomFee ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

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
      phone: phone.trim(), email: email.trim(), address: address.trim(),
      startDate: startDate || null, birthDate: birthDate || null, nationalId: nationalId.trim(),
      emergencyContact: emergencyContact.trim(), notes: notes.trim(),
      nationality: nationality || null,
      hasWorkPermit: foreign ? hasWorkPermit : null,
      workPermitExpiry: foreign && hasWorkPermit === true ? (workPermitExpiry || null) : null,
      hasPassport: foreign ? hasPassport : null,
      workPermitDocs: foreign ? workPermitDocs : [],
      passportDocs: foreign ? passportDocs : [],
      baseSalary: Number(baseSalary) || 0,
      holidayQuota: Number(holidayQuota) || 0,
      hasSocialSecurity: !!hasSocialSecurity,
      roomFee: Number(roomFee) || 0,
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
            {NATIONALITIES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
        </FormField>
        <FormField label="เบอร์โทร"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0XX-XXX-XXXX" /></FormField>
        <FormField label="อีเมล"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label="วันเริ่มงาน"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label="วันเกิด"><input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label={nationality === 'thai' ? 'เลขบัตรประชาชน' : 'เลขบัตรประจำตัว'}><input value={nationalId} onChange={(e) => setNationalId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
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

      {isOwner && (
        <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-medium text-emerald-900">ข้อมูลค่าจ้าง (สำหรับคำนวณเงินเดือน)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="เงินเดือนฐาน (บาท)">
              <input type="number" min="0" step="0.01" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 12000" />
              {Number(baseSalary) > 0 && <p className="text-xs text-stone-500 mt-1">ค่าแรง/วัน = {fmtMoney(Number(baseSalary) / 30)} บาท</p>}
            </FormField>
            <FormField label="โควต้าวันหยุด/เดือน">
              <input type="number" min="0" value={holidayQuota} onChange={(e) => setHolidayQuota(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 4" />
              <p className="text-xs text-stone-500 mt-1">หยุดเกินจากนี้จะถูกหักเป็นรายวัน</p>
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
            <MultiDocUpload label="ไฟล์/รูปพาสปอร์ต" paths={passportDocs} businessId={businessId} docType="passport" onChange={setPassportDocs} />
          )}
        </div>
      )}

      <FormField label="ที่อยู่"><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <FormField label="บันทึกเพิ่มเติม"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

function PillRadio({ selected, onClick, icon: Icon, children }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm rounded-lg border-2 transition-all ${selected ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-medium' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'}`}>
      {Icon && <Icon className={`w-4 h-4 ${selected ? 'text-emerald-700' : 'text-stone-400'}`} />}
      {children}
    </button>
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

// ============ ORG CHART ============
function OrgChartPage({ businesses, zones, positions, employees, profile, activeBusinessId }) {
  const isOwner = profile.isOwner;
  const isBM = profile.isBM;
  const isZM = profile.isZM;
  const isViewer = profile.isViewer;
  const visible = useMemo(() => {
    const act = employees.filter(isActive);
    if (isOwner) return act.filter((e) => e.businessId === activeBusinessId);
    if (isBM) {
      const ids = profile.businessIds || [];
      return act.filter((e) => ids.includes(e.businessId) && (!activeBusinessId || e.businessId === activeBusinessId));
    }
    if (isZM) return act.filter((e) => (profile.zoneIds || []).includes(e.zoneId));
    if (isViewer) {
      const noScope = profile.businessIds.length === 0 && profile.zoneIds.length === 0;
      if (noScope) return act.filter((e) => e.businessId === activeBusinessId);
      return act.filter((e) => (profile.businessIds.includes(e.businessId) || profile.zoneIds.includes(e.zoneId)) && (!activeBusinessId || e.businessId === activeBusinessId));
    }
    return [];
  }, [employees, profile, activeBusinessId, isOwner, isBM, isZM, isViewer]);
  const roots = visible.filter((e) => !e.managerId || !visible.find((x) => x.id === e.managerId));

  if ((isOwner || isBM || isViewer) && !activeBusinessId) return <div className="h-screen overflow-auto"><PageHeader title="แผนผังองค์กร" /><div className="p-8"><EmptyState icon={Network} title="เลือกธุรกิจที่ sidebar" description="แผนผังองค์กรเป็นข้อมูลเฉพาะของแต่ละธุรกิจ — ต้องเลือกธุรกิจที่ sidebar ก่อน" /></div></div>;

  return (
    <div className="h-screen overflow-auto">
      <PageHeader title="แผนผังองค์กร" subtitle="สายบังคับบัญชาตามที่กำหนด" />
      <div className="p-8">
        {visible.length === 0 ? <EmptyState icon={Network} title="ยังไม่มีพนักงาน" /> : (
          <div className="bg-white rounded-xl border border-stone-200 p-6 overflow-auto">
            <EmployeeTree employees={roots} allEmployees={visible} zones={zones} positions={positions} level={0} />
          </div>
        )}
      </div>
    </div>
  );
}

function EmployeeTree({ employees, allEmployees, zones, positions, level }) {
  return (
    <div className={level === 0 ? 'space-y-3' : 'mt-3 ml-8 pl-5 border-l-2 border-stone-200 space-y-3'}>
      {employees.map((emp) => {
        const reports = allEmployees.filter((e) => e.managerId === emp.id);
        const zone = zones.find((z) => z.id === emp.zoneId);
        const pos = positions.find((p) => p.id === emp.positionId);
        return (
          <div key={emp.id}>
            <div className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 rounded-lg">
              <Avatar photo={emp.photo} name={dispName(emp)} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-800 truncate flex items-center gap-2">
                  <span className="font-mono text-xs text-stone-400">#{emp.employeeNumber}</span>
                  <span className="truncate">{dispName(emp)}</span>
                </div>
                <div className="text-xs text-stone-500 truncate">{pos?.name || '—'} {zone && `• ${zone.name}`}{reports.length > 0 && ` • ดูแล ${reports.length} คน`}</div>
              </div>
            </div>
            {reports.length > 0 && <EmployeeTree employees={reports} allEmployees={allEmployees} zones={zones} positions={positions} level={level + 1} />}
          </div>
        );
      })}
    </div>
  );
}

// ============ PAYROLL PAGE ============
function PayrollPage({ businesses, zones, positions, employees, activeBusinessId, ops }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [payrolls, setPayrolls] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState('list'); // 'list' | 'quick'

  // พนักงานในธุรกิจนี้ — คนทำงานอยู่ + คนลาออกที่ยังมีงวดค้างจ่ายในเดือนนี้
  const payrollEmpIds = useMemo(() => new Set(payrolls.map((p) => p.employeeId)), [payrolls]);
  const bizEmployees = useMemo(() => {
    if (!activeBusinessId) return [];
    return employees.filter((e) => {
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
      setPayrolls(ps); setItems(its); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeBusinessId, year, month, reload]);

  const payrollByEmp = useMemo(() => {
    const m = {}; payrolls.forEach((p) => { m[p.employeeId] = p; }); return m;
  }, [payrolls]);
  const itemsByPayroll = useMemo(() => {
    const m = {}; items.forEach((i) => { (m[i.payrollId] ||= []).push(i); }); return m;
  }, [items]);

  const totalNet = useMemo(() => {
    return bizEmployees.reduce((sum, emp) => {
      const p = payrollByEmp[emp.id];
      if (!p) return sum;
      return sum + computePayroll(p, itemsByPayroll[p.id] || []).net;
    }, 0);
  }, [bizEmployees, payrollByEmp, itemsByPayroll]);

  const finalizedCount = payrolls.filter((p) => p.status === 'finalized').length;

  if (!activeBusinessId) return (
    <div className="h-screen overflow-auto"><PageHeader title="เงินเดือน" /><div className="p-8"><EmptyState icon={Wallet} title="เลือกธุรกิจที่ sidebar" description="เงินเดือนคำนวณแยกตามธุรกิจ — เลือกธุรกิจก่อน" /></div></div>
  );

  const bizName = businesses.find((b) => b.id === activeBusinessId)?.name;
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="h-screen overflow-auto">
      <PageHeader title="เงินเดือน" subtitle={`${bizName} — ${MONTH_NAMES[month - 1]} ${year + 543}`} />
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
            <button onClick={() => setMode('list')} className={`px-3 py-2 text-sm font-medium ${mode === 'list' ? 'bg-emerald-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>รายคน</button>
            <button onClick={() => setMode('quick')} className={`px-3 py-2 text-sm font-medium ${mode === 'quick' ? 'bg-emerald-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>กรอกเร็ว</button>
          </div>
          <div className="flex-1" />
          <div className="flex gap-3">
            <div className="px-4 py-2 bg-white border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">ทำแล้ว</div>
              <div className="text-sm font-semibold text-stone-800">{payrolls.length}/{bizEmployees.length} คน {finalizedCount > 0 && <span className="text-emerald-600">(ปิดงวด {finalizedCount})</span>}</div>
            </div>
            <div className="px-4 py-2 bg-emerald-900 text-white rounded-lg">
              <div className="text-xs text-emerald-200">ยอดจ่ายรวม</div>
              <div className="text-sm font-semibold">{fmtMoney(totalNet)} ฿</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-stone-400">กำลังโหลด...</div>
        ) : bizEmployees.length === 0 ? (
          <EmptyState icon={Users} title="ยังไม่มีพนักงาน" description="เพิ่มพนักงานก่อนที่หน้า 'พนักงาน'" />
        ) : mode === 'quick' ? (
          <PayrollQuickEntry
            bizEmployees={bizEmployees} positions={positions}
            payrollByEmp={payrollByEmp} itemsByPayroll={itemsByPayroll}
            year={year} month={month} businessId={activeBusinessId} ops={ops}
            onSaved={() => setReload((r) => r + 1)}
            onOpenDetail={(emp) => setEditingEmp(emp)}
          />
        ) : (
          <div className="space-y-2">
            {bizEmployees.map((emp) => {
              const p = payrollByEmp[emp.id];
              const calc = p ? computePayroll(p, itemsByPayroll[p.id] || []) : null;
              const pos = positions.find((x) => x.id === emp.positionId);
              const noSalary = !emp.baseSalary || emp.baseSalary <= 0;
              return (
                <div key={emp.id} className={`bg-white rounded-xl border-2 ${p?.status === 'finalized' ? 'border-emerald-300' : 'border-stone-200'} p-4 flex items-center gap-4 hover:shadow-sm transition-all`}>
                  <Avatar photo={emp.photo} name={dispName(emp)} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-stone-400">#{emp.employeeNumber}</span>
                      <span className="font-medium text-stone-800 truncate">{dispName(emp)}</span>
                      {p?.status === 'finalized' && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded"><CheckCircle2 className="w-2.5 h-2.5" />ปิดงวดแล้ว</span>}
                    </div>
                    <div className="text-sm text-stone-500 truncate">{pos?.name || 'ยังไม่กำหนดตำแหน่ง'} • ฐาน {fmtMoney(emp.baseSalary)} ฿</div>
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
          year={year} month={month} businessId={activeBusinessId}
          ops={ops}
          onClose={() => setEditingEmp(null)}
          onSaved={() => { setEditingEmp(null); setReload((r) => r + 1); }}
        />
      )}
    </div>
  );
}

// ============ PAYROLL EDITOR MODAL ============
function PayrollEditor({ employee, existing, existingItems, year, month, businessId, ops, onClose, onSaved }) {
  const isFinalized = existing?.status === 'finalized';
  // ค่าตั้งต้น: ถ้ามี payroll แล้วใช้ค่าเดิม ถ้าไม่มีดึงจากข้อมูลพนักงาน
  const [f, setF] = useState(() => ({
    baseSalary: existing?.baseSalary ?? employee.baseSalary ?? 0,
    holidayQuota: existing?.holidayQuota ?? employee.holidayQuota ?? 4,
    commission: existing?.commission ?? 0,
    holidayWorkDays: existing?.holidayWorkDays ?? 0,
    holidayDaysTaken: existing?.holidayDaysTaken ?? 0,
    lateDeduction: existing?.lateDeduction ?? 0,
    socialSecurity: existing?.socialSecurity ?? (employee.hasSocialSecurity ? calcSocialSecurity(employee.baseSalary) : 0),
    roomFee: existing?.roomFee ?? employee.roomFee ?? 0,
    paidViaCompany: existing?.paidViaCompany ?? 0,
    note: existing?.note ?? '',
  }));
  const [bonusTasks, setBonusTasks] = useState(existingItems.filter((i) => i.kind === 'bonus_task').map((i) => ({ label: i.label, amount: i.amount })));
  const [advances, setAdvances] = useState(existingItems.filter((i) => i.kind === 'advance').map((i) => ({ label: i.label, amount: i.amount })));
  const [otherDeductions, setOtherDeductions] = useState(existingItems.filter((i) => i.kind === 'other_deduction').map((i) => ({ label: i.label, amount: i.amount })));
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

  const ItemList = ({ title, list, setList, color, addLabel }) => (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-stone-600">{title}</span>
        <button type="button" onClick={() => setList([...list, { label: '', amount: '' }])} className={`text-xs ${color} hover:underline flex items-center gap-0.5`}><Plus className="w-3 h-3" />{addLabel}</button>
      </div>
      <div className="space-y-1.5">
        {list.length === 0 && <div className="text-xs text-stone-400 italic">ไม่มี</div>}
        {list.map((it, idx) => (
          <div key={idx} className="flex gap-2">
            <input value={it.label} onChange={(e) => setList(list.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} placeholder="รายการ" className="flex-1 px-2 py-1.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <input type="number" min="0" step="0.01" value={it.amount} onChange={(e) => setList(list.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))} placeholder="0.00" className="w-28 px-2 py-1.5 text-sm border border-stone-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <button type="button" onClick={() => setList(list.filter((_, i) => i !== idx))} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );

  const Row = ({ label, children, hint }) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="text-sm text-stone-600">{label}{hint && <span className="block text-[11px] text-stone-400">{hint}</span>}</div>
      <div className="w-36">{children}</div>
    </div>
  );
  const numInput = (k, opts = {}) => (
    <input type="number" min="0" step="0.01" disabled={isFinalized || opts.disabled} value={f[k]} onChange={(e) => set(k, e.target.value)} className="w-full px-2 py-1.5 text-sm border border-stone-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
  );

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar photo={employee.photo} name={dispName(employee)} size={40} />
            <div>
              <div className="font-semibold text-stone-800">{dispName(employee)} <span className="font-mono text-xs text-stone-400">#{employee.employeeNumber}</span></div>
              <div className="text-xs text-stone-500">{MONTH_NAMES[month - 1]} {year + 543}{isFinalized && ' • ปิดงวดแล้ว'}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-auto space-y-5">
          {isFinalized && (
            <div className="flex items-start gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4 mt-0.5" /><div>งวดนี้ปิดแล้ว — กด "เปิดแก้ไข" ด้านล่างถ้าต้องการแก้</div>
            </div>
          )}

          {/* รายรับ */}
          <div className="bg-emerald-50/40 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 mb-2"><TrendingUp className="w-4 h-4" />รายรับ</div>
            <Row label="เงินเดือนฐาน" hint={`ค่าแรง/วัน = ${fmtMoney(calc.daily)} ฿`}>{numInput('baseSalary')}</Row>
            <Row label="คอมมิชชั่น">{numInput('commission')}</Row>
            <Row label="ทำงานวันหยุด (วัน)" hint={`+${fmtMoney(calc.holidayWorkPay)} ฿`}>{numInput('holidayWorkDays')}</Row>
            <div className="mt-2 pt-2 border-t border-emerald-100"><ItemList title="งานเสริม (ล้างห้องน้ำ, ลอกท่อ ฯลฯ)" list={bonusTasks} setList={setBonusTasks} color="text-emerald-700" addLabel="เพิ่มงานเสริม" /></div>
          </div>

          {/* วันหยุด */}
          <div className="bg-stone-50 rounded-xl p-4">
            <div className="text-sm font-semibold text-stone-700 mb-2">วันหยุด</div>
            <Row label="โควต้าวันหยุดเดือนนี้">{numInput('holidayQuota')}</Row>
            <Row label="วันหยุดที่ใช้จริง" hint={calc.excessDays > 0 ? `เกิน ${calc.excessDays} วัน → หัก ${fmtMoney(calc.excessHolidayDeduction)} ฿` : 'ไม่เกินโควต้า'}>{numInput('holidayDaysTaken')}</Row>
          </div>

          {/* รายการหัก */}
          <div className="bg-red-50/40 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-red-700 mb-2"><TrendingDown className="w-4 h-4" />รายการหัก</div>
            {calc.excessHolidayDeduction > 0 && <Row label="หักหยุดเกิน (อัตโนมัติ)"><div className="text-right text-sm text-red-600 py-1.5">−{fmtMoney(calc.excessHolidayDeduction)}</div></Row>}
            <Row label="หักมาสาย">{numInput('lateDeduction')}</Row>
            <Row label="ประกันสังคม" hint={employee.hasSocialSecurity ? '5% ของฐาน สูงสุด 750' : 'พนักงานนี้ไม่มี ปกส.'}>{numInput('socialSecurity')}</Row>
            <Row label="ค่าห้องพัก">{numInput('roomFee')}</Row>
            <Row label="รับผ่านบัญชี บ.วีเอสจง แล้ว" hint="เงินที่จ่ายไปแล้ว">{numInput('paidViaCompany')}</Row>
            <div className="mt-2 pt-2 border-t border-red-100 space-y-3">
              <ItemList title="เบิกล่วงหน้า" list={advances} setList={setAdvances} color="text-red-600" addLabel="เพิ่มการเบิก" />
              <ItemList title="หักอื่นๆ" list={otherDeductions} setList={setOtherDeductions} color="text-red-600" addLabel="เพิ่มรายการหัก" />
            </div>
          </div>

          <FormField label="หมายเหตุ"><textarea disabled={isFinalized} value={f.note} onChange={(e) => set('note', e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" /></FormField>

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
          {isFinalized ? (
            <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 text-amber-700 hover:bg-amber-50 border border-amber-300 rounded-lg text-sm font-medium">เปิดแก้ไข (ยกเลิกปิดงวด)</button>
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
function PayrollQuickEntry({ bizEmployees, positions, payrollByEmp, itemsByPayroll, year, month, businessId, ops, onSaved, onOpenDetail }) {
  const isMobile = useIsMobile();
  const [drafts, setDrafts] = useState({});
  const [touched, setTouched] = useState(() => new Set());
  const [itemsEmp, setItemsEmp] = useState(null);
  const [saving, setSaving] = useState(false);

  // init drafts เมื่อข้อมูลเปลี่ยน
  useEffect(() => {
    const d = {};
    bizEmployees.forEach((emp) => {
      const p = payrollByEmp[emp.id];
      const its = p ? (itemsByPayroll[p.id] || []) : [];
      d[emp.id] = buildPayrollDraft(emp, p, its);
    });
    setDrafts(d);
    setTouched(new Set());
  }, [bizEmployees, payrollByEmp, itemsByPayroll]);

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

  const eligible = bizEmployees.filter((e) => Number(e.baseSalary) > 0);
  const noSalaryCount = bizEmployees.length - eligible.length;

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
          {touched.size > 0 ? <span className="text-amber-700 font-medium">● แก้ไข {touched.size} คน ยังไม่บันทึก</span> : 'พิมพ์ตัวเลขในช่อง → กด Enter ลงคนถัดไป'}
          {noSalaryCount > 0 && <span className="ml-2 text-amber-600">({noSalaryCount} คนยังไม่ตั้งเงินเดือน)</span>}
        </div>
        <button onClick={saveAll} disabled={saving || touched.size === 0} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
          <Save className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : `บันทึกทั้งหมด${touched.size > 0 ? ` (${touched.size})` : ''}`}
        </button>
      </div>

      {isMobile ? (
        /* ===== มือถือ: การ์ด ===== */
        <div className="space-y-3">
          {eligible.map((emp) => {
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
            return (
              <div key={emp.id} className={`bg-white rounded-xl border-2 p-4 ${dirty ? 'border-amber-300 bg-amber-50/20' : locked ? 'border-emerald-300' : 'border-stone-200'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <Avatar photo={emp.photo} name={dispName(emp)} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-stone-800 truncate"><span className="font-mono text-xs text-stone-400 mr-1">#{emp.employeeNumber}</span>{dispName(emp)}</div>
                    <div className="text-xs text-stone-500">ฐาน {fmtMoney(d.baseSalary)} ฿ • {fmtMoney(calc.daily)}/วัน</div>
                  </div>
                  {locked && <span className="text-[10px] text-emerald-700 font-medium">ปิดงวดแล้ว</span>}
                </div>
                <F label="คอมมิชชั่น" field="commission" />
                <F label="ทำงานวันหยุด (วัน)" field="holidayWorkDays" hint={calc.holidayWorkPay > 0 ? `+${fmtMoney(calc.holidayWorkPay)}` : null} />
                <F label="วันหยุดที่ใช้" field="holidayDaysTaken" hint={`โควต้า ${d.holidayQuota}${calc.excessDays > 0 ? ` • เกิน ${calc.excessDays}` : ''}`} />
                <F label="หักมาสาย" field="lateDeduction" />
                <F label="รับผ่านบัญชีแล้ว" field="paidViaCompany" />
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
                <th className="text-right px-2 py-2.5">คอม</th>
                <th className="text-center px-2 py-2.5">ทำหยุด</th>
                <th className="text-center px-2 py-2.5">หยุด</th>
                <th className="text-right px-2 py-2.5">สาย</th>
                <th className="text-right px-2 py-2.5">รับแล้ว</th>
                <th className="text-center px-2 py-2.5">รายการ</th>
                <th className="text-right px-3 py-2.5 sticky right-0 bg-stone-50 z-10">สุทธิ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {eligible.map((emp, rowIdx) => {
                const d = drafts[emp.id]; if (!d) return null;
                const locked = d.status === 'finalized';
                const calc = computePayroll(d, d.items);
                const dirty = touched.has(emp.id);
                const ic = itemCount(emp.id);
                return (
                  <tr key={emp.id} className={dirty ? 'bg-amber-50/40' : locked ? 'bg-emerald-50/30' : 'hover:bg-stone-50'}>
                    <td className={`px-3 py-2 sticky left-0 z-10 ${dirty ? 'bg-amber-50' : locked ? 'bg-emerald-50/60' : 'bg-white'}`}>
                      <button onClick={() => onOpenDetail(emp)} className="text-left">
                        <div className="font-medium text-stone-800 truncate max-w-[150px] hover:text-emerald-700"><span className="font-mono text-xs text-stone-400 mr-1">#{emp.employeeNumber}</span>{dispName(emp)}</div>
                        {locked && <span className="text-[10px] text-emerald-700">ปิดงวดแล้ว</span>}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-right text-stone-500 whitespace-nowrap">{fmtMoney(d.baseSalary)}</td>
                    <td className="px-2 py-2"><Cell empId={emp.id} field="commission" col="commission" rowIdx={rowIdx} locked={locked} /></td>
                    <td className="px-2 py-2 text-center"><Cell empId={emp.id} field="holidayWorkDays" col="holidayWorkDays" rowIdx={rowIdx} locked={locked} w="w-14" /></td>
                    <td className="px-2 py-2 text-center"><Cell empId={emp.id} field="holidayDaysTaken" col="holidayDaysTaken" rowIdx={rowIdx} locked={locked} w="w-14" /></td>
                    <td className="px-2 py-2"><Cell empId={emp.id} field="lateDeduction" col="lateDeduction" rowIdx={rowIdx} locked={locked} /></td>
                    <td className="px-2 py-2"><Cell empId={emp.id} field="paidViaCompany" col="paidViaCompany" rowIdx={rowIdx} locked={locked} /></td>
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
          onApply={(items) => { updItems(itemsEmp.id, items); setItemsEmp(null); }}
          onClose={() => setItemsEmp(null)}
        />
      )}
    </div>
  );
}

// ============ POPUP: งานเสริม/เบิก/หักอื่นๆ (สำหรับโหมดกรอกเร็ว) ============
function PayrollItemsModal({ employee, draft, onApply, onClose }) {
  const [bonusTasks, setBonusTasks] = useState(draft.items.filter((i) => i.kind === 'bonus_task').map((i) => ({ label: i.label, amount: i.amount })));
  const [advances, setAdvances] = useState(draft.items.filter((i) => i.kind === 'advance').map((i) => ({ label: i.label, amount: i.amount })));
  const [others, setOthers] = useState(draft.items.filter((i) => i.kind === 'other_deduction').map((i) => ({ label: i.label, amount: i.amount })));

  const apply = () => {
    onApply([
      ...bonusTasks.map((i) => ({ ...i, kind: 'bonus_task' })),
      ...advances.map((i) => ({ ...i, kind: 'advance' })),
      ...others.map((i) => ({ ...i, kind: 'other_deduction' })),
    ]);
  };

  const List = ({ title, list, setList, color, addLabel }) => (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-stone-600">{title}</span>
        <button type="button" onClick={() => setList([...list, { label: '', amount: '' }])} className={`text-xs ${color} hover:underline flex items-center gap-0.5`}><Plus className="w-3 h-3" />{addLabel}</button>
      </div>
      <div className="space-y-1.5">
        {list.length === 0 && <div className="text-xs text-stone-400 italic">ไม่มี</div>}
        {list.map((it, idx) => (
          <div key={idx} className="flex gap-2">
            <input value={it.label} onChange={(e) => setList(list.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} placeholder="รายการ" className="flex-1 px-2 py-1.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <input type="number" step="0.01" value={it.amount} onChange={(e) => setList(list.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))} placeholder="0.00" className="w-28 px-2 py-1.5 text-sm border border-stone-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <button type="button" onClick={() => setList(list.filter((_, i) => i !== idx))} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <div className="font-semibold text-stone-800 text-sm">{dispName(employee)} — งานเสริม/เบิก/หัก</div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-auto space-y-4">
          <div className="bg-emerald-50/50 rounded-xl p-3"><List title="งานเสริม (ล้างห้องน้ำ, ลอกท่อ ฯลฯ)" list={bonusTasks} setList={setBonusTasks} color="text-emerald-700" addLabel="เพิ่ม" /></div>
          <div className="bg-red-50/40 rounded-xl p-3 space-y-3">
            <List title="เบิกล่วงหน้า" list={advances} setList={setAdvances} color="text-red-600" addLabel="เพิ่ม" />
            <List title="หักอื่นๆ" list={others} setList={setOthers} color="text-red-600" addLabel="เพิ่ม" />
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

// ============ USERS PAGE ============
function UsersPage({ profiles, businesses, zones, ops, currentUserId }) {
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const save = async (d) => {
    await ops.profile.update(editing.id, d);
    setShowModal(false); setEditing(null);
  };
  const del = async (id) => {
    if (id === currentUserId) return alert('ลบบัญชีตัวเองไม่ได้');
    if (!confirm('ลบผู้ใช้นี้? (พวกเขาจะไม่สามารถเข้าระบบได้)')) return;
    await ops.profile.delete(id);
  };

  const roleConfig = {
    owner: { label: 'เจ้าของระบบ', cls: 'bg-amber-100 text-amber-800', icon: Crown },
    business_manager: { label: 'หัวหน้าธุรกิจ', cls: 'bg-rose-100 text-rose-800', icon: Building2 },
    zone_manager: { label: 'หัวหน้าโซน', cls: 'bg-emerald-100 text-emerald-800', icon: User },
    viewer: { label: 'ผู้ดู', cls: 'bg-sky-100 text-sky-800', icon: Eye },
    pending: { label: 'รออนุมัติ', cls: 'bg-stone-100 text-stone-600', icon: Clock },
  };

  const describeScope = (u) => {
    const bizIds = u.businessIds || [];
    const zoneIds = u.zoneIds || [];
    if (u.role === 'owner') return 'ทุกธุรกิจ';
    if (u.role === 'pending') return '—';
    if (u.role === 'viewer' && bizIds.length === 0 && zoneIds.length === 0) return 'ทั้งระบบ (ดูได้หมด)';
    const bizNames = bizIds.map((id) => businesses.find((b) => b.id === id)?.name).filter(Boolean);
    const zoneNames = zoneIds.map((id) => {
      const z = zones.find((zn) => zn.id === id);
      if (!z) return null;
      const biz = businesses.find((b) => b.id === z.businessId);
      return biz ? `${biz.name} → ${z.name}` : z.name;
    }).filter(Boolean);
    const parts = [];
    if (bizNames.length) parts.push(`ธุรกิจ: ${bizNames.join(', ')}`);
    if (zoneNames.length) parts.push(`โซน: ${zoneNames.join(', ')}`);
    return parts.length ? parts.join(' • ') : '—';
  };

  return (
    <div className="h-screen overflow-auto">
      <PageHeader title="ผู้ใช้ระบบ" subtitle="จัดการสิทธิ์การเข้าถึง — ผู้ใช้ใหม่สมัครเองที่หน้า login แล้วเจ้าของอนุมัติที่นี่" />
      <div className="p-4 md:p-8">
        <div className="space-y-3">
          {profiles.map((u) => {
            const cfg = roleConfig[u.role] || roleConfig.pending;
            const Icon = cfg.icon;
            const isPending = u.role === 'pending';
            const isSelf = u.id === currentUserId;
            return (
              <div key={u.id} className={`bg-white rounded-xl border-2 ${isPending ? 'border-amber-300 bg-amber-50/30' : 'border-stone-200'} p-4 hover:shadow-sm transition-all`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${u.role === 'owner' ? 'bg-amber-100' : isPending ? 'bg-amber-100' : 'bg-stone-100'}`}>
                    <Icon className={`w-5 h-5 ${u.role === 'owner' ? 'text-amber-600' : isPending ? 'text-amber-600' : 'text-stone-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-stone-800">{u.name || '—'}</span>
                      {isSelf && <span className="text-xs text-stone-400">(คุณ)</span>}
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                    </div>
                    <div className="text-sm text-stone-600">{describeScope(u)}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                  {isPending && (
                    <button onClick={() => { setEditing(u); setShowModal(true); }} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm">
                      <CheckCircle2 className="w-4 h-4" /> อนุมัติ / กำหนดสิทธิ์
                    </button>
                  )}
                  {!isPending && (
                    <button onClick={() => { setEditing(u); setShowModal(true); }} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-stone-100 rounded-lg text-sm text-stone-700 border border-stone-200">
                      <Edit2 className="w-3.5 h-3.5" /> แก้ไข
                    </button>
                  )}
                  {!isSelf && (
                    <button onClick={() => del(u.id)} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-red-50 rounded-lg text-sm text-red-600 border border-red-200">
                      <Trash2 className="w-3.5 h-3.5" /> ลบ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {showModal && (
        <Modal title="แก้ไขผู้ใช้" onClose={() => { setShowModal(false); setEditing(null); }} wide>
          <ProfileEditForm initial={editing} businesses={businesses} zones={zones} onSave={save} onCancel={() => { setShowModal(false); setEditing(null); }} isSelf={editing?.id === currentUserId} />
        </Modal>
      )}
    </div>
  );
}

function ProfileEditForm({ initial, businesses, zones, onSave, onCancel, isSelf }) {
  const [name, setName] = useState(initial?.name || '');
  const [role, setRole] = useState(initial?.role || 'pending');
  const [businessIds, setBusinessIds] = useState(initial?.businessIds || []);
  const [zoneIds, setZoneIds] = useState(initial?.zoneIds || []);
  // สำหรับ viewer: เลือก scope แบบใด
  const [viewerScope, setViewerScope] = useState(() => {
    if (initial?.role !== 'viewer') return 'system';
    if ((initial?.businessIds || []).length > 0) return 'business';
    if ((initial?.zoneIds || []).length > 0) return 'zone';
    return 'system';
  });

  const toggleBiz = (id) => setBusinessIds(businessIds.includes(id) ? businessIds.filter((x) => x !== id) : [...businessIds, id]);
  const toggleZone = (id) => setZoneIds(zoneIds.includes(id) ? zoneIds.filter((x) => x !== id) : [...zoneIds, id]);

  const submit = () => {
    if (role === 'business_manager' && businessIds.length === 0) return alert('กรุณาเลือกธุรกิจอย่างน้อย 1 ที่');
    if (role === 'zone_manager' && zoneIds.length === 0) return alert('กรุณาเลือกโซนอย่างน้อย 1 ที่');
    if (role === 'viewer' && viewerScope === 'business' && businessIds.length === 0) return alert('กรุณาเลือกธุรกิจ');
    if (role === 'viewer' && viewerScope === 'zone' && zoneIds.length === 0) return alert('กรุณาเลือกโซน');
    let bizIds = [], zIds = [];
    if (role === 'business_manager') bizIds = businessIds;
    else if (role === 'zone_manager') zIds = zoneIds;
    else if (role === 'viewer') {
      if (viewerScope === 'business') bizIds = businessIds;
      else if (viewerScope === 'zone') zIds = zoneIds;
    }
    onSave({ name: name.trim(), role, businessIds: bizIds, zoneIds: zIds });
  };

  const ROLES = [
    { id: 'owner', label: 'เจ้าของระบบ', desc: 'ทุกอย่าง', icon: Crown, color: 'amber' },
    { id: 'business_manager', label: 'หัวหน้าธุรกิจ', desc: 'จัดการ 1+ ธุรกิจ', icon: Building2, color: 'rose' },
    { id: 'zone_manager', label: 'หัวหน้าโซน', desc: 'จัดการ 1+ โซน', icon: User, color: 'emerald' },
    { id: 'viewer', label: 'ผู้ดู', desc: 'ดูอย่างเดียว', icon: Eye, color: 'sky' },
    { id: 'pending', label: 'รออนุมัติ', desc: 'ยังไม่มีสิทธิ์', icon: Clock, color: 'stone' },
  ];

  return (
    <div className="space-y-4">
      <FormField label="ชื่อ-นามสกุล"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>

      <FormField label="บทบาท">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const sel = role === r.id;
            const disabled = isSelf && r.id !== 'owner';
            return (
              <button key={r.id} type="button" onClick={() => !disabled && setRole(r.id)} disabled={disabled} className={`p-3 rounded-lg border-2 text-center text-xs transition-all ${sel ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <Icon className={`w-5 h-5 mx-auto mb-1 ${sel ? `text-${r.color}-600` : 'text-stone-400'}`} />
                <div className="font-medium text-stone-800">{r.label}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">{r.desc}</div>
              </button>
            );
          })}
        </div>
        {isSelf && <p className="text-xs text-amber-700 mt-2">⚠️ เปลี่ยน role ของตัวเองไม่ได้ (กันการล็อกตัวเองออก)</p>}
      </FormField>

      {/* Business Manager: multi-select businesses */}
      {role === 'business_manager' && (
        <FormField label="ธุรกิจที่ดูแล" required>
          <p className="text-xs text-stone-500 -mt-1 mb-2">ติ๊กธุรกิจที่ผู้ใช้คนนี้จะจัดการได้ (โซน, ตำแหน่ง, พนักงานในธุรกิจนี้)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-auto p-1">
            {businesses.map((b) => {
              const checked = businessIds.includes(b.id);
              return (
                <label key={b.id} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleBiz(b.id)} className="w-4 h-4 rounded text-emerald-700" />
                  <Building2 className={`w-4 h-4 ${checked ? 'text-emerald-700' : 'text-stone-400'}`} />
                  <span className={`text-sm ${checked ? 'font-medium text-emerald-900' : 'text-stone-700'}`}>{b.name}</span>
                </label>
              );
            })}
          </div>
        </FormField>
      )}

      {/* Zone Manager: multi-select zones */}
      {role === 'zone_manager' && (
        <FormField label="โซนที่ดูแล" required>
          <p className="text-xs text-stone-500 -mt-1 mb-2">ติ๊กโซนที่ผู้ใช้คนนี้จะจัดการพนักงานได้ (เลือกได้หลายโซน, ข้ามธุรกิจได้)</p>
          <div className="space-y-3 max-h-72 overflow-auto p-1">
            {businesses.map((b) => {
              const bizZones = zones.filter((z) => z.businessId === b.id);
              if (bizZones.length === 0) return null;
              return (
                <div key={b.id}>
                  <div className="text-xs font-medium text-stone-600 mb-1.5 flex items-center gap-1.5"><Building2 className="w-3 h-3" />{b.name}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {bizZones.map((z) => {
                      const checked = zoneIds.includes(z.id);
                      return (
                        <label key={z.id} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleZone(z.id)} className="w-4 h-4 rounded text-emerald-700" />
                          <MapPin className={`w-3.5 h-3.5 ${checked ? 'text-emerald-700' : 'text-stone-400'}`} />
                          <span className={`text-sm ${checked ? 'font-medium text-emerald-900' : 'text-stone-700'}`}>{z.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </FormField>
      )}

      {/* Viewer: choose scope */}
      {role === 'viewer' && (
        <>
          <FormField label="ขอบเขตการดู">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setViewerScope('system')} className={`p-3 rounded-lg border-2 text-center text-xs ${viewerScope === 'system' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>
                <div className="font-medium text-stone-800">ทั้งระบบ</div>
                <div className="text-[10px] text-stone-500 mt-0.5">เห็นทุกธุรกิจ</div>
              </button>
              <button type="button" onClick={() => setViewerScope('business')} className={`p-3 rounded-lg border-2 text-center text-xs ${viewerScope === 'business' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>
                <div className="font-medium text-stone-800">เฉพาะธุรกิจ</div>
                <div className="text-[10px] text-stone-500 mt-0.5">เลือก 1+ ธุรกิจ</div>
              </button>
              <button type="button" onClick={() => setViewerScope('zone')} className={`p-3 rounded-lg border-2 text-center text-xs ${viewerScope === 'zone' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>
                <div className="font-medium text-stone-800">เฉพาะโซน</div>
                <div className="text-[10px] text-stone-500 mt-0.5">เลือก 1+ โซน</div>
              </button>
            </div>
          </FormField>
          {viewerScope === 'business' && (
            <FormField label="ธุรกิจที่ดูได้" required>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-auto p-1">
                {businesses.map((b) => {
                  const checked = businessIds.includes(b.id);
                  return (
                    <label key={b.id} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleBiz(b.id)} className="w-4 h-4 rounded text-emerald-700" />
                      <Building2 className={`w-4 h-4 ${checked ? 'text-emerald-700' : 'text-stone-400'}`} />
                      <span className={`text-sm ${checked ? 'font-medium text-emerald-900' : 'text-stone-700'}`}>{b.name}</span>
                    </label>
                  );
                })}
              </div>
            </FormField>
          )}
          {viewerScope === 'zone' && (
            <FormField label="โซนที่ดูได้" required>
              <div className="space-y-3 max-h-64 overflow-auto p-1">
                {businesses.map((b) => {
                  const bizZones = zones.filter((z) => z.businessId === b.id);
                  if (bizZones.length === 0) return null;
                  return (
                    <div key={b.id}>
                      <div className="text-xs font-medium text-stone-600 mb-1.5 flex items-center gap-1.5"><Building2 className="w-3 h-3" />{b.name}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {bizZones.map((z) => {
                          const checked = zoneIds.includes(z.id);
                          return (
                            <label key={z.id} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleZone(z.id)} className="w-4 h-4 rounded text-emerald-700" />
                              <MapPin className={`w-3.5 h-3.5 ${checked ? 'text-emerald-700' : 'text-stone-400'}`} />
                              <span className={`text-sm ${checked ? 'font-medium text-emerald-900' : 'text-stone-700'}`}>{z.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </FormField>
          )}
        </>
      )}

      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

// ============ REUSABLE UI ============
function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] flex flex-col`}>
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, required, children }) {
  return <div><label className="block text-sm font-medium text-stone-700 mb-1.5">{label}{required && <span className="text-red-500"> *</span>}</label>{children}</div>;
}

function FormActions({ onCancel, onSubmit }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button onClick={onCancel} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">ยกเลิก</button>
      <button onClick={onSubmit} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Save className="w-4 h-4" /> บันทึก</button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-stone-100 mb-4"><Icon className="w-8 h-8 text-stone-400" /></div>
      <h3 className="text-lg font-semibold text-stone-700">{title}</h3>
      {description && <p className="text-sm text-stone-500 mt-1 mb-5 max-w-md mx-auto">{description}</p>}
      {action}
    </div>
  );
}
