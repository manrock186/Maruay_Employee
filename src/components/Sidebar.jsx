import React, { useState, useEffect } from 'react';
import { Users, Building2, Settings, LogOut, X, Home, Shield, Eye, Network, User, KeyRound, Crown, Award, Clock, Wallet, Banknote, Percent, Sparkles, ClipboardList, FileText, ChevronDown, Calculator, Layers } from 'lucide-react';
import { supabase } from '../supabase.js';
import { ThemePicker } from './ThemePicker.jsx';
import { PushToggle } from './PushToggle.jsx';

// ตัวเลขแจ้งเตือนท้ายเมนู (เช่น ฟอร์มที่ยังไม่ส่งเดือนนี้)
const Badge = ({ n, active }) => (n > 0 ? <span className={`min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center ${active ? 'bg-emerald-950 text-amber-400' : 'bg-rose-500 text-white'}`}>{n}</span> : null);

// ============ SIDEBAR ============
function Sidebar({ view, setView, profile, businesses, zones, activeBusinessId, setActiveBusinessId, notiBell, onThemeChange, myFormCount = 0, myFormsPending = 0, open, onClose }) {
  const isOwner = profile.isOwner;
  const isBM = profile.isBM;
  const isZM = profile.isZM;
  const isViewer = profile.isViewer;
  const canManageBiz = isOwner || isBM;
  const roleLabel = isOwner ? 'เจ้าของระบบ' : isBM ? 'หัวหน้าธุรกิจ' : isZM ? 'หัวหน้าโซน' : isViewer ? 'ผู้ดู' : 'รออนุมัติ';
  const RoleIcon = isOwner ? Crown : isViewer ? Eye : User;
  // สิทธิ์เข้าถึงเมนูรายคน (ทับ role เดิม — จำกัดได้ ไม่เกินสิทธิ์ role) — เจ้าของไม่ถูกจำกัด, "ภาพรวม" เข้าได้เสมอ
  const allowedViewSet = (!isOwner && Array.isArray(profile.allowedViews)) ? new Set([...profile.allowedViews, 'dashboard']) : null;
  const navAllowed = (id) => (allowedViewSet ? allowedViewSet.has(id) : true);
  // ---- กลุ่ม "เงินเดือน": ทุกหน้าที่เอาข้อมูลมาประกอบคิดเงินเดือน รวมอยู่ใต้หัวข้อเดียว (พับ/กางได้) ----
  // คนที่ไม่มีสิทธิ์เงินเดือนไม่เห็นหัวข้อ "เงินเดือน" (เขาไม่ควรรู้ด้วยซ้ำว่าหน้าพวกนี้ไปคิดเงินเดือน) → เมนูย่อยที่เขาเข้าได้โชว์แบบแบนเหมือนเดิม
  const PAY_ITEMS = [
    { id: 'payroll', label: 'ทำเงินเดือน', icon: Calculator, show: profile.canManagePayroll && navAllowed('payroll') },
    { id: 'commission', label: 'คอมมิชชั่น', icon: Percent, show: profile.canManagePayroll && navAllowed('commission') },
    { id: 'pool2', label: 'คอมก้อนที่ 2 (ค่าเช่า)', icon: Layers, show: profile.canManagePayroll && navAllowed('commission') },
    { id: 'advances', label: 'เบิกเงิน', icon: Banknote, show: profile.canManagePayroll && (isOwner || (isBM && navAllowed('advances'))) },
    // "ไม่เห็นเงินเดือน" = ซ่อน เงินเดือน/คอมมิชชั่น/เบิกเงิน · ค่าห้องพนักงาน + งานเสริมประจำ (ไม่โชว์ยอดเงิน) ยังเห็น
    { id: 'roomrent', label: 'ค่าห้องพนักงาน', icon: KeyRound, show: (isOwner || (isBM && navAllowed('roomrent'))) },
    { id: 'recurringtasks', label: 'งานเสริมประจำ', icon: Sparkles, show: (isOwner || (isBM && navAllowed('recurringtasks'))) },
    // "ส่งข้อมูล" โชว์ตามการมอบหมายรายบัญชี (ไม่ขึ้นกับ role/เมนูที่เปิด) — เจ้าของเห็นเสมอเพื่อกรอกแทน/ตรวจ
    { id: 'myforms', label: 'ส่งข้อมูล', icon: ClipboardList, show: isOwner || myFormCount > 0, badge: myFormsPending },
    { id: 'dataforms', label: 'แบบฟอร์มข้อมูล', icon: FileText, show: isOwner },
  ];
  const payVisible = PAY_ITEMS.filter((i) => i.show !== false);
  const grouped = !!profile.canManagePayroll && payVisible.length > 0;
  const payIds = new Set(PAY_ITEMS.map((i) => i.id));
  const inPayGroup = payIds.has(view);
  const [payOpen, setPayOpen] = useState(() => inPayGroup);
  // เปิดหน้าในกลุ่ม (เช่น กดจากแจ้งเตือน/ภาพรวม) → กางให้เห็นว่าอยู่ตรงไหน
  useEffect(() => { if (inPayGroup) setPayOpen(true); }, [inPayGroup]);
  const payBadge = payVisible.reduce((s, i) => s + (i.badge || 0), 0);

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'ภาพรวม', icon: Home },
    { id: 'businesses', label: 'ธุรกิจและโซน', icon: Building2, show: canManageBiz && navAllowed('businesses') },
    { id: 'positions', label: 'ตำแหน่ง', icon: Award, show: navAllowed('positions') },
    { id: 'employees', label: 'พนักงาน', icon: Users, show: navAllowed('employees') },
    { id: 'orgchart', label: 'แผนผังองค์กร', icon: Network, show: navAllowed('orgchart') },
    ...(grouped
      ? [{ id: 'paygroup', group: true, label: 'เงินเดือน', icon: Wallet, children: payVisible, badge: payOpen ? 0 : payBadge }]
      : PAY_ITEMS),
    { id: 'users', label: 'ผู้ใช้ระบบ', icon: Shield, show: isOwner },
    { id: 'auditlog', label: 'ประวัติการแก้ไข', icon: Clock, show: isOwner },
    { id: 'settings', label: 'ตั้งค่า', icon: Settings, show: isOwner },
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

  const navClick = (id) => {
    setView(id);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) onClose?.();
  };

  return (
    <aside className={`w-64 bg-emerald-950 text-emerald-50 flex flex-col h-screen z-50 transition-transform duration-200 ease-out
      fixed inset-y-0 left-0 ${open ? 'translate-x-0' : '-translate-x-full'}
      lg:static lg:z-auto lg:translate-x-0 ${open ? 'lg:flex' : 'lg:hidden'}`}>
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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-emerald-900 text-emerald-100/80 lg:hidden" aria-label="ปิดเมนู"><X className="w-5 h-5" /></button>
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
      <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          if (item.show === false) return null;
          const Icon = item.icon;
          if (item.group) {
            // หัวข้อกลุ่ม: กดเพื่อพับ/กาง · พับอยู่แต่หน้าปัจจุบันอยู่ในกลุ่ม → หัวข้อเป็นสีเหลืองพร้อมชื่อหน้าย่อย ให้รู้ว่าอยู่ตรงไหน
            const activeChild = item.children.find((c) => c.id === view);
            const headActive = !!activeChild && !payOpen;
            return (
              <div key={item.id}>
                <button onClick={() => setPayOpen((o) => !o)} aria-expanded={payOpen} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${headActive ? 'bg-amber-500 text-emerald-950 font-medium shadow-lg shadow-amber-500/20' : 'text-emerald-100/80 hover:bg-emerald-900 hover:text-white'}`}>
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{item.label}{headActive && <span className="text-xs font-normal opacity-80"> · {activeChild.label}</span>}</span>
                  <Badge n={item.badge} active={headActive} />
                  <ChevronDown className={`w-4 h-4 transition-transform ${payOpen ? 'rotate-180' : ''} ${headActive ? '' : 'opacity-60'}`} />
                </button>
                {payOpen && (
                  <div className="ml-5 pl-2 border-l border-emerald-800/80 mt-0.5 mb-1 space-y-0.5">
                    {item.children.map((c) => {
                      const CIcon = c.icon;
                      const active = view === c.id;
                      return (
                        <button key={c.id} onClick={() => navClick(c.id)} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-all ${active ? 'bg-amber-500 text-emerald-950 font-medium shadow-lg shadow-amber-500/20' : 'text-emerald-100/75 hover:bg-emerald-900 hover:text-white'}`}>
                          <CIcon className="w-3.5 h-3.5" />
                          <span className="flex-1 text-left">{c.label}</span>
                          <Badge n={c.badge} active={active} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          const active = view === item.id;
          return (
            <button key={item.id} onClick={() => navClick(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${active ? 'bg-amber-500 text-emerald-950 font-medium shadow-lg shadow-amber-500/20' : 'text-emerald-100/80 hover:bg-emerald-900 hover:text-white'}`}>
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
              <Badge n={item.badge} active={active} />
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
        {(isOwner || isBM) && <PushToggle userId={profile.id} />}
        <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-emerald-100/80 hover:bg-emerald-900 hover:text-white transition-colors">
          <LogOut className="w-4 h-4" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}

export {
  Sidebar,
};
