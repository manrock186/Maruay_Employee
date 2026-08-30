import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Users, Menu } from 'lucide-react';
import { supabase, fromDB, toDB } from './supabase.js';
import { applyTheme } from './lib/format.js';
import { businessPositionId } from './lib/business.js';
import { MONTH_NAMES, fmtMoney } from './lib/payroll.js';
import { sortByOrder, orderRowsToMap, applySubsetOrder, allDepartments, stripEmployeePay, stripPositionPay } from './lib/order.js';
import { LoadingScreen, PageLoading } from './ui/index.jsx';
import { AuthScreen } from './components/AuthScreen.jsx';
import { PendingScreen } from './components/PendingScreen.jsx';
import { NotificationBell } from './components/NotificationBell.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { Dashboard } from './pages/Dashboard.jsx';

// โหลดหน้าอื่นแบบ lazy — แต่ละหน้าเป็น chunk แยก ดาวน์โหลดตอนเปิดหน้านั้นจริงเท่านั้น
// (Dashboard เป็นหน้าแรกหลังล็อกอิน จึงโหลดมาพร้อมกันเลย ไม่ให้เห็น spinner)
const AuditLogPage = lazy(() => import('./pages/AuditLogPage.jsx').then((m) => ({ default: m.AuditLogPage })));
const BusinessesPage = lazy(() => import('./pages/BusinessesPage.jsx').then((m) => ({ default: m.BusinessesPage })));
const PositionsPage = lazy(() => import('./pages/PositionsPage.jsx').then((m) => ({ default: m.PositionsPage })));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage.jsx').then((m) => ({ default: m.EmployeesPage })));
const OrgChartPage = lazy(() => import('./pages/OrgChartPage.jsx').then((m) => ({ default: m.OrgChartPage })));
const RoomRentPage = lazy(() => import('./pages/RoomRentPage.jsx').then((m) => ({ default: m.RoomRentPage })));
const RecurringTaskPage = lazy(() => import('./pages/RecurringTaskPage.jsx').then((m) => ({ default: m.RecurringTaskPage })));
const AdvancePage = lazy(() => import('./pages/AdvancePage.jsx').then((m) => ({ default: m.AdvancePage })));
const CommissionPage = lazy(() => import('./pages/CommissionPage.jsx').then((m) => ({ default: m.CommissionPage })));
const PayrollPage = lazy(() => import('./pages/PayrollPage.jsx').then((m) => ({ default: m.PayrollPage })));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx').then((m) => ({ default: m.UsersPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx').then((m) => ({ default: m.SettingsPage })));


// ============ MAIN APP ============
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const [view, setView] = useState('dashboard');
  const [businesses, setBusinesses] = useState([]);
  const [zonesRaw, setZones] = useState([]);
  const [positions, setPositions] = useState([]);
  const [employeesRaw, setEmployees] = useState([]);
  const [orderMap, setOrderMap] = useState({ employee: {}, zone: {}, department: {} });
  const [profiles, setProfiles] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notiReads, setNotiReads] = useState([]); // [{notificationId, userId}]

  // ลำดับที่ผู้ใช้ลากจัดเอง (เก็บใน display_order) — จัดครั้งเดียวตรงนี้
  // ตัวแปร employees/zones ที่โค้ดข้างล่างใช้ทั้งหมดจึงเรียงตามที่จัดไว้ ทุกหน้าเหมือนกัน
  const employees = useMemo(() => sortByOrder(employeesRaw, orderMap.employee), [employeesRaw, orderMap.employee]);
  const zones = useMemo(() => sortByOrder(zonesRaw, orderMap.zone), [zonesRaw, orderMap.zone]);
  const [expiryWarnMonths, setExpiryWarnMonths] = useState(2); // เตือนก่อนเอกสารหมดอายุกี่เดือน (ตั้งค่าทั้งระบบ)
  const [birthdayNotify, setBirthdayNotify] = useState(true);  // เปิด/ปิด แจ้งเตือนวันเกิด
  const [birthdayWarnDays, setBirthdayWarnDays] = useState(7); // เตือนวันเกิดล่วงหน้ากี่วัน

  const [activeBusinessId, setActiveBusinessId] = useState(null);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);

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
      let { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error) console.error('Profile load error:', error);
      // self-heal: ถ้าไม่มี profile (เช่นเคยถูกลบ) สร้างใหม่เป็น pending เพื่อไม่ให้ค้าง
      if (!data) {
        const fallbackName = session.user.user_metadata?.name || (session.user.email || '').split('@')[0];
        const { data: created, error: insErr } = await supabase
          .from('user_profiles')
          .insert({ id: session.user.id, name: fallbackName, role: 'pending' })
          .select('*')
          .maybeSingle();
        if (insErr) console.error('Profile self-heal error:', insErr);
        else data = created;
      }
      const p = fromDB(data);
      if (p) {
        p.businessIds = p.businessIds || [];
        p.zoneIds = p.zoneIds || [];
        p.isOwner = p.role === 'owner';
        p.isBM = p.role === 'business_manager';
        p.isZM = p.role === 'zone_manager';
        p.isViewer = p.role === 'viewer';
        p.canWrite = ['owner', 'business_manager', 'zone_manager'].includes(p.role);
        p.canManagePayroll = p.role === 'owner' || (p.role === 'business_manager' && !!p.canManagePayroll);
        p.allowedViews = Array.isArray(p.allowedViews) ? p.allowedViews : null;
      }
      setProfile(p);
      if (p?.theme) applyTheme(p.theme);
    })();
  }, [session]);

  // ---- APPLY THEME เมื่อค่าธีมเปลี่ยน ----
  useEffect(() => { applyTheme(profile?.theme); }, [profile?.theme]);

  // ---- กันค้างอยู่ในเมนูที่ถูกปิดสิทธิ์ (เช่นเจ้าของปิดสิทธิ์ระหว่างใช้งาน) ----
  useEffect(() => {
    if (!profile || profile.isOwner || profile.role === 'pending') return;
    if (!Array.isArray(profile.allowedViews)) return;
    const allowed = new Set([...profile.allowedViews, 'dashboard']);
    const gated = ['businesses', 'positions', 'employees', 'orgchart', 'payroll', 'commission', 'roomrent', 'recurringtasks', 'advances'];
    if (gated.includes(view) && !allowed.has(view)) setView('dashboard');
  }, [view, profile]);

  // สิทธิ์ดูเงินเดือนอาจเปลี่ยนระหว่างใช้งาน (owner กดให้/ยึดคืน) โดย role ไม่เปลี่ยน
  // → เก็บใน ref เพื่อให้ closure ที่อยู่ใน useEffect เห็นค่าล่าสุดเสมอ
  const canPayRef = useRef(false);
  canPayRef.current = !!profile?.canManagePayroll;
  // นับจำนวนครั้งที่ state ถูกแก้จากการบันทึกในเครื่อง → ใช้ทิ้งผลลัพธ์ refetch ที่มาช้ากว่า
  const writeEpochRef = useRef(0);

  // ---- LOAD ALL DATA + REALTIME ----
  useEffect(() => {
    if (!profile || profile.role === 'pending') return;

    let cancelled = false;
    setDataLoading(true);
    (async () => {
      const [b, z, p, e, up, noti, reads, settingsRow, orderRows] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at'),
        supabase.from('zones').select('*').order('created_at'),
        supabase.from('positions').select('*').order('created_at'),
        supabase.from('employees').select('*').order('created_at'),
        profile.isOwner
          ? supabase.from('user_profiles').select('*, email:id').order('created_at')
          : Promise.resolve({ data: [profile] }),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }),
        supabase.from('notification_reads').select('*'),
        supabase.from('app_settings').select('expiry_warn_months, birthday_notify_enabled, birthday_warn_days').eq('id', 1).maybeSingle(),
        supabase.from('display_order').select('*'),
      ]);
      if (cancelled) return;
      if (settingsRow?.data?.expiry_warn_months != null) setExpiryWarnMonths(settingsRow.data.expiry_warn_months);
      if (settingsRow?.data?.birthday_notify_enabled != null) setBirthdayNotify(settingsRow.data.birthday_notify_enabled);
      if (settingsRow?.data?.birthday_warn_days != null) setBirthdayWarnDays(settingsRow.data.birthday_warn_days);
      setBusinesses(fromDB(b.data || []));
      setZones(fromDB(z.data || []));
      const posRows = fromDB(p.data || []);
      if (!profile.canManagePayroll) posRows.forEach((r) => { delete r.standardSalary; });
      setPositions(posRows);
      const empRows = fromDB(e.data || []);
      if (!profile.canManagePayroll) empRows.forEach((r) => { delete r.baseSalary; delete r.holidayQuota; delete r.hasSocialSecurity; delete r.roomFee; delete r.salarySplit; delete r.commissionPct; delete r.probationSalary; });
      setEmployees(empRows);
      setProfiles(fromDB(up.data || []));
      setNotifications(fromDB(noti.data || []));
      setNotiReads(fromDB(reads.data || []));
      setOrderMap(orderRowsToMap(fromDB(orderRows.data || [])));
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

      // ---- auto-apply การปรับเงินเดือนที่ถึงกำหนด (owner หรือ หัวหน้าธุรกิจที่มีสิทธิ์) ----
      if (profile.canManagePayroll) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: pending } = await supabase.from('salary_changes')
          .select('*').eq('status', 'pending').lte('effective_date', today);
        if (pending && pending.length > 0 && !cancelled) {
          for (const sc of pending) {
            await supabase.from('employees').update({ base_salary: sc.new_salary }).eq('id', sc.employee_id);
            await supabase.from('salary_changes').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', sc.id);
          }
          const { data: e2 } = await supabase.from('employees').select('*').order('created_at');
          if (!cancelled && e2) setEmployees(fromDB(e2));
        }
      }

      // ---- sync notifications (owner เท่านั้น เพราะ insert ถูกจำกัดไว้ที่ owner) ----
      if (profile.isOwner && !cancelled) {
        try {
          const fresh = await syncNotifications();
          if (!cancelled && fresh) setNotifications(fresh);
        } catch (err) { console.error('syncNotifications', err); }
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
      out.canManagePayroll = out.role === 'owner' || (out.role === 'business_manager' && !!out.canManagePayroll);
      out.allowedViews = Array.isArray(out.allowedViews) ? out.allowedViews : null;
      return out;
    };
    // ตัดข้อมูลตัวเงินสำหรับคนที่ไม่มีสิทธิ์เห็นเงินเดือน (กันรั่วผ่าน realtime — RLS เป็น row-level ไม่ตัดคอลัมน์)
    const stripEmpPay = (r) => (canPayRef.current ? r : stripEmployeePay(r));
    const stripPosPay = (r) => (canPayRef.current ? r : stripPositionPay(r));
    const handle = (setter, transform) => (payload) => {
      const { eventType, new: nv, old: ov } = payload;
      const map = (row) => (transform ? transform(fromDB(row)) : fromDB(row));
      if (eventType === 'INSERT') {
        setter((prev) => (prev.some((r) => r.id === nv.id) ? prev : [...prev, map(nv)]));
      } else if (eventType === 'UPDATE') {
        setter((prev) => prev.map((r) => (r.id === nv.id ? map(nv) : r)));
        // If current user's profile changed, re-enrich
        if (nv.id === session?.user?.id) setProfile(enrichProfile(nv));
      } else if (eventType === 'DELETE') {
        setter((prev) => prev.filter((r) => r.id !== ov.id));
      }
    };
    // ---- กันข้อมูลค้าง: realtime อาจหลุดตอนพักหน้าจอ/เน็ตสะดุด หรือเครื่องอื่นเป็นคนแก้ ----
    // ดึงข้อมูลหลักใหม่เมื่อกลับมาที่แท็บ และเมื่อ realtime ต่อกลับมาได้
    let subscribedOnce = false;
    let lastRefetch = Date.now();
    let refetchSeq = 0;
    let retriesLeft = 3;
    const refetchCore = async (force) => {
      // ข้อมูลพนักงานมีรูป base64 ติดมาด้วย → กันดึงถี่เกินไป (เปลืองเน็ตบนมือถือ)
      if (!force && Date.now() - lastRefetch < 30000) return;
      lastRefetch = Date.now();
      const seq = ++refetchSeq;
      const epoch = writeEpochRef.current;
      const [b2, z2, p2, e2, o2] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at'),
        supabase.from('zones').select('*').order('created_at'),
        supabase.from('positions').select('*').order('created_at'),
        supabase.from('employees').select('*').order('created_at'),
        supabase.from('display_order').select('*'),
      ]);
      if (cancelled || seq !== refetchSeq) return;
      // ทิ้งผลลัพธ์ถ้ามีการบันทึกในเครื่องระหว่างรอ (ไม่งั้นข้อมูลเก่าจะทับสิ่งที่เพิ่งกดบันทึก)
      // แล้วลองใหม่ ไม่ใช่ปล่อยหาย — ไม่งั้นการอัปเดตจากเครื่องอื่นจะตกหล่น
      if (epoch !== writeEpochRef.current) {
        lastRefetch = 0;
        if (retriesLeft > 0) { retriesLeft -= 1; setTimeout(() => { if (!cancelled) refetchCore(true); }, 2000); }
        return;
      }
      retriesLeft = 3;
      const canPay = canPayRef.current;
      if (b2.data) setBusinesses(fromDB(b2.data));
      if (z2.data) setZones(fromDB(z2.data));
      if (p2.data) { const rows = fromDB(p2.data); if (!canPay) rows.forEach(stripPositionPay); setPositions(rows); }
      if (e2.data) { const rows = fromDB(e2.data); if (!canPay) rows.forEach(stripEmployeePay); setEmployees(rows); }
      if (o2.data) setOrderMap(orderRowsToMap(fromDB(o2.data)));
    };
    // display_order เป็นตารางเล็ก (ไม่มีรูป) ดึงใหม่ทั้งตารางถูกกว่าไล่ diff ทีละแถว
    let orderTimer = null;
    const reloadOrder = () => {
      clearTimeout(orderTimer);
      orderTimer = setTimeout(async () => {
        const { data } = await supabase.from('display_order').select('*');
        if (!cancelled && data) setOrderMap(orderRowsToMap(fromDB(data)));
      }, 150);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refetchCore(); };
    document.addEventListener('visibilitychange', onVisible);

    const ch = supabase
      .channel('app')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, handle(setBusinesses))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones' }, handle(setZones))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, handle(setPositions, stripPosPay))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, handle(setEmployees, stripEmpPay))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, handle(setProfiles))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, handle(setNotifications))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'display_order' }, () => { reloadOrder(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, (payload) => {
        const { eventType, new: nv, old: ov } = payload;
        if (eventType === 'INSERT') setNotiReads((prev) => prev.some((r) => r.notificationId === nv.notification_id && r.userId === nv.user_id) ? prev : [...prev, fromDB(nv)]);
        else if (eventType === 'DELETE') setNotiReads((prev) => prev.filter((r) => !(r.notificationId === ov.notification_id && r.userId === ov.user_id)));
      })
      .subscribe((status) => {
        // ครั้งแรกไม่ต้องดึงซ้ำ (โหลดไปแล้ว) แต่ถ้า realtime หลุดแล้วต่อกลับมาได้ ให้ดึงใหม่
        if (status === 'SUBSCRIBED') { if (subscribedOnce) refetchCore(true); subscribedOnce = true; }
      });

    return () => { cancelled = true; clearTimeout(orderTimer); document.removeEventListener('visibilitychange', onVisible); supabase.removeChannel(ch); };
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
    const [{ data: emps }, { data: poss }, { data: bizs }, { data: zns }, { data: profs }, { data: pendingRaises }, { data: settingsRow }] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('positions').select('*'),
      supabase.from('businesses').select('*'),
      supabase.from('zones').select('*'),
      supabase.from('user_profiles').select('*'),
      supabase.from('salary_changes').select('*').eq('status', 'pending'),
      supabase.from('app_settings').select('expiry_warn_months, birthday_notify_enabled, birthday_warn_days').eq('id', 1).maybeSingle(),
    ]);
    const warnMonths = settingsRow?.expiry_warn_months ?? 2;
    const bdayOn = settingsRow?.birthday_notify_enabled ?? true;
    const bdayDays = settingsRow?.birthday_warn_days ?? 7;
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
    // 2) เอกสารใกล้หมดอายุ (active) — บัตรแรงงาน / พาสปอร์ต / บัตรประจำตัว
    //    เตือนเมื่อหมดอายุภายใน warnMonths เดือน หรือหมดอายุแล้ว (ตั้งค่าได้ที่หน้า "ตั้งค่า")
    const warnCutoff = new Date(today);
    warnCutoff.setMonth(warnCutoff.getMonth() + warnMonths);
    const docChecks = [
      { type: 'permit_expiry',  title: 'บัตรแรงงานใกล้หมดอายุ',   when: (e) => e.hasWorkPermit && e.workPermitExpiry, date: (e) => e.workPermitExpiry },
      { type: 'passport_expiry', title: 'พาสปอร์ตใกล้หมดอายุ',     when: (e) => e.hasPassport && e.passportExpiry,    date: (e) => e.passportExpiry },
      { type: 'idcard_expiry',   title: 'บัตรประจำตัวใกล้หมดอายุ', when: (e) => !!e.idCardExpiry,                     date: (e) => e.idCardExpiry },
    ];
    docChecks.forEach((dc) => {
      active.filter(dc.when).forEach((e) => {
        const exp = new Date(dc.date(e));
        if (exp <= warnCutoff) {
          const days = Math.ceil((exp - today) / 86400000);
          desired.push({ dedupeKey: `${dc.type}:${e.id}`, businessId: e.businessId, zoneId: e.zoneId, type: dc.type, severity: days < 0 ? 'urgent' : 'warning', title: dc.title, body: `${e.nickname || e.name} — ${days < 0 ? 'หมดอายุแล้ว' : `เหลือ ${days} วัน`}` });
        }
      });
    });
    // 2.5) วันเกิดพนักงาน (เปิด/ปิด + ล่วงหน้ากี่วัน ตั้งค่าได้ที่หน้า "ตั้งค่า")
    if (bdayOn) {
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      active.filter((e) => e.birthDate).forEach((e) => {
        const bd = new Date(e.birthDate);
        if (isNaN(bd)) return;
        let next = new Date(startOfToday.getFullYear(), bd.getMonth(), bd.getDate());
        if (next < startOfToday) next = new Date(startOfToday.getFullYear() + 1, bd.getMonth(), bd.getDate());
        const days = Math.round((next - startOfToday) / 86400000);
        if (days <= bdayDays) {
          const dd = String(bd.getDate()).padStart(2, '0'), mm = String(bd.getMonth() + 1).padStart(2, '0');
          desired.push({ dedupeKey: `birthday:${e.id}:${next.getFullYear()}`, businessId: e.businessId, zoneId: e.zoneId, type: 'birthday', severity: 'info', title: 'วันเกิดพนักงาน', body: `${e.nickname || e.name} — ${days === 0 ? 'วันนี้วันเกิด! 🎂' : `อีก ${days} วัน (${dd}/${mm})`}` });
        }
      });
    }
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
      const count = active.filter((e) => businessPositionId(e, pos.businessId) === pos.id).length;
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
        const need = active.filter((e) => e.businessId === biz.id && Number(e.baseSalary) > 0);
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

    // 8) งานเสริมประจำขาดคน — มีคนที่ถูกมอบหมายงานเสริมประจำ "ลาออก" (เฉพาะงวดเดือนปัจจุบัน)
    {
      const yr = today.getFullYear(), mo = today.getMonth() + 1;
      const activeIds = new Set(active.map((e) => e.id));
      const { data: rtPools } = await supabase.from('recurring_task_pools').select('id,business_id,tasks').eq('period_year', yr).eq('period_month', mo);
      (rtPools || []).forEach((pool) => {
        const tasks = Array.isArray(pool.tasks) ? pool.tasks : [];
        tasks.forEach((t) => {
          const assignments = Array.isArray(t.assignments) ? t.assignments : [];
          const goneNames = assignments.filter((a) => a.empId && !activeIds.has(a.empId)).map((a) => empName(a.empId)).filter(Boolean);
          if (goneNames.length > 0) {
            const bn = bizName(pool.business_id);
            desired.push({ dedupeKey: `recurring_short:${pool.id}:${t.id}`, businessId: pool.business_id, zoneId: null, type: 'recurring_task_short', severity: 'warning', title: 'งานเสริมประจำขาดคน', body: `${t.name || 'งานเสริม'}${bn ? ` (${bn})` : ''} — ${goneNames.join(', ')} ลาออกแล้ว ต้องหาคนแทน` });
          }
        });
      });
    }

    // reconcile: ลบของเก่าที่ไม่อยู่ในชุดปัจจุบัน + insert ที่ขาด
    // ลบเฉพาะแจ้งเตือนชนิด "คำนวณจากสถานะ" (derived) — ไม่แตะแจ้งเตือนแบบ event (เช่น ตั้งเบิก expense_*)
    const DERIVED_TYPES = ['pending_user', 'permit_expiry', 'passport_expiry', 'idcard_expiry', 'birthday', 'vacancy', 'understaffed', 'overstaffed', 'payroll_incomplete', 'pending_raise', 'recurring_task_short'];
    const { data: existing } = await supabase.from('notifications').select('id,dedupe_key,type');
    const existKeys = new Set((existing || []).map((n) => n.dedupe_key));
    const desiredKeys = new Set(desired.map((d) => d.dedupeKey));
    const toDelete = (existing || []).filter((n) => !desiredKeys.has(n.dedupe_key) && DERIVED_TYPES.includes(n.type));
    const toInsert = desired.filter((d) => !existKeys.has(d.dedupeKey));
    if (toDelete.length > 0) await supabase.from('notifications').delete().in('id', toDelete.map((n) => n.id));
    if (toInsert.length > 0) await supabase.from('notifications').insert(toInsert.map((d) => toDB(d)));
    const { data: finalNoti } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
    return fromDB(finalNoti || []);
  };

  // แปลง error ของ DB ให้เป็นข้อความที่อ่านง่าย (เช่น เลขพนักงานซ้ำ = unique violation 23505)
  const friendlyDBError = (error, fallback) => {
    if (error?.code === '23505' && /employee_number/.test(error?.message || '')) {
      return 'เลขพนักงานนี้ซ้ำกับคนอื่นในระบบ กรุณาใช้เลขอื่น หรือเว้นว่างไว้เพื่อให้ระบบรันเลขให้อัตโนมัติ';
    }
    return fallback + (error?.message || '');
  };

  // ---- SYNC LOCAL STATE ----
  // อัปเดต state ทันทีหลังบันทึก ไม่รอ realtime (realtime อาจหลุด/ช้า/ถูก RLS กรอง
  // ทำให้ผู้ใช้กด "บันทึก" แล้วหน้าจอไม่เปลี่ยน ทั้งที่ข้อมูลเข้า DB แล้ว)
  const localSetters = { businesses: setBusinesses, zones: setZones, positions: setPositions, employees: setEmployees, user_profiles: setProfiles, notifications: setNotifications };
  const localTransform = (table, row) => {
    if (canPayRef.current) return row;
    if (table === 'employees') return stripEmployeePay(row);
    if (table === 'positions') return stripPositionPay(row);
    return row;
  };
  const syncLocal = (table, action, row, id) => {
    const setter = localSetters[table];
    if (!setter) return;
    // นับเฉพาะตารางที่ refetchCore ดึงจริง ไม่งั้นการบันทึก payroll_items จะไปล้ม refetch ทิ้งเปล่าๆ
    writeEpochRef.current += 1;
    if (action === 'delete') {
      setter((prev) => prev.filter((r) => r.id !== id));
      // DB มี ON DELETE CASCADE / SET NULL → ต้องทำตามใน state ไม่งั้นหน้าจอจะยังนับของที่ถูกลบไปแล้ว
      if (table === 'businesses') {
        setZones((prev) => prev.filter((z) => z.businessId !== id));
        setPositions((prev) => prev.filter((p) => p.businessId !== id));
        setEmployees((prev) => prev.filter((e) => e.businessId !== id));
        setNotifications((prev) => prev.filter((n) => n.businessId !== id));
      } else if (table === 'zones') {
        setEmployees((prev) => prev.map((e) => (e.zoneId === id ? { ...e, zoneId: null } : e)));
        setNotifications((prev) => prev.filter((n) => n.zoneId !== id));
      } else if (table === 'positions') {
        setPositions((prev) => prev.map((p) => (p.parentId === id ? { ...p, parentId: null } : p)));
        setEmployees((prev) => prev.map((e) => (e.positionId === id ? { ...e, positionId: null } : e)));
      } else if (table === 'employees') {
        setEmployees((prev) => prev.map((e) => (e.managerId === id ? { ...e, managerId: null } : e)));
      }
      return;
    }
    if (!row?.id) return;
    setter((prev) => {
      const exists = prev.some((r) => r.id === row.id);
      // merge กับของเดิม เพื่อไม่ทิ้ง field ที่ .select() ไม่คืนมา (เช่น email ของ user_profiles)
      if (exists) return prev.map((r) => (r.id === row.id ? localTransform(table, { ...r, ...row }) : r));
      return [...prev, localTransform(table, { ...row })];
    });
  };

  // CRUD: generic
  const insertRow = async (table, data) => {
    const { data: row, error } = await supabase.from(table).insert(toDB(data)).select().single();
    if (error) { alert(friendlyDBError(error, 'บันทึกไม่สำเร็จ: ')); return null; }
    const fresh = fromDB(row);
    syncLocal(table, 'insert', fresh);
    return fresh;
  };
  const updateRow = async (table, id, data) => {
    // .select() สำคัญ: ถ้า RLS บล็อก Postgres จะไม่ error แต่จะแก้ 0 แถว
    // ถ้าไม่ขอแถวกลับมา จะดูเหมือนบันทึกสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน
    const { data: rows, error } = await supabase.from(table).update(toDB(data)).eq('id', id).select();
    if (error) { alert(friendlyDBError(error, 'แก้ไขไม่สำเร็จ: ')); return false; }
    if (!rows || rows.length === 0) { alert('แก้ไขไม่สำเร็จ: ไม่พบข้อมูลนี้ หรือคุณไม่มีสิทธิ์แก้ไข (ลองรีเฟรชหน้าแล้วทำใหม่)'); return false; }
    syncLocal(table, 'update', fromDB(rows[0]));
    return true;
  };
  const deleteRow = async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return false; }
    syncLocal(table, 'delete', null, id);
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
    // ลำดับที่ผู้ใช้ลากจัดเอง — ส่งเฉพาะแถวที่ตำแหน่งเปลี่ยนจริง
    displayOrder: {
      // kind: 'employee' | 'zone' · fullIds: ลำดับใหม่ "ทั้งหมด" ของ kind นั้น
      set: async (kind, fullIds) => {
        const cur = orderMap[kind] || {};
        const rows = [];
        fullIds.forEach((id, i) => { if (cur[id] !== i + 1) rows.push({ kind, ref_id: id, position: i + 1, updated_at: new Date().toISOString() }); });
        if (!rows.length) return true;
        const before = orderMap;
        writeEpochRef.current += 1; // กัน refetchCore ที่ค้างอยู่เอาลำดับเก่ามาทับ
        // เปลี่ยนในเครื่องทันที ให้ลากแล้วเห็นผลเลย ไม่รอ round-trip
        setOrderMap((prev) => {
          const next = { ...prev, [kind]: { ...(prev[kind] || {}) } };
          fullIds.forEach((id, i) => { next[kind][id] = i + 1; });
          return next;
        });
        const { error } = await supabase.from('display_order').upsert(rows, { onConflict: 'kind,ref_id' });
        if (error) { setOrderMap(before); alert('บันทึกลำดับไม่สำเร็จ: ' + error.message); return false; }
        return true;
      },
      // จัดลำดับใหม่ "เฉพาะบางกลุ่ม" (เช่น คนในแผนกเดียว) — กลุ่มอื่นอยู่ที่เดิม
      reorder: async (kind, subsetIdsInNewOrder) => {
        const fullIds = (kind === 'zone' ? zones : employees).map((r) => r.id);
        return ops.displayOrder.set(kind, applySubsetOrder(fullIds, subsetIdsInNewOrder));
      },
      // แผนกใช้ "ชื่อ" เป็นคีย์ และใช้ร่วมกันข้ามธุรกิจ → ลำดับรวมต้องรวมแผนกของทุกธุรกิจด้วย
      // ไม่งั้นลากในธุรกิจหนึ่งจะไปรีเซ็ตลำดับแผนกที่มีแต่ในอีกธุรกิจ
      reorderDepartments: async (subsetIdsInNewOrder) => {
        const cur = orderMap.department || {};
        const all = [...new Set([...allDepartments(positions), ...Object.keys(cur)])]
          .sort((a, b) => {
            const ap = cur[a] == null ? Infinity : cur[a];
            const bp = cur[b] == null ? Infinity : cur[b];
            return ap === bp ? a.localeCompare(b, 'th') : ap - bp;
          });
        return ops.displayOrder.set('department', applySubsetOrder(all, subsetIdsInNewOrder));
      },
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
          .upsert(toDB(d), { onConflict: 'employee_id,business_id,period_year,period_month' })
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
      distinctLabels: async (kind) => {
        const { data, error } = await supabase.from('payroll_items').select('label').eq('kind', kind).limit(1000);
        if (error) { console.error(error); return []; }
        return [...new Set((data || []).map((r) => r.label).filter((l) => l && l !== '-'))];
      },
      // จดจำราคาล่าสุดของแต่ละชื่อรายการ (แยกตามชนิด) เพื่อเติมอัตโนมัติ
      recentPrices: async () => {
        const { data, error } = await supabase.from('payroll_items').select('label, amount, kind, created_at').order('created_at', { ascending: false }).limit(3000);
        if (error) { console.error(error); return {}; }
        const map = { bonus_task: {}, advance: {}, other_deduction: {} };
        (data || []).forEach((r) => {
          if (!r.label || r.label === '-') return;
          if (!map[r.kind]) map[r.kind] = {};
          if (map[r.kind][r.label] == null && r.amount != null && Number(r.amount) > 0) map[r.kind][r.label] = Number(r.amount);
        });
        return map;
      },
      add: (d) => insertRow('payroll_items', d),
      delete: (id) => deleteRow('payroll_items', id),
    },
    commission: {
      getByPeriod: async (businessId, year, month) => {
        const { data, error } = await supabase.from('commission_pools').select('*')
          .eq('business_id', businessId).eq('period_year', year).eq('period_month', month).maybeSingle();
        if (error) { console.error(error); return null; }
        return data ? fromDB(data) : null;
      },
      upsert: async (d) => {
        const { data, error } = await supabase.from('commission_pools')
          .upsert({ ...toDB(d), updated_at: new Date().toISOString() }, { onConflict: 'business_id,period_year,period_month' })
          .select().single();
        if (error) { alert('บันทึกคอมไม่สำเร็จ: ' + error.message); return null; }
        return fromDB(data);
      },
    },
    roomRent: {
      // ค่าห้องเป็นส่วนกลางของทุกธุรกิจ → คีย์ด้วยงวด (ปี/เดือน) เท่านั้น (business_id = null)
      getByPeriod: async (year, month) => {
        const { data, error } = await supabase.from('room_rent_pools').select('*')
          .is('business_id', null).eq('period_year', year).eq('period_month', month).maybeSingle();
        if (error) { console.error(error); return null; }
        return data ? fromDB(data) : null;
      },
      upsert: async (d) => {
        const { data, error } = await supabase.from('room_rent_pools')
          .upsert({ ...toDB(d), business_id: null, updated_at: new Date().toISOString() }, { onConflict: 'period_year,period_month' })
          .select().single();
        if (error) { alert('บันทึกค่าห้องไม่สำเร็จ: ' + error.message); return null; }
        return fromDB(data);
      },
    },
    recurringTask: {
      getByPeriod: async (businessId, year, month) => {
        const { data, error } = await supabase.from('recurring_task_pools').select('*')
          .eq('business_id', businessId).eq('period_year', year).eq('period_month', month).maybeSingle();
        if (error) { console.error(error); return null; }
        return data ? fromDB(data) : null;
      },
      upsert: async (d) => {
        const { data, error } = await supabase.from('recurring_task_pools')
          .upsert({ ...toDB(d), updated_at: new Date().toISOString() }, { onConflict: 'business_id,period_year,period_month' })
          .select().single();
        if (error) { alert('บันทึกงานเสริมประจำไม่สำเร็จ: ' + error.message); return null; }
        return fromDB(data);
      },
    },
    advance: {
      getByPeriod: async (businessId, year, month) => {
        const { data, error } = await supabase.from('advance_pools').select('*')
          .eq('business_id', businessId).eq('period_year', year).eq('period_month', month).maybeSingle();
        if (error) { console.error(error); return null; }
        return data ? fromDB(data) : null;
      },
      upsert: async (d) => {
        const { data, error } = await supabase.from('advance_pools')
          .upsert({ ...toDB(d), updated_at: new Date().toISOString() }, { onConflict: 'business_id,period_year,period_month' })
          .select().single();
        if (error) { alert('บันทึกการเบิกไม่สำเร็จ: ' + error.message); return null; }
        return fromDB(data);
      },
    },
    audit: {
      list: async ({ limit = 300 } = {}) => {
        const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
        if (error) { console.error(error); return []; }
        return fromDB(data) || [];
      },
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
    settings: {
      // อัปเดตค่าตั้งค่าทั้งระบบ (owner เท่านั้นตาม RLS)
      update: async (patch) => {
        const { error } = await supabase.from('app_settings').update({ ...toDB(patch), updated_at: new Date().toISOString() }).eq('id', 1);
        if (error) { alert('บันทึกการตั้งค่าไม่สำเร็จ: ' + error.message); return false; }
        return true;
      },
    },
  };

  if (authLoading) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  if (!profile) return <LoadingScreen msg="กำลังโหลดโปรไฟล์..." />;
  if (profile.role === 'pending') return <PendingScreen profile={profile} />;
  if (dataLoading) return <LoadingScreen msg="กำลังโหลดข้อมูล..." />;

  return (
    <div className="min-h-screen bg-stone-50 lg:flex">
      <style>{`
        @media (max-width: 640px) {
          /* กันมือถือ (iOS) ซูมอัตโนมัติเวลาแตะช่องกรอก: ต้องขนาด >= 16px */
          input:not([type=checkbox]):not([type=radio]), select, textarea { font-size: 16px !important; }
        }
        /* เลื่อนลื่นแบบ momentum + ไม่ให้ scroll ทะลุพื้นหลัง */
        .overflow-auto, .overflow-y-auto, .overflow-x-auto { -webkit-overflow-scrolling: touch; }
        button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
      `}</style>
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-stone-900/50 z-40 lg:hidden" />}
      <Sidebar
        view={view}
        setView={setView}
        profile={profile}
        businesses={businesses}
        zones={zones}
        activeBusinessId={activeBusinessId}
        setActiveBusinessId={changeBusiness}
        onThemeChange={changeTheme}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white/95 backdrop-blur border-b border-stone-200 z-30">
          <button onClick={() => setSidebarOpen((o) => !o)} className="p-2 rounded-lg hover:bg-stone-100 text-stone-600" title="แสดง/ซ่อนเมนู" aria-label="เมนู"><Menu className="w-5 h-5" /></button>
          <div className="w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center lg:hidden"><Users className="w-4 h-4 text-emerald-950" strokeWidth={2.5} /></div>
          <span className="font-semibold text-stone-700 text-sm lg:hidden">ระบบพนักงาน</span>
          <div className="flex-1" />
          <NotificationBell
            variant="light"
            notifications={notifications}
            notiReads={notiReads}
            userId={session.user.id}
            canManagePayroll={profile.canManagePayroll}
            ops={ops}
            onJump={(n) => {
              if (n.type === 'pending_user') setView('users');
              else if (n.type === 'payroll_incomplete' || n.type === 'pending_raise') { if (n.businessId) changeBusiness(n.businessId); setView(n.type === 'payroll_incomplete' ? 'payroll' : 'employees'); }
              else if (n.type === 'permit_expiry' || n.type === 'passport_expiry' || n.type === 'idcard_expiry' || n.type === 'birthday' || n.type === 'vacancy') { if (n.businessId) changeBusiness(n.businessId); setView('employees'); }
              else if (n.type === 'recurring_task_short') { if (n.businessId) changeBusiness(n.businessId); setView('recurringtasks'); }
              else { if (n.businessId) changeBusiness(n.businessId); setView('positions'); }
            }}
          />
        </div>
        <div className="flex-1 min-h-0">
        <ErrorBoundary>
        <Suspense fallback={<PageLoading msg="กำลังโหลดหน้า..." />}>
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
        {view === 'payroll' && profile.canManagePayroll && (
          <PayrollPage
            businesses={businesses}
            positions={positions}
            employees={employees}
            activeBusinessId={activeBusinessId}
            canReorder={profile.canWrite}
            deptOrder={orderMap.department}
            ops={ops}
          />
        )}
        {view === 'commission' && profile.canManagePayroll && (
          <CommissionPage
            businesses={businesses}
            employees={employees}
            positions={positions}
            activeBusinessId={activeBusinessId}
            ops={ops}
          />
        )}
        {view === 'roomrent' && profile.canManagePayroll && (
          <RoomRentPage
            businesses={businesses}
            employees={employees}
            activeBusinessId={activeBusinessId}
            ops={ops}
          />
        )}
        {view === 'recurringtasks' && (profile.isOwner || (profile.isBM && (!Array.isArray(profile.allowedViews) || profile.allowedViews.includes('recurringtasks')))) && (
          <RecurringTaskPage
            businesses={businesses}
            employees={employees}
            activeBusinessId={activeBusinessId}
            canSeePay={profile.canManagePayroll}
            ops={ops}
          />
        )}
        {view === 'advances' && (profile.isOwner || (profile.isBM && (!Array.isArray(profile.allowedViews) || profile.allowedViews.includes('advances')))) && (
          <AdvancePage
            businesses={businesses}
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
        {view === 'auditlog' && profile.isOwner && (
          <AuditLogPage businesses={businesses} ops={ops} />
        )}
        {view === 'settings' && profile.isOwner && (
          <SettingsPage
            expiryWarnMonths={expiryWarnMonths}
            birthdayNotify={birthdayNotify}
            birthdayWarnDays={birthdayWarnDays}
            ops={ops}
            onSaved={(m) => setExpiryWarnMonths(m)}
            onSavedBirthday={(en, d) => { setBirthdayNotify(en); setBirthdayWarnDays(d); }}
          />
        )}
        </Suspense>
        </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
