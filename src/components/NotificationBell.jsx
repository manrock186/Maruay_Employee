import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Users, X, UserCircle, Shield, Calendar, CheckCircle2, Award, CreditCard, BookOpen, Wallet, Receipt, TrendingUp, Bell, BellRing, CheckCheck, Sparkles } from 'lucide-react';

// ============ NOTIFICATION BELL ============
const NOTI_META = {
  pending_user:       { icon: UserCircle, color: 'text-amber-600 bg-amber-100' },
  permit_expiry:      { icon: CreditCard, color: 'text-red-600 bg-red-100' },
  passport_expiry:    { icon: BookOpen, color: 'text-red-600 bg-red-100' },
  idcard_expiry:      { icon: Shield, color: 'text-red-600 bg-red-100' },
  birthday:           { icon: Calendar, color: 'text-pink-600 bg-pink-100' },
  vacancy:            { icon: Award, color: 'text-amber-600 bg-amber-100' },
  understaffed:       { icon: Users, color: 'text-rose-600 bg-rose-100' },
  overstaffed:        { icon: Users, color: 'text-sky-600 bg-sky-100' },
  payroll_incomplete: { icon: Wallet, color: 'text-amber-600 bg-amber-100' },
  pending_raise:      { icon: TrendingUp, color: 'text-emerald-600 bg-emerald-100' },
  recurring_task_short: { icon: Sparkles, color: 'text-amber-600 bg-amber-100' },
  expense_pending:    { icon: Receipt, color: 'text-amber-600 bg-amber-100' },
  expense_approved:   { icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-100' },
  expense_rejected:   { icon: X, color: 'text-rose-600 bg-rose-100' },
};
function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  return `${Math.floor(s / 86400)} วันที่แล้ว`;
}
function NotificationBell({ notifications, notiReads, userId, canManagePayroll, ops, onJump, variant = 'dark' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const readSet = useMemo(() => new Set(notiReads.filter((r) => r.userId === userId).map((r) => r.notificationId)), [notiReads, userId]);
  // ซ่อนการแจ้งเตือนที่เกี่ยวกับเงินเดือน จากผู้ที่ไม่มีสิทธิ์ดูเงินเดือน + ซ่อนแจ้งเตือนตั้งเบิกเก่า (ยกเลิกฟีเจอร์ช่าง/ตั้งเบิกแล้ว)
  const PAYROLL_NOTI = ['payroll_incomplete', 'pending_raise'];
  const EXPENSE_NOTI = ['expense_pending', 'expense_approved', 'expense_rejected'];
  const visibleNoti = useMemo(() => notifications.filter((n) => {
    if (!canManagePayroll && PAYROLL_NOTI.includes(n.type)) return false;
    if (EXPENSE_NOTI.includes(n.type)) return false;
    return true;
  }), [notifications, canManagePayroll]);
  const sorted = useMemo(() => [...visibleNoti].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [visibleNoti]);
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
      <button onClick={() => setOpen((o) => !o)} className={`relative p-2 rounded-lg transition-colors ${variant === 'light' ? 'hover:bg-stone-100 text-stone-600' : 'hover:bg-emerald-900 text-emerald-100/90'}`} title="การแจ้งเตือน">
        {unreadCount > 0 ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <div className={`absolute ${variant === 'light' ? 'right-0' : 'left-0'} top-full mt-2 w-[340px] max-w-[90vw] bg-white rounded-xl shadow-2xl border border-stone-200 z-[70] overflow-hidden`}>
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

export {
  NotificationBell,
};
