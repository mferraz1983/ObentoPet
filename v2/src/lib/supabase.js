import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;
if (!url || !key) console.error("Defina VITE_SUPABASE_URL e VITE_SUPABASE_KEY (.env)");

export const db = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// Chama uma Edge Function com o JWT do usuário logado
export async function callFn(name, body) {
  const { data, error } = await db.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* noop */ }
    throw new Error(msg);
  }
  return data;
}
