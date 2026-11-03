import {useEffect, useState} from 'react'
import {supabase, fcfa} from './supabase'
import Tenants from './pages/Tenants'
import Month from './pages/Month'
import Payments from './pages/Payments'

function Login() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [msg, setMsg] = useState('')
  const go = async mode => {
    const {error} = mode === 'in' ? await supabase.auth.signInWithPassword({email, password}) : await supabase.auth.signUp({email, password})
    setMsg(error ? error.message : mode === 'up' ? 'Compte créé. Vérifie ton email si la confirmation est activée.' : '')
  }
  return <main><h2>Connexion</h2>
    <p><input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /></p>
    <p><input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} /></p>
    <button onClick={() => go('in')}>Se connecter</button> <button className="alt" onClick={() => go('up')}>Créer un compte</button>
    <p className="msg">{msg}</p></main>
}

function Fund() {
  const [rows, setRows] = useState([])
  useEffect(() => { supabase.from('emergency_fund').select('*, periods(month)').order('created_at', {ascending: false}).then(r => setRows(r.data || [])) }, [])
  return <section><h3>Fonds d'urgence (visible par toi seul)</h3>
    <p><b>Solde : {fcfa(rows.reduce((s, r) => s + r.amount, 0))}</b></p>
    <table><tbody>{rows.map(r => <tr key={r.id}><td>{r.periods?.month?.slice(0, 7)}</td><td>{fcfa(r.amount)}</td></tr>)}</tbody></table></section>
}

export default function App() {
  const [session, setSession] = useState(null), [tab, setTab] = useState('month')
  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setSession(data.session))
    const {data} = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!session) return <Login />
  const T = {tenants: <Tenants />, month: <Month />, pay: <Payments />, fund: <Fund />}
  return <main>
    <nav>{[['month', 'Mois'], ['pay', 'Paiements'], ['tenants', 'Locataires'], ['fund', 'Fonds']].map(([k, l]) =>
      <button key={k} className={tab === k ? '' : 'alt'} onClick={() => setTab(k)}>{l}</button>)}
      <button className="alt" onClick={() => supabase.auth.signOut()}>Déconnexion</button></nav>
    {T[tab]}</main>
}
