import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Check your .env file.');
}

const ensureProtocol = (url: string) => {
  if (!url) return url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
};

const formattedUrl = ensureProtocol(supabaseUrl);

export const supabase = (formattedUrl && supabaseAnonKey) 
  ? createClient(formattedUrl, supabaseAnonKey)
  : null;
