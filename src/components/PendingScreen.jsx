import React from 'react';
import { Clock } from 'lucide-react';
import { supabase } from '../supabase.js';

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

export {
  PendingScreen,
};
