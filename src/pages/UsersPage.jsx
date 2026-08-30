import React, { useState } from 'react';
import { Building2, MapPin, Edit2, Trash2, Eye, EyeOff, User, CheckCircle2, Crown, Clock, Wallet } from 'lucide-react';
import { Modal, FormField, FormActions, PageHeader } from '../ui/index.jsx';

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
    <div className="h-full overflow-auto">
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
  const [canManagePayroll, setCanManagePayroll] = useState(!!initial?.canManagePayroll);
  const [menuSet, setMenuSet] = useState(initial?.allowedViews ? new Set(initial.allowedViews) : null); // null = ทุกเมนูตามบทบาท
  // สำหรับ viewer: เลือก scope แบบใด
  const [viewerScope, setViewerScope] = useState(() => {
    if (initial?.role !== 'viewer') return 'system';
    if ((initial?.businessIds || []).length > 0) return 'business';
    if ((initial?.zoneIds || []).length > 0) return 'zone';
    return 'system';
  });

  const toggleBiz = (id) => setBusinessIds(businessIds.includes(id) ? businessIds.filter((x) => x !== id) : [...businessIds, id]);
  const toggleZone = (id) => setZoneIds(zoneIds.includes(id) ? zoneIds.filter((x) => x !== id) : [...zoneIds, id]);

  // เมนูที่ปิด/เปิดสิทธิ์รายคนได้ (ตามบทบาท) — "ภาพรวม" เข้าได้เสมอ ไม่ต้องเลือก
  const toggleMenus = [
    { id: 'businesses', label: 'ธุรกิจและโซน', when: role === 'business_manager' },
    { id: 'positions', label: 'ตำแหน่ง', when: true },
    { id: 'employees', label: 'พนักงาน', when: true },
    { id: 'orgchart', label: 'แผนผังองค์กร', when: true },
    { id: 'payroll', label: 'เงินเดือน', when: role === 'business_manager' && canManagePayroll },
    { id: 'commission', label: 'คอมมิชชั่น', when: role === 'business_manager' && canManagePayroll },
    { id: 'roomrent', label: 'ค่าห้องพนักงาน', when: role === 'business_manager' && canManagePayroll },
    { id: 'recurringtasks', label: 'งานเสริมประจำ', when: role === 'business_manager' },
    { id: 'advances', label: 'เบิกเงิน', when: role === 'business_manager' },
  ].filter((m) => m.when);
  const showMenuPicker = ['business_manager', 'zone_manager', 'viewer'].includes(role);
  const grantIds = toggleMenus.filter((m) => m.grant).map((m) => m.id);
  const restrictIds = toggleMenus.filter((m) => !m.grant).map((m) => m.id);
  // เมนูปกติ (restrict) เปิดเป็นค่าเริ่มต้น / เมนูมอบสิทธิ์ (grant เช่น ช่าง) ปิดเป็นค่าเริ่มต้น
  const isMenuOn = (id) => (menuSet ? menuSet.has(id) : !grantIds.includes(id));
  const toggleMenu = (id) => setMenuSet((prev) => {
    const base = prev ? new Set(prev) : new Set(restrictIds);
    base.has(id) ? base.delete(id) : base.add(id);
    return base;
  });

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
    // สิทธิ์เมนูรายคน: ถ้าตรงกับค่าเริ่มต้น (เมนูปกติเปิดหมด + เมนูพิเศษปิดหมด) = null (ไม่จำกัด)
    let allowedViews = null;
    if (showMenuPicker) {
      const applicable = toggleMenus.map((m) => m.id);
      const on = applicable.filter((id) => isMenuOn(id));
      const isDefault = restrictIds.every((id) => isMenuOn(id)) && grantIds.every((id) => !isMenuOn(id));
      allowedViews = isDefault ? null : on;
    }
    onSave({ name: name.trim(), role, businessIds: bizIds, zoneIds: zIds, canManagePayroll: role === 'business_manager' ? canManagePayroll : false, allowedViews });
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

      {role === 'business_manager' && (
        <FormField label="สิทธิ์เงินเดือน">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onClick={() => setCanManagePayroll(false)} className={`flex items-start gap-2.5 p-3 rounded-lg border-2 text-left transition-all ${!canManagePayroll ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
              <EyeOff className={`w-4 h-4 mt-0.5 flex-shrink-0 ${!canManagePayroll ? 'text-emerald-700' : 'text-stone-400'}`} />
              <div>
                <div className={`text-sm font-medium ${!canManagePayroll ? 'text-emerald-900' : 'text-stone-700'}`}>ไม่เห็นเงินเดือน</div>
                <div className="text-[11px] text-stone-500 mt-0.5">ซ่อนข้อมูลเงินเดือนทั้งหมด (ค่าเริ่มต้น)</div>
              </div>
            </button>
            <button type="button" onClick={() => setCanManagePayroll(true)} className={`flex items-start gap-2.5 p-3 rounded-lg border-2 text-left transition-all ${canManagePayroll ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
              <Wallet className={`w-4 h-4 mt-0.5 flex-shrink-0 ${canManagePayroll ? 'text-emerald-700' : 'text-stone-400'}`} />
              <div>
                <div className={`text-sm font-medium ${canManagePayroll ? 'text-emerald-900' : 'text-stone-700'}`}>เห็น + แก้ไขเงินเดือนได้</div>
                <div className="text-[11px] text-stone-500 mt-0.5">ทำเงินเดือน, ปรับเงินเดือน เฉพาะธุรกิจที่ดูแล</div>
              </div>
            </button>
          </div>
        </FormField>
      )}

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

      {showMenuPicker && toggleMenus.length > 0 && (
        <FormField label="เมนูที่เข้าถึงได้">
          <p className="text-xs text-stone-500 -mt-1 mb-2">ติ๊กเมนูที่ผู้ใช้คนนี้เห็น/เข้าได้ (เอาออกเพื่อซ่อน) — "ภาพรวม" เข้าได้เสมอ</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {toggleMenus.map((m) => {
              const on = isMenuOn(m.id);
              return (
                <label key={m.id} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer ${on ? (m.grant ? 'border-amber-500 bg-amber-50' : 'border-emerald-600 bg-emerald-50') : 'border-stone-200 hover:border-stone-300'}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleMenu(m.id)} className="w-4 h-4 rounded text-emerald-700" />
                  <span className={`text-sm ${on ? (m.grant ? 'font-medium text-amber-900' : 'font-medium text-emerald-900') : 'text-stone-600'}`}>{m.label}{m.grant ? ' ★' : ''}</span>
                </label>
              );
            })}
          </div>
          {menuSet && <button type="button" onClick={() => setMenuSet(null)} className="mt-2 text-xs text-emerald-700 hover:underline">รีเซ็ตเป็นค่าปกติ (เมนูตามบทบาท)</button>}
        </FormField>
      )}

      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}


export {
  UsersPage,
};
