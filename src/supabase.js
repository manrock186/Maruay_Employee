import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } },
});

// snake_case → camelCase
export const fromDB = (row) => {
  if (!row) return row;
  if (Array.isArray(row)) return row.map(fromDB);
  const out = {};
  for (const k of Object.keys(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = row[k];
  }
  return out;
};

// camelCase → snake_case (skip id)
export const toDB = (obj) => {
  if (!obj) return obj;
  const out = {};
  for (const k of Object.keys(obj)) {
    if (k === 'id' || k === 'createdAt') continue;
    const snake = k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    out[snake] = obj[k];
  }
  return out;
};
