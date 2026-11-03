import {useEffect,useState} from 'react'
import {supabase,fcfa} from '../supabase'
import {residualOf,splitResidual} from '../billing'

export default function Consumption() {
  const [periods,setPeriods]=useState([])
  const [pid,setPid]=useState('')
  const [readings,setReadings]=useState([])
  const [bills,setBills]=useState([])
  const [main,setMain]=useState({main_index:'',main_amount:''})
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState({text:'',type:'info'})
  const period=periods.find(p=>p.id===pid)
  const previousPeriod=period?periods.filter(p=>p.month<period.month).sort((a,b)=>b.month.localeCompare(a.month))[0]:null
  const previousMainIndex=Number(previousPeriod?.main_index||0)
  const load=async()=>{
    setLoading(true)
    const {data,error}=await supabase.from('periods').select('*').order('month',{ascending:false})
    if(error)setMessage({text:error.message,type:'error'})
    else {setPeriods(data||[]);if(data?.length)setPid(current=>current||data[0].id)}
    setLoading(false)
  }
  useEffect(()=>{load()},[])
  useEffect(()=>{
    if(!pid)return
    let active=true
    ;(async()=>{
      const [r,b]=await Promise.all([
        supabase.from('readings').select('*, tenants(name,meter_no)').eq('period_id',pid),
        supabase.from('bills').select('id,tenant_id,consumption,conso_amount,tenants(name)').eq('period_id',pid)
      ])
      if(!active)return
      if(r.error||b.error)setMessage({text:r.error?.message||b.error?.message,type:'error'})
      else {setReadings(r.data||[]);setBills(b.data||[])}
      const p=periods.find(x=>x.id===pid)
      if(p)setMain({main_index:p.main_index??'',main_amount:p.main_amount??''})
    })()
    return()=>{active=false}
  },[pid,periods])
  const totalKwh=readings.reduce((s,r)=>s+Math.max(0,Number(r.curr_index)-Number(r.prev_index)),0)
  const totalIndividual=bills.reduce((s,b)=>s+Number(b.conso_amount||0),0)
  const generalKwh=main.main_index!==''?Math.max(0,Number(main.main_index)-previousMainIndex):null
  const residual=main.main_amount!==''?residualOf(Number(main.main_amount),bills):null
  const save=async()=>{
    if(!period)return
    if(main.main_index===''||main.main_amount==='')return setMessage({text:'Renseigne l’index principal et le montant de la facture fournisseur.',type:'error'})
    const index=Number(main.main_index),amount=Number(main.main_amount)
    if(!Number.isFinite(index)||index<0||!Number.isFinite(amount)||amount<0)return setMessage({text:'Les valeurs doivent être positives ou nulles.',type:'error'})
    if(!bills.length)return setMessage({text:'Génère d’abord les factures individuelles pour calculer le résidu.',type:'error'})
    const value=residualOf(amount,bills),{toFund}=splitResidual(value)
    setBusy(true);setMessage({text:'',type:'info'})
    const {error}=await supabase.rpc('save_mok_period_main_details',{p_period_id:pid,p_main_index:index,p_main_amount:amount,p_residual:value,p_fund_amount:toFund})
    if(error)setMessage({text:error.message,type:'error'})
    else {setPeriods(items=>items.map(p=>p.id===pid?{...p,main_index:index,main_amount:amount,residual:value}:p));setMessage({text:'Consommation générale et résidu enregistrés.',type:'success'})}
    setBusy(false)
  }
  return <section className="workspace-page">
    <header className="page-heading"><div><span className="eyebrow">SUIVI MENSUEL</span><h1>Consommation générale</h1><p>Compare les consommations individuelles au compteur principal et à la facture fournisseur.</p></div></header>
    <section className="panel"><div className="period-toolbar"><div className="field"><label htmlFor="consumption-period">Période</label><select id="consumption-period" value={pid} onChange={e=>setPid(e.target.value)}><option value="">Choisir un mois</option>{periods.map(p=><option key={p.id} value={p.id}>{p.month?.slice(0,7)}</option>)}</select></div></div></section>
    {message.text&&<div className={'notice '+(message.type==='error'?'notice-error':'notice-success')} role={message.type==='error'?'alert':'status'}>{message.text}</div>}
    {loading?<section className="panel"><div className="loading-inline"><span className="loading-spinner"/>Chargement…</div></section>:!period?<section className="panel"><div className="empty-state"><h3>Aucune période disponible</h3><p>Crée une période depuis la gestion de facturation.</p></div></section>:<>
      <div className="summary-grid"><article className="summary-card summary-primary"><span className="summary-label">Consommation individuelle</span><strong>{totalKwh.toLocaleString('fr-FR')} kWh</strong><span className="summary-foot">{readings.length} relevés enregistrés</span></article><article className="summary-card"><span className="summary-label">Consommation compteur principal</span><strong>{generalKwh===null?'—':generalKwh.toLocaleString('fr-FR')+' kWh'}</strong><span className="summary-foot">Index précédent : {previousMainIndex.toLocaleString('fr-FR')}</span></article><article className="summary-card"><span className="summary-label">Montant individuel cumulé</span><strong>{fcfa(totalIndividual)}</strong><span className="summary-foot">Selon les factures générées</span></article><article className="summary-card"><span className="summary-label">Facture fournisseur</span><strong>{fcfa(main.main_amount||0)}</strong><span className="summary-foot">Montant de la période</span></article></div>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">COMPTEUR PRINCIPAL</span><h2>Données du fournisseur — {period.month?.slice(0,7)}</h2><p>Enregistre l’index général et le montant facturé par le fournisseur.</p></div></div>
        <div className="period-toolbar"><div className="field"><label htmlFor="previous-general-index">Index précédent</label><input id="previous-general-index" type="number" value={previousMainIndex} readOnly/><small>Repris de la période précédente</small></div><div className="field"><label htmlFor="general-index">Nouvel index du compteur principal</label><input id="general-index" type="number" min="0" step="1" value={main.main_index} onChange={e=>setMain(v=>({...v,main_index:e.target.value}))}/></div><div className="field"><label htmlFor="provider-amount">Montant fournisseur (FCFA)</label><input id="provider-amount" type="number" min="0" step="1" value={main.main_amount} onChange={e=>setMain(v=>({...v,main_amount:e.target.value}))}/></div><div className="toolbar-action"><button className="primary-button" disabled={busy||!bills.length} onClick={save}>{busy?'Enregistrement…':'Enregistrer et calculer le résidu'}</button></div></div>
        {residual!==null&&<div className="metric-inline"><span className="metric-pill">Résidu : <strong>{fcfa(residual)}</strong></span><span className="metric-pill">{residual<0?'Affectation au fonds d’urgence':'Report à répartir au prochain mois'}</span></div>}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">DÉTAIL DES RELEVÉS</span><h2>Consommation par locataire</h2></div></div>
        {readings.length===0?<div className="empty-state"><h3>Aucun relevé pour cette période</h3><p>Les consommations apparaîtront après la saisie des compteurs.</p></div>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Locataire</th><th>Compteur</th><th>Index précédent</th><th>Index actuel</th><th className="align-right">Consommation</th></tr></thead><tbody>{readings.map(r=><tr key={r.id}><td><strong>{r.tenants?.name||'Locataire'}</strong></td><td>{r.tenants?.meter_no||'—'}</td><td>{Number(r.prev_index).toLocaleString('fr-FR')}</td><td>{Number(r.curr_index).toLocaleString('fr-FR')}</td><td className="align-right">{Math.max(0,Number(r.curr_index)-Number(r.prev_index)).toLocaleString('fr-FR')} kWh</td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </section>
}
