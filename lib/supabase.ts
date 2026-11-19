import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawSupabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const stripQuotes = (val: string) => val.trim().replace(/^["']+|["']+$/g, '').trim();

const sanitizeSupabaseUrl = (raw: string): string => {
  const cleaned = stripQuotes(raw);
  if (!cleaned) return '';
  const withProtocol =
    cleaned.startsWith('http://') || cleaned.startsWith('https://')
      ? cleaned
      : `https://${cleaned}`;
  try {
    const parsed = new URL(withProtocol);
    // Usa sempre a origem pura (ex: https://projeto.supabase.co), removendo /rest/v1, barras extras ou query strings que causam PGRST125
    return parsed.origin;
  } catch {
    return withProtocol.replace(/\/+$/, '');
  }
};

export const normalizedSupabaseUrl = sanitizeSupabaseUrl(rawSupabaseUrl);
const supabaseAnonKey = stripQuotes(rawSupabaseAnonKey);

if (!normalizedSupabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Check your .env file.');
}

export const supabase = (normalizedSupabaseUrl && supabaseAnonKey)
  ? createClient(normalizedSupabaseUrl, supabaseAnonKey)
  : null;
