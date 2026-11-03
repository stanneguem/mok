import {useEffect, useState} from 'react'
import {supabase, fcfa} from './supabase'
import Tenants from './pages/Tenants'
import Month from './pages/Month'
import Payments from './pages/Payments'
import Dashboard from './pages/Dashboard'

const navigation = [
  {id: "home", label: "Tableau de bord", short: "Accueil", icon: "⌂"},
  {id: "readings", label: "Relevés", short: "Relevés", icon: "▤"},
  {id: "invoices", label: "Facturation", short: "Factures", icon: "▧"},
  {id: "pay", label: "Paiements", short: "Paiements", icon: "↗"},
  {id: "tenants", label: "Locataires", short: "Locataires", icon: "♙"},
  {id: "fund", label: "Fonds d'urgence", short: "Fonds", icon: "◈"}
]

function authErrorMessage(error) {
  const code = error?.code || ''
  const message = (error?.message || '').toLowerCase()
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'Adresse e-mail ou mot de passe incorrect. Vérifie tes informations puis réessaie.'
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'Cette adresse e-mail n’a pas encore été confirmée. Contacte l’administrateur de MOK.'
  if (code === 'user_banned' || message.includes('banned')) return 'Ce compte est temporairement désactivé. Contacte l’administrateur.'
  if (code === 'over_request_rate_limit' || message.includes('rate limit') || message.includes('too many requests')) return 'Trop de tentatives de connexion. Patiente quelques minutes avant de réessayer.'
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('fetch')) return 'Connexion au serveur impossible. Vérifie ta connexion Internet puis réessaie.'
  if (message.includes('supabase') || message.includes('configuration')) return 'Le service de connexion est mal configuré. Contacte le responsable de MOK.'
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
    if (!cleanEmail || !password) return setError('Renseigne ton adresse e-mail et ton mot de passe pour continuer.')
    setError(''); setLoading(true)
    try {
      const {error: signInError} = await supabase.auth.signInWithPassword({email: cleanEmail, password})
      if (signInError) setError(authErrorMessage(signInError))
    } catch (err) { setError(authErrorMessage(err)) }
    finally { setLoading(false) }
  }
  return <main className="auth-shell">
    <section className="auth-brand" aria-label="Présentation de MOK">
      <div className="auth-brand-content">
        <div className="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M7 29V11l13 11L33 11v18" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 22v7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/></svg></div>
        <div className="brand-name">MOK<span>.</span></div>
        <p className="brand-tagline">La gestion de vos locations, en toute simplicité.</p>
        <div className="brand-decoration" aria-hidden="true"><div className="decoration-line"/><div className="decoration-orb orb-one"/><div className="decoration-orb orb-two"/><div className="decoration-orb orb-three"/></div>
      </div>
      <p className="brand-footnote">Gestion locative · Suivi de consommation · Paiements</p>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <div className="mobile-brand"><span className="mobile-brand-mark">M</span><span>MOK</span></div>
      <div className="auth-heading"><span className="auth-eyebrow">ESPACE DE GESTION</span><h1>Bon retour.</h1><p>Connecte-toi pour accéder à ton espace de gestion.</p></div>
      <form className="auth-form" onSubmit={go} noValidate>
        <div className="form-field"><label htmlFor="mok-email">Adresse e-mail</label><div className="input-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/></svg><input id="mok-email" type="email" inputMode="email" autoComplete="username" placeholder="nom@exemple.com" value={email} onChange={event=>{setEmail(event.target.value);if(error)setError('')}} aria-invalid={!!error} aria-describedby={error?'auth-error':undefined} autoFocus required/></div></div>
        <div className="form-field"><label htmlFor="mok-password">Mot de passe</label><div className="input-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10" width="15" height="10" rx="2.2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2.5"/></svg><input id="mok-password" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Ton mot de passe" value={password} onChange={event=>{setPassword(event.target.value);if(error)setError('')}} aria-invalid={!!error} aria-describedby={error?'auth-error':undefined} required/><button className="password-toggle" type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'}>{showPassword?'Masquer':'Afficher'}</button></div></div>
        {error&&<div className="auth-error" id="auth-error" role="alert" aria-live="assertive"><span className="error-icon">!</span><div><strong>Connexion impossible</strong><p>{error}</p></div></div>}
        <button className="auth-submit" type="submit" disabled={loading}>{loading?<><span className="loading-spinner"/>Connexion en cours…</>:<>Se connecter <span>→</span></>}</button>
      </form>
      <div className="auth-security"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 4 5v4.3c0 3.8 2.5 6.5 6 8.2 3.5-1.7 6-4.4 6-8.2V5l-6-2.5Z"/><path d="m7.5 9.8 1.7 1.7 3.5-3.7"/></svg><span>Accès sécurisé et réservé aux utilisateurs autorisés.</span></div>
    </div><p className="auth-copyright">© {new Date().getFullYear()} MOK · Tous droits réservés</p></section>
  </main>
}

function Fund() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {let active=true;supabase.from('emergency_fund').select('*, periods(month)').order('created_at',{ascending:false}).then(({data,error})=>{if(!active)return;if(error)setError(error.message);else setRows(data||[])});return()=>{active=false}},[])
  const total=rows.reduce((s,r)=>s+Number(r.amount||0),0)
  return <section className="workspace-page"><header className="page-heading"><div><span className="eyebrow">SUIVI FINANCIER</span><h1>Fonds d’urgence</h1><p>Retrouve les montants mis de côté au fil des périodes.</p></div></header>
    <div className="summary-grid"><article className="summary-card summary-primary"><span className="summary-label">Solde disponible</span><strong>{fcfa(total)}</strong><span className="summary-foot">{rows.length} mouvement{rows.length>1?'s':''} enregistré{rows.length>1?'s':''}</span></article></div>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE</span><h2>Mouvements du fonds</h2></div></div>
      {error?<div className="notice notice-error" role="alert">{error}</div>:rows.length===0?<div className="empty-state"><span className="empty-icon">◈</span><h3>Aucun mouvement pour le moment</h3><p>Les montants affectés au fonds apparaîtront ici.</p></div>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Période</th><th>Date d’enregistrement</th><th className="align-right">Montant</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.periods?.month?.slice(0,7)||'—'}</strong></td><td>{r.created_at?new Date(r.created_at).toLocaleDateString('fr-FR'):'—'}</td><td className="align-right amount-cell">{fcfa(r.amount)}</td></tr>)}</tbody></table></div>}
    </section>
  </section>
}

export default function App() {
  const [session,setSession]=useState(null)
  const [authChecking,setAuthChecking]=useState(true)
  const [tab,setTab]=useState('home')
  const [theme,setTheme]=useState(()=>localStorage.getItem('mok-theme')==='dark'?'dark':'light')
  useEffect(()=>{
    document.documentElement.dataset.theme=theme
    localStorage.setItem('mok-theme',theme)
  },[theme])
  const toggleTheme=()=>setTheme(current=>current==='dark'?'light':'dark')
  useEffect(()=>{
    let mounted=true
    supabase.auth.getSession().then(({data,error})=>{if(!mounted)return;setSession(data?.session||null);setAuthChecking(false);if(error)console.error('MOK auth session:',error.message)}).catch(error=>{if(!mounted)return;console.error('MOK auth session:',error);setAuthChecking(false)})
    const {data}=supabase.auth.onAuthStateChange((_,currentSession)=>{if(mounted)setSession(currentSession)})
    return()=>{mounted=false;data.subscription.unsubscribe()}
  },[])
  if(authChecking)return <main className="auth-loading"><span className="loading-spinner"/><p>Préparation de ton espace…</p></main>
  if(!session)return <Login/>
  const pages={home:<Dashboard onNavigate={setTab}/>,readings:<Month view="readings"/>,invoices:<Month view="invoices"/>,pay:<Payments/>,tenants:<Tenants/>,fund:<Fund/>}
  const active=navigation.find(item=>item.id===tab)||navigation[0]
  return <div className="app-shell">
    <header className="app-topbar"><a className="app-logo" href="#" onClick={e=>{e.preventDefault();setTab('home')}} aria-label="MOK - Accueil"><span className="app-logo-mark">M</span><span>MOK<span className="logo-dot">.</span></span></a>
      <div className="topbar-right"><button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme==='dark'?'Activer le thème jour':'Activer le thème nuit'} title={theme==='dark'?'Passer au thème jour':'Passer au thème nuit'}><span aria-hidden="true">{theme==='dark'?'☀':'☾'}</span><span className="theme-toggle-label">{theme==='dark'?'Jour':'Nuit'}</span></button><span className="account-chip"><span className="account-avatar">M</span><span>Mon espace</span></span><button className="logout-button" onClick={()=>supabase.auth.signOut()}><span aria-hidden="true">↪</span> Déconnexion</button></div>
    </header>
    <div className="app-layout"><aside className="app-sidebar"><span className="sidebar-caption">ESPACE DE TRAVAIL</span><nav className="app-nav" aria-label="Navigation principale">{navigation.map(item=><button key={item.id} className={tab===item.id?'nav-item active':'nav-item'} onClick={()=>setTab(item.id)} aria-current={tab===item.id?'page':undefined}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>{tab===item.id&&<span className="nav-indicator"/>}</button>)}</nav><div className="sidebar-note"><span className="sidebar-note-icon">✦</span><strong>Bienvenue sur MOK</strong><p>Ton espace pour gérer tes locations et suivre les paiements simplement.</p></div></aside>
      <main className="app-content"><div className="mobile-page-context"><span>{active.icon}</span>{active.label}</div>{pages[tab]}</main>
    </div>
    <nav className="mobile-bottom-nav" aria-label="Navigation mobile">{navigation.map(item=><button key={item.id} className={tab===item.id?'mobile-nav-item active':'mobile-nav-item'} onClick={()=>setTab(item.id)} aria-current={tab===item.id?'page':undefined}><span>{item.icon}</span><small>{item.short}</small></button>)}</nav>
  </div>
}
