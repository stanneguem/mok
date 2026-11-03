import {useEffect, useState} from 'react'
import {supabase, fcfa} from './supabase'
import Tenants from './pages/Tenants'
import Month from './pages/Month'
import Payments from './pages/Payments'

function authErrorMessage(error) {
  const code = error?.code || ''
  const message = (error?.message || '').toLowerCase()

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'Adresse e-mail ou mot de passe incorrect. Vérifie tes informations puis réessaie.'
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Cette adresse e-mail n’a pas encore été confirmée. Contacte l’administrateur de MOK.'
  }
  if (code === 'user_banned' || message.includes('banned')) {
    return 'Ce compte est temporairement désactivé. Contacte l’administrateur.'
  }
  if (code === 'over_request_rate_limit' || message.includes('rate limit') || message.includes('too many requests')) {
    return 'Trop de tentatives de connexion. Patiente quelques minutes avant de réessayer.'
  }
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('fetch')) {
    return 'Connexion au serveur impossible. Vérifie ta connexion Internet puis réessaie.'
  }
  if (message.includes('supabase') || message.includes('configuration')) {
    return 'Le service de connexion est mal configuré. Contacte le responsable de MOK.'
  }
  return 'La connexion n’a pas abouti. Vérifie tes identifiants ou réessaie dans un instant.'
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const go = async event => {
    event.preventDefault()
    if (loading) return
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !password) {
      setError('Renseigne ton adresse e-mail et ton mot de passe pour continuer.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const {error: signInError} = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      })
      if (signInError) setError(authErrorMessage(signInError))
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-shell">
    <section className="auth-brand" aria-label="Présentation de MOK">
      <div className="auth-brand-content">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 40 40" fill="none">
            <path d="M7 29V11l13 11L33 11v18" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M20 22v7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="brand-name">MOK<span>.</span></div>
        <p className="brand-tagline">La gestion de vos locations, en toute simplicité.</p>
        <div className="brand-decoration" aria-hidden="true">
          <div className="decoration-line" />
          <div className="decoration-orb orb-one" />
          <div className="decoration-orb orb-two" />
          <div className="decoration-orb orb-three" />
        </div>
      </div>
      <p className="brand-footnote">Gestion locative · Suivi de consommation · Paiements</p>
    </section>

    <section className="auth-panel">
      <div className="auth-card">
        <div className="mobile-brand"><span className="mobile-brand-mark">M</span><span>MOK</span></div>
        <div className="auth-heading">
          <span className="auth-eyebrow">ESPACE DE GESTION</span>
          <h1>Bon retour.</h1>
          <p>Connecte-toi pour accéder à ton espace de gestion.</p>
        </div>

        <form className="auth-form" onSubmit={go} noValidate>
          <div className="form-field">
            <label htmlFor="mok-email">Adresse e-mail</label>
            <div className="input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>
              <input id="mok-email" type="email" inputMode="email" autoComplete="username"
                placeholder="nom@exemple.com" value={email}
                onChange={event => {setEmail(event.target.value); if (error) setError('')}}
                aria-invalid={!!error} aria-describedby={error ? 'auth-error' : undefined}
                autoFocus required />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="mok-password">Mot de passe</label>
            <div className="input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10" width="15" height="10" rx="2.2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2.5"/></svg>
              <input id="mok-password" type={showPassword ? 'text' : 'password'}
                autoComplete="current-password" placeholder="Ton mot de passe"
                value={password} onChange={event => {setPassword(event.target.value); if (error) setError('')}}
                aria-invalid={!!error} aria-describedby={error ? 'auth-error' : undefined} required />
              <button className="password-toggle" type="button" onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                {showPassword ? 'Masquer' : 'Afficher'}
              </button>
            </div>
          </div>

          {error && <div className="auth-error" id="auth-error" role="alert" aria-live="assertive">
            <span className="error-icon" aria-hidden="true">!</span>
            <div><strong>Connexion impossible</strong><p>{error}</p></div>
          </div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? <><span className="loading-spinner" aria-hidden="true" />Connexion en cours…</> : <>Se connecter <span aria-hidden="true">→</span></>}
          </button>
        </form>

        <div className="auth-security">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 4 5v4.3c0 3.8 2.5 6.5 6 8.2 3.5-1.7 6-4.4 6-8.2V5l-6-2.5Z"/><path d="m7.5 9.8 1.7 1.7 3.5-3.7"/></svg>
          <span>Accès sécurisé et réservé aux utilisateurs autorisés.</span>
        </div>
      </div>
      <p className="auth-copyright">© {new Date().getFullYear()} MOK · Tous droits réservés</p>
    </section>
  </main>
}

function Fund() {
  const [rows, setRows] = useState([])
  useEffect(() => { supabase.from('emergency_fund').select('*, periods(month)').order('created_at', {ascending: false}).then(r => setRows(r.data || [])) }, [])
  return <section><h3>Fonds d'urgence (visible par toi seul)</h3>
    <p><b>Solde : {fcfa(rows.reduce((s, r) => s + r.amount, 0))}</b></p>
    <table><tbody>{rows.map(r => <tr key={r.id}><td>{r.periods?.month?.slice(0, 7)}</td><td>{fcfa(r.amount)}</td></tr>)}</tbody></table></section>
}

export default function App() {
  const [session, setSession] = useState(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [tab, setTab] = useState('month')
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({data, error}) => {
      if (!mounted) return
      setSession(data?.session || null)
      setAuthChecking(false)
      if (error) console.error('MOK auth session:', error.message)
    }).catch(error => {
      if (!mounted) return
      console.error('MOK auth session:', error)
      setAuthChecking(false)
    })
    const {data} = supabase.auth.onAuthStateChange((_, currentSession) => {
      if (mounted) setSession(currentSession)
    })
    return () => { mounted = false; data.subscription.unsubscribe() }
  }, [])

  if (authChecking) return <main className="auth-loading"><span className="loading-spinner" /><p>Préparation de ton espace…</p></main>
  if (!session) return <Login />
  const T = {tenants: <Tenants />, month: <Month />, pay: <Payments />, fund: <Fund />}
  return <main>
    <nav>{[['month', 'Mois'], ['pay', 'Paiements'], ['tenants', 'Locataires'], ['fund', 'Fonds']].map(([k, l]) =>
      <button key={k} className={tab === k ? '' : 'alt'} onClick={() => setTab(k)}>{l}</button>)}
      <button className="alt" onClick={() => supabase.auth.signOut()}>Déconnexion</button></nav>
    {T[tab]}</main>
}
