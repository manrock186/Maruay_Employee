import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users, Building2, MapPin, Briefcase, Settings, LogOut,
  Plus, Edit2, Trash2, Search, X, Upload, ChevronRight,
  Home, UserCircle, Shield, Layers, Camera, Calendar, Phone, Mail,
  Eye, EyeOff, Network, Save, ChevronDown, ChevronUp, User,
  KeyRound, AlertCircle, CheckCircle2, Crown, Award, MapPinned, Clock,
  Globe, CreditCard, BookOpen, FileText, ExternalLink, Paperclip
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
      setProfile(fromDB(data));
    })();
  }, [session]);

  // ---- LOAD ALL DATA + REALTIME ----
  useEffect(() => {
    if (!profile || profile.role === 'pending') return;

    let cancelled = false;
    setDataLoading(true);
    (async () => {
      const [b, z, p, e, up] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at'),
        supabase.from('zones').select('*').order('created_at'),
        supabase.from('positions').select('*').order('created_at'),
        supabase.from('employees').select('*').order('created_at'),
        profile.role === 'owner'
          ? supabase.from('user_profiles').select('*, email:id').order('created_at')
          : Promise.resolve({ data: [profile] }),
      ]);
      if (cancelled) return;
      setBusinesses(fromDB(b.data || []));
      setZones(fromDB(z.data || []));
      setPositions(fromDB(p.data || []));
      setEmployees(fromDB(e.data || []));
      setProfiles(fromDB(up.data || []));
      const firstBiz = (b.data || [])[0];
      if (firstBiz && !activeBusinessId) setActiveBusinessId(firstBiz.id);
      setDataLoading(false);
    })();

    // Realtime
    const handle = (setter) => (payload) => {
      const { eventType, new: nv, old: ov } = payload;
      if (eventType === 'INSERT') {
        setter((prev) => (prev.some((r) => r.id === nv.id) ? prev : [...prev, fromDB(nv)]));
      } else if (eventType === 'UPDATE') {
        setter((prev) => prev.map((r) => (r.id === nv.id ? fromDB(nv) : r)));
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
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [profile?.id, profile?.role]);

  // ---- HANDLERS ----
  const changeBusiness = (id) => { setActiveBusinessId(id || null); setActiveZoneId(null); };
  const openZoneEmployees = (bid, zid) => {
    setActiveBusinessId(bid); setActiveZoneId(zid); setView('employees');
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
    },
    profile: {
      update: (id, d) => updateRow('user_profiles', id, d),
      delete: (id) => deleteRow('user_profiles', id),
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
        activeBusinessId={activeBusinessId}
        setActiveBusinessId={changeBusiness}
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
        {view === 'businesses' && profile.role === 'owner' && (
          <BusinessesPage
            businesses={businesses}
            zones={zones}
            employees={employees}
            positions={positions}
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
        {view === 'users' && profile.role === 'owner' && (
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
          <h1 className="text-3xl font-semibold text-white tracking-tight">ระบบจัดการพนักงาน</h1>
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

// ============ SIDEBAR ============
function Sidebar({ view, setView, profile, businesses, activeBusinessId, setActiveBusinessId }) {
  const isOwner = profile.role === 'owner';
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'ภาพรวม', icon: Home },
    { id: 'businesses', label: 'ธุรกิจและโซน', icon: Building2, ownerOnly: true },
    { id: 'positions', label: 'ตำแหน่ง', icon: Award },
    { id: 'employees', label: 'พนักงาน', icon: Users },
    { id: 'orgchart', label: 'แผนผังองค์กร', icon: Network },
    { id: 'users', label: 'ผู้ใช้ระบบ', icon: Shield, ownerOnly: true },
  ];

  return (
    <aside className="w-64 bg-emerald-950 text-emerald-50 flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-emerald-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-950" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-semibold text-white text-sm">ระบบพนักงาน</div>
            <div className="text-xs text-emerald-300/70">Employee System</div>
          </div>
        </div>
      </div>
      {isOwner && businesses.length > 0 && (
        <div className="p-3 border-b border-emerald-900">
          <label className="block text-xs text-emerald-300/70 mb-1.5 px-1">ธุรกิจที่กำลังดู</label>
          <select value={activeBusinessId || ''} onChange={(e) => setActiveBusinessId(e.target.value)} className="w-full px-3 py-2 bg-emerald-900 border border-emerald-800 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500">
            <option value="">🌐 ทุกธุรกิจ (ภาพรวม)</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          if (item.ownerOnly && !isOwner) return null;
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
            {isOwner ? <Crown className="w-4 h-4 text-amber-400" /> : <User className="w-4 h-4 text-emerald-200" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{profile.name || 'ผู้ใช้'}</div>
            <div className="text-xs text-emerald-300/70">{isOwner ? 'เจ้าของระบบ' : 'หัวหน้าโซน'}</div>
          </div>
        </div>
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
        <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-stone-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// ============ DASHBOARD ============
function Dashboard({ profile, businesses, zones, employees, positions, activeBusinessId, setView }) {
  const isOwner = profile.role === 'owner';
  const visibleEmployees = useMemo(() => {
    if (isOwner) return activeBusinessId
      ? employees.filter((e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))
      : employees;
    return employees.filter((e) => e.zoneId === profile.zoneId);
  }, [employees, profile, activeBusinessId, isOwner]);
  const visibleZones = useMemo(() => {
    if (isOwner) return activeBusinessId ? zones.filter((z) => z.businessId === activeBusinessId) : zones;
    return zones.filter((z) => z.id === profile.zoneId);
  }, [zones, profile, activeBusinessId, isOwner]);

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
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0"><Building2 className="w-6 h-6 text-emerald-800" /></div>
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
  const submit = () => { if (!name.trim()) return alert('กรุณากรอกชื่อธุรกิจ'); onSave({ name: name.trim(), description: description.trim() }); };
  return (
    <div className="space-y-4">
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
  const isOwner = profile.role === 'owner';
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
        {isOwner && <button onClick={() => { setEditing({}); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" /> เพิ่มตำแหน่ง</button>}
      </PageHeader>
      <div className="p-8">
        {bizPositions.length === 0 ? (
          <EmptyState icon={Award} title="ยังไม่มีตำแหน่ง" description="เพิ่มตำแหน่งและกำหนดสายบังคับบัญชา (เช่น ผู้จัดการ → หัวหน้าโซน → พนักงาน)" />
        ) : (
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <PositionTree positions={roots} allPositions={bizPositions} employees={employees} onEdit={(p) => { setEditing(p); setShowModal(true); }} onDelete={del} isOwner={isOwner} level={0} />
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
        const count = employees.filter((e) => e.positionId === pos.id).length;
        return (
          <div key={pos.id}>
            <div className="flex items-center justify-between p-3 bg-stone-50 hover:bg-stone-100 rounded-lg group">
              <div className="flex items-center gap-3">
                <Award className="w-4 h-4 text-emerald-700" />
                <div>
                  <div className="flex items-center gap-2"><div className="font-medium text-stone-800">{pos.name}</div>
                    {pos.crossZone && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-medium rounded-full"><MapPin className="w-2.5 h-2.5" />ไม่จำกัดโซน</span>}
                  </div>
                  <div className="text-xs text-stone-500">{count} คน{pos.description ? ` • ${pos.description}` : ''}</div>
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
  const submit = () => { if (!name.trim()) return alert('กรุณากรอกชื่อตำแหน่ง'); onSave({ name: name.trim(), description: description.trim(), parentId: parentId || null, crossZone }); };
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
  const isOwner = profile.role === 'owner';

  const visibleEmployees = useMemo(() => {
    let list = isOwner
      ? (activeBusinessId
        ? employees.filter((e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))
        : employees)
      : employees.filter((e) => e.zoneId === profile.zoneId);
    if (isOwner && activeZoneId === '__nozone__') list = list.filter((e) => !e.zoneId);
    else if (isOwner && activeZoneId) list = list.filter((e) => e.zoneId === activeZoneId);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((e) => e.name?.toLowerCase().includes(s) || e.nickname?.toLowerCase().includes(s) || e.employeeNumber?.toLowerCase().includes(s) || e.phone?.includes(s) || e.email?.toLowerCase().includes(s));
    }
    return list;
  }, [employees, isOwner, activeBusinessId, profile, activeZoneId, search]);

  const visibleZones = isOwner ? zones.filter((z) => z.businessId === activeBusinessId) : zones.filter((z) => z.id === profile.zoneId);
  const filteredZoneName = activeZoneId === '__nozone__' ? 'ไม่จำกัดโซน' : (activeZoneId ? zones.find((z) => z.id === activeZoneId)?.name : null);

  const save = async (d) => {
    const payload = { ...d, businessId: isOwner ? activeBusinessId : profile.businessId };
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

  const allMode = isOwner && !activeBusinessId;

  if (isOwner && businesses.length === 0) return (
    <div className="h-screen overflow-auto"><PageHeader title="พนักงาน" /><div className="p-8"><EmptyState icon={Users} title="ยังไม่มีธุรกิจ" description="สร้างธุรกิจก่อนที่หน้า 'ธุรกิจและโซน'" /></div></div>
  );

  return (
    <div className="h-screen overflow-auto">
      <PageHeader title={filteredZoneName ? `พนักงาน — ${filteredZoneName}` : (allMode ? 'พนักงานทุกคน — ภาพรวมทุกธุรกิจ' : 'พนักงาน')} subtitle={`${visibleEmployees.length} คน${filteredZoneName ? ' ในโซนนี้' : (allMode ? ' รวมทุกธุรกิจ' : '')}`}>
        <button onClick={() => { setEditing({}); setShowModal(true); }} disabled={allMode} title={allMode ? 'เลือกธุรกิจที่ sidebar ก่อน' : ''} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" /> เพิ่มพนักงาน</button>
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
              return (
                <div key={emp.id} onClick={() => setViewing(emp)} className="bg-white rounded-xl border border-stone-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-emerald-300 transition-all group overflow-hidden cursor-pointer">
                  <div className="relative aspect-square bg-gradient-to-br from-stone-100 to-stone-200 overflow-hidden">
                    {emp.photo ? <img src={emp.photo} alt={display} className="w-full h-full object-contain" /> : (
                      <div className="w-full h-full flex items-center justify-center"><div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 text-white text-3xl font-semibold flex items-center justify-center">{initials}</div></div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setEditing(emp); setShowModal(true); }} className="p-2 bg-white/95 hover:bg-white rounded-lg text-stone-700 shadow-sm"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); del(emp.id); }} className="p-2 bg-white/95 hover:bg-white rounded-lg text-red-600 shadow-sm"><Trash2 className="w-4 h-4" /></button>
                    </div>
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
          <EmployeeForm initial={editing} zones={visibleZones} positions={positions.filter((p) => p.businessId === (isOwner ? activeBusinessId : profile.businessId))} employees={employees.filter((e) => e.businessId === (isOwner ? activeBusinessId : profile.businessId) && e.id !== editing?.id)} businesses={businesses} onSave={save} onCancel={() => { setShowModal(false); setEditing(null); }} lockedZoneId={!isOwner ? profile.zoneId : null} businessId={isOwner ? activeBusinessId : profile.businessId} isOwner={isOwner} />
        </Modal>
      )}
      {viewing && (
        <EmployeeDetailModal employee={viewing} zones={zones} positions={positions} employees={employees} businesses={businesses} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setShowModal(true); setViewing(null); }} onDelete={() => { del(viewing.id); setViewing(null); }} />
      )}
    </div>
  );
}

function EmployeeDetailModal({ employee, zones, positions, employees, businesses, onClose, onEdit, onDelete }) {
  const zone = zones.find((z) => z.id === employee.zoneId);
  const pos = positions.find((p) => p.id === employee.positionId);
  const mgr = employees.find((e) => e.id === employee.managerId);
  const reports = employees.filter((e) => e.managerId === employee.id);
  const primaryBiz = businesses?.find((b) => b.id === employee.businessId);
  const additionalBizs = (employee.additionalBusinessIds || []).map((id) => businesses?.find((b) => b.id === id)).filter(Boolean);
  const fmt = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : null);
  const yos = employee.startDate ? Math.floor((Date.now() - new Date(employee.startDate)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const display = dispName(employee);
  const hasNick = employee.nickname?.trim() && employee.nickname.trim() !== employee.name?.trim();
  const initials = display.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const foreign = isForeign(employee.nationality);

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
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-500"><X className="w-5 h-5" /></button>
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
              <h1 className="text-2xl font-semibold text-stone-800">{display}</h1>
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
        <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
          <button onClick={onDelete} className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"><Trash2 className="w-4 h-4" /> ลบ</button>
          <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Edit2 className="w-4 h-4" /> แก้ไข</button>
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

function EmployeeForm({ initial, zones, positions, employees, businesses, onSave, onCancel, lockedZoneId, businessId, isOwner }) {
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
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
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
  const isOwner = profile.role === 'owner';
  const visible = useMemo(() => {
    if (isOwner) return employees.filter((e) => e.businessId === activeBusinessId);
    return employees.filter((e) => e.zoneId === profile.zoneId);
  }, [employees, isOwner, activeBusinessId, profile]);
  const roots = visible.filter((e) => !e.managerId || !visible.find((x) => x.id === e.managerId));

  if (isOwner && !activeBusinessId) return <div className="h-screen overflow-auto"><PageHeader title="แผนผังองค์กร" /><div className="p-8"><EmptyState icon={Network} title="เลือกธุรกิจที่ sidebar" description="แผนผังองค์กรเป็นข้อมูลเฉพาะของแต่ละธุรกิจ — ต้องเลือกธุรกิจที่ sidebar ก่อน" /></div></div>;

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

  return (
    <div className="h-screen overflow-auto">
      <PageHeader title="ผู้ใช้ระบบ" subtitle="จัดการสิทธิ์การเข้าถึง — ผู้ใช้ใหม่สมัครเองที่หน้า login แล้วเจ้าของอนุมัติที่นี่" />
      <div className="p-8">
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider">ชื่อ</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider">บทบาท</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider">ขอบเขต</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {profiles.map((u) => {
                const biz = businesses.find((b) => b.id === u.businessId);
                const zone = zones.find((z) => z.id === u.zoneId);
                const roleLabel = u.role === 'owner' ? 'เจ้าของระบบ' : u.role === 'zone_manager' ? 'หัวหน้าโซน' : 'รออนุมัติ';
                const roleClass = u.role === 'owner' ? 'bg-amber-100 text-amber-800' : u.role === 'zone_manager' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600';
                return (
                  <tr key={u.id} className="hover:bg-stone-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {u.role === 'owner' ? <Crown className="w-4 h-4 text-amber-500" /> : u.role === 'pending' ? <Clock className="w-4 h-4 text-stone-400" /> : <User className="w-4 h-4 text-stone-400" />}
                        <span className="font-medium text-stone-800">{u.name || '—'}</span>
                        {u.id === currentUserId && <span className="text-xs text-stone-400">(คุณ)</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${roleClass}`}>{roleLabel}</span></td>
                    <td className="px-6 py-4 text-sm text-stone-600">{u.role === 'owner' ? 'ทุกธุรกิจ' : zone ? `${biz?.name} → ${zone.name}` : '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(u); setShowModal(true); }} className="p-1.5 hover:bg-stone-100 rounded text-stone-600"><Edit2 className="w-4 h-4" /></button>
                        {u.id !== currentUserId && <button onClick={() => del(u.id)} className="p-1.5 hover:bg-red-50 rounded text-red-600"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && (
        <Modal title="แก้ไขผู้ใช้" onClose={() => { setShowModal(false); setEditing(null); }}>
          <ProfileEditForm initial={editing} businesses={businesses} zones={zones} onSave={save} onCancel={() => { setShowModal(false); setEditing(null); }} isSelf={editing?.id === currentUserId} />
        </Modal>
      )}
    </div>
  );
}

function ProfileEditForm({ initial, businesses, zones, onSave, onCancel, isSelf }) {
  const [name, setName] = useState(initial?.name || '');
  const [role, setRole] = useState(initial?.role || 'pending');
  const [businessId, setBusinessId] = useState(initial?.businessId || '');
  const [zoneId, setZoneId] = useState(initial?.zoneId || '');
  const availableZones = zones.filter((z) => z.businessId === businessId);
  const submit = () => {
    if (role === 'zone_manager' && (!businessId || !zoneId)) return alert('กรุณาเลือกธุรกิจและโซน');
    onSave({ name: name.trim(), role, businessId: role === 'owner' ? null : businessId || null, zoneId: role === 'owner' ? null : zoneId || null });
  };

  return (
    <div className="space-y-4">
      <FormField label="ชื่อ-นามสกุล"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
      <FormField label="บทบาท">
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setRole('owner')} disabled={isSelf && role === 'owner'} className={`p-2 rounded-lg border-2 text-center text-xs transition-all ${role === 'owner' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>
            <Crown className={`w-4 h-4 mx-auto mb-1 ${role === 'owner' ? 'text-amber-500' : 'text-stone-400'}`} /><div className="font-medium text-stone-800">เจ้าของ</div>
          </button>
          <button type="button" onClick={() => setRole('zone_manager')} className={`p-2 rounded-lg border-2 text-center text-xs ${role === 'zone_manager' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>
            <User className={`w-4 h-4 mx-auto mb-1 ${role === 'zone_manager' ? 'text-emerald-700' : 'text-stone-400'}`} /><div className="font-medium text-stone-800">หัวหน้าโซน</div>
          </button>
          <button type="button" onClick={() => setRole('pending')} className={`p-2 rounded-lg border-2 text-center text-xs ${role === 'pending' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>
            <Clock className={`w-4 h-4 mx-auto mb-1 ${role === 'pending' ? 'text-stone-700' : 'text-stone-400'}`} /><div className="font-medium text-stone-800">รออนุมัติ</div>
          </button>
        </div>
      </FormField>
      {role === 'zone_manager' && (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="ธุรกิจ" required><select value={businessId} onChange={(e) => { setBusinessId(e.target.value); setZoneId(''); }} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white"><option value="">— เลือก —</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></FormField>
          <FormField label="โซน" required><select value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={!businessId} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white disabled:bg-stone-100"><option value="">— เลือก —</option>{availableZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></FormField>
        </div>
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
