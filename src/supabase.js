import {createClient} from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Configuration Supabase manquante. Copie .env.example vers .env.local et renseigne les variables.')
}
if (!/^https:\/\//.test(supabaseUrl)) {
  throw new Error('VITE_SUPABASE_URL doit être une URL HTTPS valide.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
export const fcfa = amount => Math.round(Number(amount) || 0).toLocaleString('fr-FR') + ' FCFA'
