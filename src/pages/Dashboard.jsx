import {useEffect,useState} from 'react'
import {supabase,fcfa} from '../supabase'

export default function Dashboard({onNavigate}) {
  const [state,setState]=useState({period:null,tenants:[],readings:[],bills:[]})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    const load=async()=>{
      const [p,t]=await Promise.all([
        supabase.from('periods').select('*').order('month',{ascending:false}).limit(1),
        supabase.from('tenants').select('id,name,active').order('name')
      ])
      if(!active)return
      if(p.error||t.error){setError(p.error?.message||t.error?.message||'Impossible de charger le tableau de bord.');setLoading(false);return}
      const period=p.data?.[0]||null
      const tenants=(t.data||[]).filter(x=>x.active)
      if(!period){setState({period:null,tenants,readings:[],bills:[]});setLoading(false);return}
      const [r,b]=await Promise.all([
        supabase.from('readings').select('id,tenant_id,prev_index,curr_index').eq('period_id',period.id),
        supabase.from('bills').select('id,tenant_id,total,consumption,payments(amount)').eq('period_id',period.id)
      ])
      if(!active)return
      if(r.error||b.error){setError(r.error?.message||b.error?.message||'Impossible de charger les indicateurs.');setLoading(false);return}
      setState({period,tenants,readings:r.data||[],bills:b.data||[]})
      setLoading(false)
    }
    load()
    return()=>{active=false}
  },[])
  const active=state.tenants.length
  const count=state.readings.length
  const billed=state.bills.reduce((s,b)=>s+Number(b.total||0),0)
  const paid=state.bills.reduce((s,b)=>s+(b.payments||[]).reduce((v,p)=>v+Number(p.amount||0),0),0)
  const due=billed-paid
  const kwh=state.readings.reduce((s,r)=>s+Math.max(0,Number(r.curr_index||0)-Number(r.prev_index||0)),0)
  const pct=active?Math.min(100,count/active*100):0
  const label=state.period?.month?new Date(state.period.month+'T00:00:00').toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):'Aucune période'
  return <section className="workspace-page">
    <header className="dashboard-welcome"><div><span className="eyebrow">VOTRE ESPACE DE GESTION</span><h1>Tableau de bord</h1><p>Une vue globale de vos locations, consommations et finances.</p></div><span className="dashboard-period">▦ {label}</span></header>
    {error&&<div className="notice notice-error" role="alert">{error}</div>}
    {loading?<section className="panel"><div className="loading-inline"><span className="loading-spinner"/>Chargement de la situation globale…</div></section>:<>
      {!state.period&&<div className="notice notice-info">Aucune période créée. Ouvre Facturation pour préparer le premier mois.</div>}
      <div className="dashboard-metrics">
        <article className="dashboard-metric"><div className="dashboard-metric-top"><span className="dashboard-metric-label">Total facturé</span><span className="dashboard-metric-icon">▧</span></div><strong>{fcfa(billed)}</strong><small>Factures de la période active</small></article>
        <article className="dashboard-metric"><div className="dashboard-metric-top"><span className="dashboard-metric-label">Total encaissé</span><span className="dashboard-metric-icon">↗</span></div><strong>{fcfa(paid)}</strong><small>{billed?Math.round(paid/billed*100):0}% des montants facturés</small></article>
        <article className="dashboard-metric"><div className="dashboard-metric-top"><span className="dashboard-metric-label">Reste à encaisser</span><span className="dashboard-metric-icon">◷</span></div><strong>{fcfa(due)}</strong><small>Solde restant dû</small></article>
        <article className="dashboard-metric"><div className="dashboard-metric-top"><span className="dashboard-metric-label">Locataires actifs</span><span className="dashboard-metric-icon">♙</span></div><strong>{active}</strong><small>{kwh.toLocaleString('fr-FR')} kWh relevés</small></article>
      </div>
      <div className="dashboard-main-grid">
        <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>État d'avancement</h2><p>Suivi des opérations pour {label}.</p></div></div>
          <div className="dashboard-progress-row"><span>Relevés des compteurs</span><strong>{count}/{active}</strong></div><div className="dashboard-progress"><span style={{width:pct+'%'}}/></div>
          <div className="dashboard-status-list">
            <div className="dashboard-status-item"><span className="dashboard-status-icon">▤</span><span className="dashboard-status-copy"><strong>Relevés enregistrés</strong><small>Compteurs relevés pour cette période</small></span><span className="dashboard-status-value">{count}/{active}</span></div>
            <div className="dashboard-status-item"><span className="dashboard-status-icon">▧</span><span className="dashboard-status-copy"><strong>Factures générées</strong><small>Factures individuelles créées</small></span><span className="dashboard-status-value">{state.bills.length}/{active}</span></div>
            <div className="dashboard-status-item"><span className="dashboard-status-icon">✓</span><span className="dashboard-status-copy"><strong>Encaissements</strong><small>Montant déjà reçu</small></span><span className="dashboard-status-value">{fcfa(paid)}</span></div>
          </div>
        </section>
        <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Accès rapides</h2><p>Accède directement à une gestion.</p></div></div>
          <div className="dashboard-shortcuts">
            <button className="dashboard-shortcut" onClick={()=>onNavigate('readings')}><span className="dashboard-shortcut-icon">▤</span><span><strong>Relevés</strong><small>Saisie des compteurs</small></span></button>
            <button className="dashboard-shortcut" onClick={()=>onNavigate('invoices')}><span className="dashboard-shortcut-icon">▧</span><span><strong>Facturation</strong><small>Factures et résidu</small></span></button>
            <button className="dashboard-shortcut" onClick={()=>onNavigate('pay')}><span className="dashboard-shortcut-icon">↗</span><span><strong>Paiements</strong><small>Suivi des règlements</small></span></button>
            <button className="dashboard-shortcut" onClick={()=>onNavigate('tenants')}><span className="dashboard-shortcut-icon">♙</span><span><strong>Locataires</strong><small>Gestion des occupants</small></span></button>
            <button className="dashboard-shortcut" onClick={()=>onNavigate('meters')}><span className="dashboard-shortcut-icon">◉</span><span><strong>Compteurs</strong><small>Parc et affectations</small></span></button>
            <button className="dashboard-shortcut" onClick={()=>onNavigate('consumption')}><span className="dashboard-shortcut-icon">ϟ</span><span><strong>Consommation générale</strong><small>Suivi mensuel fournisseur</small></span></button>
            <button className="dashboard-shortcut" onClick={()=>onNavigate('fund')}><span className="dashboard-shortcut-icon">◈</span><span><strong>Fonds d’urgence</strong><small>Solde et historique</small></span></button>
            <button className="dashboard-shortcut" onClick={()=>onNavigate('settings')}><span className="dashboard-shortcut-icon">⚙</span><span><strong>Paramètres</strong><small>Préférences de MOK</small></span></button>
          </div>
        </section>
      </div>
    </>}
  </section>
}
