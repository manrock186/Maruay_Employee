import React, { useState, useEffect } from 'react';
import { Bell, BellRing, Check } from 'lucide-react';
import { pushSupported, getPushSubscription, enablePush, disablePush } from '../lib/push.js';

// ปุ่มเปิด/ปิดแจ้งเตือนเข้าเครื่อง (อยู่ใน sidebar — เฉพาะเจ้าของ/หัวหน้าธุรกิจ)
function PushToggle({ userId }) {
  const [supported] = useState(() => pushSupported());
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supported) { if (!cancelled) setReady(true); return; }
      const sub = await getPushSubscription();
      if (!cancelled) { setEnabled(!!sub && Notification.permission === 'granted'); setReady(true); }
    })();
    return () => { cancelled = true; };
  }, [supported]);
  if (!supported) return null;
  const toggle = async () => {
    setBusy(true);
    try {
      if (enabled) { await disablePush(); setEnabled(false); }
      else { const ok = await enablePush(userId); setEnabled(ok); }
    } finally { setBusy(false); }
  };
  return (
    <button onClick={toggle} disabled={busy || !ready} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-emerald-100/80 hover:bg-emerald-900 hover:text-white transition-colors disabled:opacity-50">
      {enabled ? <BellRing className="w-4 h-4 text-amber-400" /> : <Bell className="w-4 h-4" />}
      <span className="flex-1 text-left">{busy ? 'กำลังตั้งค่า...' : enabled ? 'แจ้งเตือนเข้าเครื่อง: เปิด' : 'เปิดแจ้งเตือนเข้าเครื่อง'}</span>
      {enabled && <Check className="w-4 h-4 text-emerald-400" />}
    </button>
  );
}

export {
  PushToggle,
};
