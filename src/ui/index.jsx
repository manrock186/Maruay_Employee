import React from 'react';
import { X, Save } from 'lucide-react';

// ============ LOADING ============
function LoadingScreen({ msg = 'กำลังโหลด...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-stone-500">{msg}</div>
    </div>
  );
}

// ============ PAGE HEADER ============
function PageHeader({ title, subtitle, children }) {
  return (
    <div className="bg-white border-b border-stone-200 px-4 sm:px-8 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-3xl font-bold text-stone-800 tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-[13px] sm:text-[15px] text-stone-500 mt-0.5 sm:mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  );
}

// ============ AVATAR ============
function Avatar({ photo, name, size = 40 }) {
  const initials = (name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0" />;
  return <div style={{ width: size, height: size, fontSize: size * 0.35 }} className="rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 text-white font-medium flex items-center justify-center flex-shrink-0">{initials}</div>;
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

function PillRadio({ selected, onClick, icon: Icon, children }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm rounded-lg border-2 transition-all ${selected ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-medium' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'}`}>
      {Icon && <Icon className={`w-4 h-4 ${selected ? 'text-emerald-700' : 'text-stone-400'}`} />}
      {children}
    </button>
  );
}

function EditorRow({ label, children, hint }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="text-sm text-stone-600">{label}{hint && <span className="block text-[11px] text-stone-400">{hint}</span>}</div>
      <div className="w-36">{children}</div>
    </div>
  );
}

// ============ REUSABLE UI ============
function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className={`bg-white shadow-2xl w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'} max-h-[92vh] sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl`}>
        <div className="px-4 sm:px-6 py-4 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <h2 className="font-semibold text-stone-800 truncate pr-2">{title}</h2>
          <button onClick={onClose} className="p-2 -mr-1 hover:bg-stone-100 rounded-lg text-stone-500 flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 sm:p-6 overflow-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, required, children }) {
  return <div><label className="block text-sm font-medium text-stone-700 mb-1.5">{label}{required && <span className="text-red-500"> *</span>}</label>{children}</div>;
}

function FormActions({ onCancel, onSubmit, submitLabel }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
      <button onClick={onCancel} className="px-4 py-2.5 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium border border-stone-200 sm:border-0">ยกเลิก</button>
      <button onClick={onSubmit} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Save className="w-4 h-4" /> {submitLabel || 'บันทึก'}</button>
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

export {
  Modal,
  FormField,
  FormActions,
  EmptyState,
  PageHeader,
  LoadingScreen,
  Avatar,
  PillRadio,
  InfoItem,
  DetailBlock,
  EditorRow,
};
