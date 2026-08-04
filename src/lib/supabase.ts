import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see .env.example')
}

// The app lives in its own schema inside a shared Supabase project,
// keeping its tables fully separated from other apps' data.
export const supabase = createClient(url, anonKey, {
  db: { schema: 'assignment_office' },
})
