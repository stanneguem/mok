import {useEffect,useMemo,useState} from 'react'
import {supabase,fcfa} from '../supabase'

const initials=name=>(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()
const dateLabel=value=>value?new Date(value+'T00:00:00').toLocaleDateString('fr-FR'):'—'

export default function Tenants() {
  const [list,setList]=useState([])
  const [query,setQuery]=useState('')
  const [selected,setSelected]=useState(null)
  const [details,setDetails]=useState({readings:[],bills:[],payments:[],periods:[]})
  const [form,setForm]=useState({name:'',phone:'',meter_no:''})
  const [editing,setEditing]=useState(false)
  const [showAdd,setShowAdd]=useState(false)
  const [section,setSection]=useState('overview')
  const [loading,setLoading]=useState(true)
  const [detailLoading,setDetailLoading]=useState(false)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState({text:'',type:'info'})

  const load=async()=>{
    const {data,error}=await supabase.from('tenants').select('id,name,phone,meter_no,active').order('name')
    if(error){setNotice({text:error.message,type:'error'});return}
    setList(data||[])
  }
  useEffect(()=>{let alive=true;(async()=>{setLoading(true);const {data,error}=await supabase.from('tenants').select('id,name,phone,meter_no,active').order('name');if(!alive)return;if(error)setNotice({text:error.message,type:'error'});else setList(data||[]);setLoading(false)})();return()=>{alive=false}},[])

  const filtered=useMemo(()=>{const q=query.trim().toLocaleLowerCase('fr');if(!q)return list;return list.filter(t=>[t.name,t.phone,t.meter_no].some(v=>(v||'').toLocaleLowerCase('fr').includes(q)))},[list,query])
  const openTenant=async tenant=>{
    setSelected(tenant);setEditing(false);setSection('overview');setDetailLoading(true)
    const [r,b,p,periods]=await Promise.all([
      supabase.from('readings').select('id,period_id,prev_index,curr_index,periods(month)').eq('tenant_id',tenant.id).order('period_id',{ascending:false}),
      supabase.from('bills').select('id,period_id,consumption,conso_amount,residual_share,carry,penalty,total,due_on,periods(month),payments(id,amount,paid_on)').eq('tenant_id',tenant.id).order('period_id',{ascending:false}),
      supabase.from('payments').select('id,bill_id,amount,paid_on').order('paid_on',{ascending:false}),
      supabase.from('periods').select('id,month').order('month',{ascending:false})
    ])
    const error=r.error||b.error||p.error||periods.error
    if(error)setNotice({text:'Impossible de charger toutes les informations : '+error.message,type:'error'})
    else {
      const tenantBills=b.data||[],billIds=new Set(tenantBills.map(x=>x.id))
      setDetails({readings:r.data||[],bills:tenantBills,payments:(p.data||[]).filter(x=>billIds.has(x.bill_id)),periods:periods.data||[]})
    }
    setDetailLoading(false)
  }
  const add=async()=>{
    const name=form.name.trim()
    if(!name){setNotice({text:'Le nom du locataire est obligatoire.',type:'error'});return}
    setBusy(true)
    const {data,error}=await supabase.from('tenants').insert({name,phone:form.phone.trim()||null,meter_no:form.meter_no.trim()||null}).select('id,name,phone,meter_no,active').single()
    setBusy(false)
    if(error){setNotice({text:error.message,type:'error'});return}
    setList(current=>[...current,data].sort((a,b)=>a.name.localeCompare(b.name)))
    setForm({name:'',phone:'',meter_no:''});setShowAdd(false);setNotice({text:'Locataire ajouté avec succès.',type:'success'});openTenant(data)
  }
  const save=async()=>{
    if(!selected?.name?.trim()){setNotice({text:'Le nom du locataire est obligatoire.',type:'error'});return}
    setBusy(true)
    const update={name:selected.name.trim(),phone:selected.phone?.trim()||null,meter_no:selected.meter_no?.trim()||null}
    const {error}=await supabase.from('tenants').update(update).eq('id',selected.id)
    setBusy(false)
    if(error){setNotice({text:error.message,type:'error'});return}
    const next={...selected,...update};setSelected(next);setList(items=>items.map(t=>t.id===next.id?next:t));setEditing(false);setNotice({text:'Fiche locataire mise à jour.',type:'success'})
  }
  const toggle=async()=>{
    if(!selected)return
    setBusy(true);const {error}=await supabase.from('tenants').update({active:!selected.active}).eq('id',selected.id);setBusy(false)
    if(error){setNotice({text:error.message,type:'error'});return}
    const next={...selected,active:!selected.active};setSelected(next);setList(items=>items.map(t=>t.id===next.id?next:t));setNotice({text:next.active?'Locataire réactivé.':'Locataire désactivé.',type:'success'})
  }
  const latestReading=details.readings[0]
  const latestBill=details.bills[0]
  const totalBilled=details.bills.reduce((s,b)=>s+Number(b.total||0),0)
  const totalPaid=details.payments.reduce((s,p)=>s+Number(p.amount||0),0)
  const totalDue=totalBilled-totalPaid
  const currentPeriod=details.periods[0]
  const currentReading=details.readings.find(r=>r.period_id===currentPeriod?.id)

  return <section className="workspace-page tenant-module">
    {!selected?<>
      <header className="page-heading tenant-page-heading"><div><span className="eyebrow">GESTION DES OCCUPANTS</span><h1>Locataires</h1><p>Retrouve les fiches des occupants et consulte leur situation en un seul endroit.</p></div><button className="primary-button" onClick={()=>{setShowAdd(v=>!v);setNotice({text:'',type:'info'})}}>{showAdd?'Fermer':'＋ Ajouter un locataire'}</button></header>
      {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':notice.type==='success'?'notice-success':'notice-info')} role={notice.type==='error'?'alert':'status'}>{notice.text}</div>}
      {showAdd&&<section className="panel tenant-add-panel"><div className="panel-heading"><div><span className="eyebrow">NOUVELLE FICHE</span><h2>Ajouter un locataire</h2></div></div><div className="tenant-form-grid"><div className="field"><label htmlFor="tenant-name">Nom complet *</label><input id="tenant-name" autoFocus value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="Nom et prénom"/></div><div className="field"><label htmlFor="tenant-phone">Téléphone</label><input id="tenant-phone" value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))} placeholder="+237…"/></div><div className="field"><label htmlFor="tenant-meter">Numéro du compteur actuel</label><input id="tenant-meter" value={form.meter_no} onChange={e=>setForm(v=>({...v,meter_no:e.target.value}))} placeholder="Référence compteur"/></div><div className="tenant-form-actions"><button className="primary-button" disabled={busy} onClick={add}>{busy?'Enregistrement…':'Enregistrer le locataire'}</button></div></div></section>}
      <div className="tenant-list-toolbar"><div className="tenant-search"><span aria-hidden="true">⌕</span><input aria-label="Rechercher un locataire" placeholder="Rechercher par nom, téléphone ou compteur…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Effacer la recherche">×</button>}</div><span className="tenant-list-count">{filtered.length} / {list.length} locataire{list.length>1?'s':''}</span></div>
      <section className="tenant-directory">
        {loading?<div className="panel"><div className="loading-inline"><span className="loading-spinner"/>Chargement des locataires…</div></div>:filtered.length===0?<div className="panel empty-state"><span className="empty-icon">♙</span><h3>{query?'Aucun résultat':'Aucun locataire enregistré'}</h3><p>{query?'Essaie avec un autre nom, numéro de téléphone ou compteur.':'Ajoute ton premier locataire pour commencer.'}</p></div>:filtered.map(t=><button type="button" className="tenant-directory-card" key={t.id} onClick={()=>openTenant(t)}><span className="tenant-directory-avatar">{initials(t.name)}</span><span className="tenant-directory-main"><strong>{t.name}</strong><small>{t.phone||'Téléphone non renseigné'} <i>·</i> {t.meter_no||'Compteur non affecté'}</small></span><span className={'tenant-directory-status '+(t.active?'active':'inactive')}>{t.active?'Actif':'Inactif'}</span><span className="tenant-directory-chevron">›</span></button>)}
      </section>
    </>:<>
      <header className="tenant-detail-toolbar"><button className="tenant-back-button" onClick={()=>{setSelected(null);setNotice({text:'',type:'info'});load()}}>← <span>Liste des locataires</span></button><span className="tenant-detail-breadcrumb">Fiche locataire</span></header>
      {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':notice.type==='success'?'notice-success':'notice-info')} role={notice.type==='error'?'alert':'status'}>{notice.text}</div>}
      <section className="tenant-profile-card">
        <div className="tenant-profile-identity"><span className="tenant-profile-avatar">{initials(selected.name)}</span><div><span className="eyebrow">FICHE LOCATAIRE</span><h1>{selected.name}</h1><p>{selected.phone||'Téléphone non renseigné'}</p></div></div>
        <div className="tenant-profile-actions"><span className={'tenant-directory-status '+(selected.active?'active':'inactive')}>{selected.active?'Actif':'Inactif'}</span><button className="secondary-button" onClick={()=>{setEditing(v=>!v);setNotice({text:'',type:'info'})}}>{editing?'Annuler':'Modifier la fiche'}</button><button className="secondary-button" disabled={busy} onClick={toggle}>{selected.active?'Désactiver':'Réactiver'}</button></div>
      </section>
      {editing&&<section className="panel tenant-edit-panel"><div className="tenant-form-grid"><div className="field"><label htmlFor="edit-tenant-name">Nom complet *</label><input id="edit-tenant-name" value={selected.name} onChange={e=>setSelected(v=>({...v,name:e.target.value}))}/></div><div className="field"><label htmlFor="edit-tenant-phone">Téléphone</label><input id="edit-tenant-phone" value={selected.phone||''} onChange={e=>setSelected(v=>({...v,phone:e.target.value}))}/></div><div className="field"><label htmlFor="edit-tenant-meter">Compteur actuel</label><input id="edit-tenant-meter" value={selected.meter_no||''} onChange={e=>setSelected(v=>({...v,meter_no:e.target.value}))}/></div><div className="tenant-form-actions"><button className="primary-button" disabled={busy} onClick={save}>{busy?'Enregistrement…':'Enregistrer les modifications'}</button></div></div></section>}
      {detailLoading?<div className="panel"><div className="loading-inline"><span className="loading-spinner"/>Chargement de la fiche et de son historique…</div></div>:<>
        <div className="tenant-profile-metrics"><article className="tenant-profile-metric"><span>Facturé au total</span><strong>{fcfa(totalBilled)}</strong></article><article className="tenant-profile-metric"><span>Payé au total</span><strong>{fcfa(totalPaid)}</strong></article><article className="tenant-profile-metric"><span>Solde restant</span><strong>{fcfa(totalDue)}</strong></article><article className="tenant-profile-metric"><span>Consommation cumulée</span><strong>{details.readings.reduce((s,r)=>s+Math.max(0,Number(r.curr_index)-Number(r.prev_index)),0).toLocaleString('fr-FR')} kWh</strong></article></div>
        <nav className="tenant-profile-shortcuts" aria-label="Informations du locataire">{[{id:'overview',icon:'▦',label:'Vue d’ensemble',count:''},{id:'meters',icon:'◉',label:'Compteurs',count:details.readings.length},{id:'readings',icon:'ϟ',label:'Relevés',count:details.readings.length},{id:'invoices',icon:'▤',label:'Factures',count:details.bills.length},{id:'payments',icon:'↗',label:'Paiements',count:details.payments.length}].map(item=><button type="button" key={item.id} className={section===item.id?'tenant-profile-shortcut active':'tenant-profile-shortcut'} onClick={()=>setSection(item.id)}><span>{item.icon}</span><strong>{item.label}</strong>{item.count!==''&&<small>{item.count}</small>}</button>)}</nav>
        {section==='overview'&&<div className="tenant-detail-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">COORDONNÉES</span><h2>Informations personnelles</h2></div></div><dl className="tenant-info-list"><div><dt>Nom complet</dt><dd>{selected.name}</dd></div><div><dt>Téléphone</dt><dd>{selected.phone||'Non renseigné'}</dd></div><div><dt>Statut</dt><dd>{selected.active?'Actif':'Inactif'}</dd></div></dl></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">COMPTEUR ACTUEL</span><h2>{selected.meter_no||'Aucun compteur affecté'}</h2><p>Référence actuellement enregistrée sur la fiche du locataire.</p></div></div><div className="tenant-current-meter"><span className="tenant-meter-icon">◉</span><div><strong>{selected.meter_no||'À affecter'}</strong><small>{currentReading?'Relevé de la période courante disponible':'Aucun relevé pour la période courante'}</small></div></div>{currentReading&&<div className="tenant-meter-reading"><span>Index actuel</span><strong>{Number(currentReading.curr_index).toLocaleString('fr-FR')}</strong></div>}<button className="tenant-inline-link" onClick={()=>setSection('meters')}>Voir les informations compteur →</button></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">DERNIÈRE ACTIVITÉ</span><h2>Situation récente</h2></div></div><div className="tenant-recent-lines"><div><span>Dernier relevé</span><strong>{latestReading?dateLabel(latestReading.periods?.month):'Aucun'}</strong></div><div><span>Dernière facture</span><strong>{latestBill?dateLabel(latestBill.periods?.month):'Aucune'}</strong></div><div><span>Dernier paiement</span><strong>{details.payments[0]?dateLabel(details.payments[0].paid_on):'Aucun'}</strong></div></div></section></div>}
        {section==='meters'&&<section className="panel"><div className="panel-heading"><div><span className="eyebrow">PARC DU LOCATAIRE</span><h2>Compteur actuel et historique disponible</h2><p>Le numéro actuel provient de la fiche locataire. Les relevés historiques sont listés par période.</p></div></div><div className="tenant-current-meter"><span className="tenant-meter-icon">◉</span><div><strong>{selected.meter_no||'Aucun numéro enregistré'}</strong><small>Compteur actuellement affecté</small></div></div><div className="tenant-meter-history"><h3>Historique des index</h3>{details.readings.length===0?<p className="muted-help">Aucun relevé enregistré pour ce locataire.</p>:details.readings.map(r=><div className="tenant-history-row" key={r.id}><span>{r.periods?.month?.slice(0,7)||'Période'}</span><span>Précédent : {r.prev_index}</span><span>Actuel : {r.curr_index}</span><strong>{Math.max(0,Number(r.curr_index)-Number(r.prev_index)).toLocaleString('fr-FR')} kWh</strong></div>)}</div></section>}
        {section==='readings'&&<section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE</span><h2>Relevés du locataire</h2></div></div>{details.readings.length===0?<div className="empty-state"><h3>Aucun relevé</h3><p>Les index saisis apparaîtront ici.</p></div>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Période</th><th>Index précédent</th><th>Index actuel</th><th>Consommation</th></tr></thead><tbody>{details.readings.map(r=><tr key={r.id}><td>{r.periods?.month?.slice(0,7)||'—'}</td><td>{r.prev_index}</td><td>{r.curr_index}</td><td>{Math.max(0,Number(r.curr_index)-Number(r.prev_index)).toLocaleString('fr-FR')} kWh</td></tr>)}</tbody></table></div>}</section>}
        {section==='invoices'&&<section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE FINANCIER</span><h2>Factures du locataire</h2></div></div>{details.bills.length===0?<div className="empty-state"><h3>Aucune facture</h3><p>Les factures générées apparaîtront ici.</p></div>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Période</th><th>Consommation</th><th>Montant</th><th>Échéance</th></tr></thead><tbody>{details.bills.map(b=><tr key={b.id}><td>{b.periods?.month?.slice(0,7)||'—'}</td><td>{Number(b.consumption||0).toLocaleString('fr-FR')} kWh</td><td>{fcfa(b.total)}</td><td>{dateLabel(b.due_on)}</td></tr>)}</tbody></table></div>}</section>}
        {section==='payments'&&<section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE FINANCIER</span><h2>Paiements du locataire</h2></div></div>{details.payments.length===0?<div className="empty-state"><h3>Aucun paiement</h3><p>Les règlements associés à ses factures apparaîtront ici.</p></div>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Facture</th><th className="align-right">Montant</th></tr></thead><tbody>{details.payments.map(p=><tr key={p.id}><td>{dateLabel(p.paid_on)}</td><td>{details.bills.find(b=>b.id===p.bill_id)?.periods?.month?.slice(0,7)||'—'}</td><td className="align-right">{fcfa(p.amount)}</td></tr>)}</tbody></table></div>}</section>}
      </>}
    </>}
  </section>
}
