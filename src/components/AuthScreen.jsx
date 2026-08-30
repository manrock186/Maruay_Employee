import React, { useState } from 'react';
import { Users, Mail, Eye, EyeOff, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabase.js';

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

export {
  AuthScreen,
};
