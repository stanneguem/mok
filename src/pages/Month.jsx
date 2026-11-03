import {useEffect, useState} from 'react'
import {supabase, fcfa} from '../supabase'
import {buildBill, distributeResidual, localISODate, residualOf, splitResidual} from '../billing'
import {monthReportPdf} from '../pdf'

const fmtMonth = value => value ? value.slice(0,7) : '—'
const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0)

export default function Month() {
  const [periods,setPeriods]=useState([])
  const [pid,setPid]=useState('')
  const [tenants,setTenants]=useState([])
  const [idx,setIdx]=useState({})
  const [bills,setBills]=useState([])
  const [msg,setMsg]=useState({text:'',type:'info'})
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [np,setNp]=useState({month:'',kwh_price:''})
  const [main,setMain]=useState({main_index:'',main_amount:''})
  const [dist,setDist]=useState(localISODate())
  const period=periods.find(p=>p.id===pid)
  const notify=(text,type='info')=>setMsg({text,type})

  const loadBase=async()=>{
    const [p,t]=await Promise.all([
      supabase.from('periods').select('*').order('month',{ascending:false}),
      supabase.from('tenants').select('*').eq('active',true).order('name')
    ])
    if(p.error||t.error){notify(p.error?.message||t.error?.message||'Impossible de charger les données.','error');return false}
    setPeriods(p.data||[]);setTenants(t.data||[])
    return true
  }
  useEffect(()=>{let active=true;(async()=>{setLoading(true);const [p,t]=await Promise.all([
    supabase.from('periods').select('*').order('month',{ascending:false}),
    supabase.from('tenants').select('*').eq('active',true).order('name')
  ]);if(!active)return;if(p.error||t.error)notify(p.error?.message||t.error?.message||'Impossible de charger les données.','error');else{setPeriods(p.data||[]);setTenants(t.data||[]);if(p.data?.length)setPid(p.data[0].id)}setLoading(false)})();return()=>{active=false}},[])

  const loadPeriod=async()=>{
    if(!period){setBills([]);setIdx({});return}
    const previous=periods.filter(p=>p.month<period.month).sort((a,b)=>b.month.localeCompare(a.month))[0]
    const [currentReadings,previousReadings,currentBills]=await Promise.all([
      supabase.from('readings').select('*').eq('period_id',pid),
      previous?supabase.from('readings').select('*').eq('period_id',previous.id):Promise.resolve({data:[],error:null}),
      supabase.from('bills').select('*, tenants(name), payments(id,amount)').eq('period_id',pid)
    ])
    const error=currentReadings.error||previousReadings.error||currentBills.error
    if(error){notify(error.message,'error');return}
    const values={}
    tenants.forEach(tenant=>{
      const current=(currentReadings.data||[]).find(row=>row.tenant_id===tenant.id)
      const old=(previousReadings.data||[]).find(row=>row.tenant_id===tenant.id)
      values[tenant.id]={prev:current?.prev_index??old?.curr_index??0,curr:current?.curr_index??''}
    })
    setIdx(values);setBills(currentBills.data||[])
    setMain({main_index:period.main_index??'',main_amount:period.main_amount??''})
    if(period.distributed_on)setDist(period.distributed_on)
  }
  useEffect(()=>{if(!loading)loadPeriod()},[pid,tenants,periods,loading])

  const createPeriod=async()=>{
    const price=Number(np.kwh_price)
    if(!/^\d{4}-\d{2}$/.test(np.month)||np.kwh_price===''||!Number.isFinite(price)||price<0){notify('Choisis un mois valide et indique un prix du kWh positif ou nul.','error');return}
    setBusy(true)
    try{
      const {data,error}=await supabase.from('periods').insert({month:np.month+'-01',kwh_price:price}).select().single()
      if(error)throw error
      const ok=await loadBase()
      if(ok){setPid(data.id);setNp({month:'',kwh_price:''});notify('La nouvelle période a été créée.','success')}
    }catch(error){notify(error.message||'Impossible de créer cette période.','error')}
    finally{setBusy(false)}
  }

  const saveReadings=async()=>{
    if(!pid){notify('Choisis une période.','error');return}
    const rows=tenants.filter(t=>idx[t.id]?.curr!=='').map(t=>({period_id:pid,tenant_id:t.id,prev_index:Number(idx[t.id].prev),curr_index:Number(idx[t.id].curr)}))
    if(!rows.length){notify('Saisis au moins un index actuel avant de continuer.','error');return}
    const bad=rows.find(r=>!Number.isFinite(r.prev_index)||!Number.isFinite(r.curr_index)||r.prev_index<0||r.curr_index<r.prev_index)
    if(bad){notify('Chaque index doit être positif ou nul et l’index actuel ne peut pas être inférieur au précédent.','error');return}
    setBusy(true)
    try{const {error}=await supabase.from('readings').upsert(rows,{onConflict:'period_id,tenant_id'});if(error)throw error;notify('Les relevés ont été enregistrés.','success');await loadPeriod()}
    catch(error){notify(error.message||'Impossible d’enregistrer les relevés.','error')}
    finally{setBusy(false)}
  }

  const generateBills=async()=>{
    if(!period){notify('Choisis une période.','error');return}
    if(!tenants.length){notify('Ajoute au moins un locataire actif avant de générer les factures.','error');return}
    setBusy(true)
    try{
      const previous=periods.filter(p=>p.month<period.month).sort((a,b)=>b.month.localeCompare(a.month))[0]
      const [readingResult,existingResult]=await Promise.all([
        supabase.from('readings').select('*').eq('period_id',pid),
        supabase.from('bills').select('id,tenant_id,payments(id)').eq('period_id',pid)
      ])
      if(readingResult.error)throw readingResult.error
      if(existingResult.error)throw existingResult.error
      const readings=readingResult.data||[]
      const missing=tenants.filter(t=>!readings.some(r=>r.tenant_id===t.id))
      if(missing.length)throw new Error('Il manque le relevé de : '+missing.map(t=>t.name).join(', ')+'.')
      const shares=previous?.residual>0?distributeResidual(previous.residual,tenants.length):tenants.map(()=>0)
      const rows=[];let protectedCount=0
      for(let i=0;i<tenants.length;i++){
        const tenant=tenants[i]
        const existing=(existingResult.data||[]).find(b=>b.tenant_id===tenant.id)
        if(existing?.payments?.length){protectedCount++;continue}
        let previousBill=null,previousPayments=[]
        if(previous){
          const {data:oldBill,error:oldBillError}=await supabase.from('bills').select('*').eq('period_id',previous.id).eq('tenant_id',tenant.id).maybeSingle()
          if(oldBillError)throw oldBillError
          previousBill=oldBill
          if(oldBill){const {data,error}=await supabase.from('payments').select('*').eq('bill_id',oldBill.id);if(error)throw error;previousPayments=data||[]}
        }
        rows.push({period_id:pid,tenant_id:tenant.id,...buildBill({reading:readings.find(r=>r.tenant_id===tenant.id),price:period.kwh_price,residualShare:shares[i],prevBill:previousBill,prevPayments:previousPayments,distributedOn:dist})})
      }
      if(rows.length){const {error}=await supabase.from('bills').upsert(rows,{onConflict:'period_id,tenant_id'});if(error)throw error}
      const {error:periodError}=await supabase.from('periods').update({distributed_on:dist}).eq('id',pid)
      if(periodError)throw periodError
      await loadPeriod()
      notify('Factures générées. '+(protectedCount?protectedCount+' facture(s) déjà payée(s) conservée(s) sans modification.':''),'success')
    }catch(error){notify(error.message||'Une erreur est survenue pendant la génération.','error')}
    finally{setBusy(false)}
  }

  const saveMain=async()=>{
    if(!period||!bills.length){notify('Génère les factures avant de calculer le résidu.','error');return}
    if(main.main_index===''||main.main_amount===''){notify('Renseigne l’index du compteur principal et le montant de la facture générale.','error');return}
    const mainIndex=Number(main.main_index),mainAmount=Number(main.main_amount)
    if(!Number.isFinite(mainIndex)||mainIndex<0||!Number.isFinite(mainAmount)||mainAmount<0){notify('L’index et le montant de la facture générale doivent être positifs ou nuls.','error');return}
    const residual=residualOf(mainAmount,bills)
    const {toFund}=splitResidual(residual)
    setBusy(true)
    try{
      const {error}=await supabase.rpc('save_mok_period_main_details',{p_period_id:pid,p_main_index:mainIndex,p_main_amount:mainAmount,p_residual:residual,p_fund_amount:toFund})
      if(error)throw error
      setPeriods(current=>current.map(p=>p.id===pid?{...p,main_index:mainIndex,main_amount:mainAmount,residual}:p))
      notify('Résidu calculé : '+fcfa(residual)+(residual<0?' est affecté au fonds d’urgence.':' sera partagé le mois suivant.'),'success')
    }catch(error){notify(error.message||'Impossible d’enregistrer la facture générale.','error')}
    finally{setBusy(false)}
  }

  const bilanPdf=async()=>{
    if(!period)return
    setBusy(true)
    try{
      const [r,b]=await Promise.all([supabase.from('readings').select('*').eq('period_id',pid),supabase.from('bills').select('*, tenants(name), payments(*)').eq('period_id',pid)])
      if(r.error||b.error)throw r.error||b.error
      monthReportPdf({period,readings:r.data||[],bills:b.data||[]})
    }catch(error){notify(error.message||'Impossible de préparer le bilan PDF.','error')}
    finally{setBusy(false)}
  }

  const readingCount=tenants.filter(t=>idx[t.id]?.curr!==''&&idx[t.id]?.curr!==undefined).length
  const totalBilled=sum(bills,'total'),totalConsumption=sum(bills,'consumption')
  const totalPaid=bills.reduce((acc,b)=>acc+(b.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0),0)
  const totalDue=totalBilled-totalPaid
  const allReadingsDone=tenants.length>0&&readingCount===tenants.length
  const money=(n)=>fcfa(n)

  return <section className="workspace-page">
    <header className="page-heading"><div><span className="eyebrow">GESTION LOCATIVE</span><h1>Suivi mensuel</h1><p>Centralise les relevés, les factures et les dépenses d’électricité de tes locations.</p></div></header>

    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">PÉRIODE DE TRAVAIL</span><h2>Choisir ou créer un mois</h2><p>Sélectionne la période à gérer ou prépare le mois suivant.</p></div></div>
      <div className="period-toolbar">
        <div className="field"><label htmlFor="period-select">Période sélectionnée</label><select id="period-select" value={pid} onChange={e=>{setPid(e.target.value);notify('')}}><option value="">Choisir un mois</option>{periods.map(p=><option key={p.id} value={p.id}>{fmtMonth(p.month)}</option>)}</select></div>
        <div className="field"><label htmlFor="new-period">Nouveau mois</label><input id="new-period" type="month" value={np.month} onChange={e=>setNp({...np,month:e.target.value})}/></div>
        <div className="field"><label htmlFor="kwh-price">Prix du kWh (FCFA)</label><input id="kwh-price" type="number" min="0" step="1" placeholder="Ex. 100" value={np.kwh_price} onChange={e=>setNp({...np,kwh_price:e.target.value})}/></div>
        <div className="toolbar-action"><button className="primary-button" disabled={busy||!np.month||np.kwh_price===''} onClick={createPeriod}>＋ Créer la période</button></div>
      </div>
    </section>

    {msg.text&&<div className={'notice '+(msg.type==='error'?'notice-error':msg.type==='success'?'notice-success':'notice-info')} role={msg.type==='error'?'alert':'status'}><span className="notice-icon">{msg.type==='error'?'!':msg.type==='success'?'✓':'i'}</span><span>{msg.text}</span></div>}
    {loading?<section className="panel"><div className="loading-inline"><span className="loading-spinner"/>Chargement de tes périodes et locataires…</div></section>:!period?<section className="panel"><div className="empty-state"><span className="empty-icon">▦</span><h3>Aucune période sélectionnée</h3><p>Crée ton premier mois ou sélectionne une période existante pour commencer la gestion.</p></div></section>:<>
      <div className="summary-grid">
        <article className="summary-card summary-primary"><span className="summary-label">Période active</span><strong>{fmtMonth(period.month)}</strong><span className="summary-foot">Prix kWh : {money(period.kwh_price)}</span></article>
        <article className="summary-card"><span className="summary-label">Locataires actifs</span><strong>{tenants.length}</strong><span className="summary-foot">Personnes à facturer</span></article>
        <article className="summary-card"><span className="summary-label">Consommation relevée</span><strong>{totalConsumption.toLocaleString('fr-FR')} kWh</strong><span className="summary-foot">{readingCount} / {tenants.length} relevés saisis</span></article>
        <article className="summary-card"><span className="summary-label">Reste à encaisser</span><strong>{money(totalDue)}</strong><span className="summary-foot">Sur {money(totalBilled)} facturés</span></article>
      </div>

      <section className="panel step-panel">
        <div className="panel-heading"><div><div className="step-title"><span className="step-number">1</span><h2>Relevés des compteurs individuels</h2></div><p className="step-description">Saisis l’index précédent et le nouvel index de chaque locataire.</p></div><div className="progress-strip"><span>{readingCount}/{tenants.length}</span><span className="progress-track"><span className="progress-fill" style={{width:(tenants.length?readingCount/tenants.length*100:0)+'%'}}/></span></div></div>
        {tenants.length===0?<div className="empty-state"><h3>Aucun locataire actif</h3><p>Ajoute ou réactive des locataires avant de saisir les relevés.</p></div>:<>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Locataire</th><th>Index précédent</th><th>Index actuel</th><th>Consommation</th></tr></thead><tbody>{tenants.map(t=>{const value=idx[t.id]||{};const previous=Number(value.prev||0);const current=value.curr===''||value.curr===undefined?null:Number(value.curr);const consumption=current===null?'—':Math.max(0,current-previous);return <tr key={t.id}><td><strong>{t.name}</strong></td><td><input aria-label={'Index précédent de '+t.name} type="number" min="0" step="1" value={value.prev??''} onChange={e=>setIdx({...idx,[t.id]:{...value,prev:e.target.value}})}/></td><td><input aria-label={'Index actuel de '+t.name} type="number" min="0" step="1" value={value.curr??''} onChange={e=>setIdx({...idx,[t.id]:{...value,curr:e.target.value}})}/></td><td>{consumption==='—'?'—':consumption.toLocaleString('fr-FR')+' kWh'}</td></tr>})}</tbody></table></div>
          <div className="panel-actions"><button className="primary-button" disabled={busy||!readingCount} onClick={saveReadings}>{busy?'Enregistrement…':'Enregistrer les relevés'}</button><span className="muted-help">Les index actuels sont requis pour générer les factures.</span></div>
        </>}
      </section>

      <section className="panel step-panel">
        <div className="panel-heading"><div><div className="step-title"><span className="step-number">2</span><h2>Factures des locataires</h2></div><p className="step-description">Génère les montants à payer à partir des relevés et des éventuels reports.</p></div></div>
        <div className="panel-actions"><div className="inline-field"><label htmlFor="distribution-date">Date de distribution</label><input id="distribution-date" type="date" value={dist} onChange={e=>setDist(e.target.value)}/></div><button className="primary-button" disabled={busy||!allReadingsDone} onClick={generateBills}>{busy?'Traitement…':'Générer / actualiser les factures'}</button><button className="secondary-button" disabled={busy||!bills.length} onClick={bilanPdf}>↓ Télécharger le bilan PDF</button></div>
        {!allReadingsDone&&tenants.length>0&&<p className="muted-help">Il reste {tenants.length-readingCount} relevé(s) à saisir avant de générer les factures.</p>}
        {bills.length===0?<div className="empty-state"><span className="empty-icon">▤</span><h3>Les factures apparaîtront ici</h3><p>Une fois les relevés enregistrés, tu pourras générer les factures de cette période.</p></div>:<>
          <hr className="section-divider"/><div className="metric-inline"><span className="metric-pill">Total facturé : <strong>{money(totalBilled)}</strong></span><span className="metric-pill">Déjà encaissé : <strong>{money(totalPaid)}</strong></span><span className="metric-pill">Reste dû : <strong>{money(totalDue)}</strong></span></div>
          <div className="bill-grid" style={{marginTop:14}}>{bills.map(b=>{const paid=(b.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);const remaining=Number(b.total)-paid;return <article className="bill-card" key={b.id}><div className="bill-card-top"><div><div className="bill-card-name">{b.tenants?.name||'Locataire'}</div><div className="bill-card-period">Facture · {fmtMonth(period.month)}</div></div><span className="bill-status">{remaining<=0?'Soldée':'À régler'}</span></div><div className="bill-lines"><div className="bill-line"><span>Consommation</span><strong>{Number(b.consumption||0).toLocaleString('fr-FR')} kWh · {money(b.conso_amount)}</strong></div><div className="bill-line"><span>Part du résidu</span><strong>{money(b.residual_share)}</strong></div><div className="bill-line"><span>{Number(b.carry)>=0?'Dette précédente':'Crédit précédent'}</span><strong>{money(Math.abs(Number(b.carry||0)))}</strong></div><div className="bill-line"><span>Pénalité</span><strong>{money(b.penalty)}</strong></div></div><div className="bill-total"><span>{remaining>0?'À payer avant le '+(b.due_on||'—'):'Montant réglé'}</span><strong>{money(b.total)}</strong></div></article>})}</div>
        </>}
      </section>

      <section className="panel step-panel">
        <div className="panel-heading"><div><div className="step-title"><span className="step-number">3</span><h2>Facture générale du fournisseur</h2></div><p className="step-description">Compare la facture du fournisseur à la somme des consommations individuelles pour calculer le résidu.</p></div></div>
        <div className="period-toolbar main-bill-toolbar">
          <div className="field"><label htmlFor="main-index">Index du compteur principal</label><input id="main-index" type="number" min="0" step="1" placeholder="Index général" value={main.main_index} onChange={e=>setMain({...main,main_index:e.target.value})}/></div>
          <div className="field"><label htmlFor="main-amount">Montant de la facture (FCFA)</label><input id="main-amount" type="number" min="0" step="1" placeholder="Montant total" value={main.main_amount} onChange={e=>setMain({...main,main_amount:e.target.value})}/></div>
          <div className="toolbar-action"><button className="primary-button" disabled={busy||!bills.length} onClick={saveMain}>{busy?'Enregistrement…':'Calculer et enregistrer le résidu'}</button></div>
        </div>
        {period.main_amount!==null&&period.main_amount!==undefined&&<div className="metric-inline" style={{marginTop:15}}><span className="metric-pill">Facture générale : <strong>{money(period.main_amount)}</strong></span><span className="metric-pill">Résidu calculé : <strong>{money(period.residual||0)}</strong></span><span className="metric-pill">{Number(period.residual||0)<0?'Affecté au fonds d’urgence':'À répartir le mois suivant'}</span></div>}
      </section>
    </>}
  </section>
}
