import {createClient} from '@supabase/supabase-js'
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
export const fcfa = n => Math.round(n || 0).toLocaleString('fr-FR') + ' FCFA'
