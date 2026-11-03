import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../supabase'
import RecordPhotoField from '../components/RecordPhotoField'
const empty={name:'',address:'',city:'',neighborhood:'',building:'',floor:'',door_number:'',description:''}
const dateLabel=v=>v?new Date(v+'T00:00:00').toLocaleDateString('fr-FR'):'—'
export default function Houses(){
 const [rows,setRows]=useState([]),[tenants,setTenants]=useState([]),[assignments,setAssignments]=useState([]),[meters,setMeters]=useState([]),[meterAssignments,setMeterAssignments]=useState([])
 const [selected,setSelected]=useState(null),[mode,setMode]=useState('list'),[form,setForm]=useState(empty),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState({text:'',type:'info'}),[tenantChoice,setTenantChoice]=useState('')
 const load=async()=>{
  const [h,t,a,m,ma]=await Promise.all([
   supabase.from('houses').select('*').order('name'),
   supabase.from('tenants').select('id,name,phone,active').order('name'),
   supabase.from('house_tenant_assignments').select('id,house_id,tenant_id,assigned_at,released_at,tenants(id,name,phone)').order('assigned_at',{ascending:false}),
   supabase.from('meters').select('id,meter_number,meter_type,brand,model,status').order('meter_number'),
   supabase.from('meter_house_assignments').select('id,house_id,meter_id,assigned_at,released_at,meters(id,meter_number,meter_type)').order('assigned_at',{ascending:false})
  ])
  const err=h.error||t.error||a.error||m.error||ma.error
  if(err)setNotice({text:err.message,type:'error'})
  else{setRows(h.data||[]);setTenants(t.data||[]);setAssignments(a.data||[]);setMeters(m.data||[]);setMeterAssignments(ma.data||[])}
  setLoading(false)
 }
 useEffect(()=>{load()},[])
 const currentTenant=h=>assignments.find(a=>a.house_id===h.id&&!a.released_at)
 const currentMeter=h=>meterAssignments.find(a=>a.house_id===h.id&&!a.released_at)
 const filtered=useMemo(()=>{const q=query.trim().toLocaleLowerCase('fr');return rows.filter(h=>[h.name,h.address,h.city,h.neighborhood].some(v=>(v||'').toLocaleLowerCase('fr').includes(q)))},[rows,query])
 const beginAdd=()=>{setForm(empty);setSelected(null);setMode('add');setNotice({text:'',type:'info'})}
 const beginEdit=()=>{setForm(Object.fromEntries(Object.keys(empty).map(k=>[k,selected[k]||''])));setMode('edit');setNotice({text:'',type:'info'})}
 const save=async()=>{
  if(!form.name.trim())return setNotice({text:'Le nom ou la référence de la maison est obligatoire.',type:'error'})
  setBusy(true);const payload={...form,name:form.name.trim()}
  const res=mode==='edit'?await supabase.from('houses').update(payload).eq('id',selected.id).select().single():await supabase.from('houses').insert(payload).select().single()
  setBusy(false);if(res.error)return setNotice({text:res.error.message,type:'error'})
  await load();setSelected(res.data);setMode('detail');setNotice({text:mode==='edit'?'Maison mise à jour.':'Maison ajoutée.',type:'success'})
 }
 const assignTenant=async()=>{
  if(!tenantChoice)return
  setBusy(true);const {error}=await supabase.from('house_tenant_assignments').insert({house_id:selected.id,tenant_id:tenantChoice})
  setBusy(false);if(error)return setNotice({text:error.code==='23505'?'Cette maison ou ce locataire possède déjà une affectation active.':error.message,type:'error'})
  setTenantChoice('');await load();setNotice({text:'Locataire affecté à la maison.',type:'success'})
 }
 const release=async a=>{setBusy(true);const {error}=await supabase.from('house_tenant_assignments').update({released_at:new Date().toISOString().slice(0,10)}).eq('id',a.id);setBusy(false);if(error)return setNotice({text:error.message,type:'error'});await load();setNotice({text:'Affectation clôturée. Historique conservé.',type:'success'})}
 const activeTenantIds=new Set(assignments.filter(a=>!a.released_at).map(a=>a.tenant_id))
 const history=assignments.filter(a=>a.house_id===selected?.id)
 const meterHistory=meterAssignments.filter(a=>a.house_id===selected?.id)
 const activeMeter=currentMeter(selected||{})
 const activeTenant=currentTenant(selected||{})
 const back=()=>{setMode('list');setSelected(null);setNotice({text:'',type:'info'});load()}
 return <section className="workspace-page tenant-module">
 {mode==='add'||mode==='edit'?<>
  <header className="tenant-edit-header"><button className="tenant-back-button" onClick={()=>setMode(mode==='edit'?'detail':'list')}>← {mode==='edit'?'Retour à la fiche':'Retour à la liste'}</button><span className="tenant-detail-breadcrumb">Maisons / {mode==='edit'?'Modification':'Nouvelle maison'}</span></header>
  {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')}>{notice.text}</div>}
  <section className="tenant-edit-hero"><span className="tenant-profile-avatar">⌂</span><div><span className="eyebrow">{mode==='edit'?'MODIFICATION':'NOUVEAU LOGEMENT'}</span><h1>{mode==='edit'?'Modifier la maison':'Ajouter une maison'}</h1><p>Renseigne les informations du logement.</p></div></section>
  <section className="panel tenant-edit-form-panel"><div className="panel-heading"><div><span className="eyebrow">INFORMATIONS DU LOGEMENT</span><h2>{form.name||'Nouvelle maison'}</h2></div></div>
   <div className="tenant-edit-fields">
    <div className="field"><label>Nom / Référence *</label><input autoFocus value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="Maison principale"/></div>
    <div className="field"><label>Adresse</label><input value={form.address} onChange={e=>setForm(v=>({...v,address:e.target.value}))}/></div>
    <div className="field"><label>Ville</label><input value={form.city} onChange={e=>setForm(v=>({...v,city:e.target.value}))}/></div>
    <div className="field"><label>Quartier</label><input value={form.neighborhood} onChange={e=>setForm(v=>({...v,neighborhood:e.target.value}))}/></div>
    <div className="field"><label>Bâtiment / Bloc</label><input value={form.building} onChange={e=>setForm(v=>({...v,building:e.target.value}))}/></div>
    <div className="field"><label>Étage</label><input value={form.floor} onChange={e=>setForm(v=>({...v,floor:e.target.value}))}/></div>
    <div className="field"><label>Porte / Appartement</label><input value={form.door_number} onChange={e=>setForm(v=>({...v,door_number:e.target.value}))}/></div>
    <div className="field tenant-field-wide"><label>Description</label><textarea value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></div>
   </div>
   <div className="tenant-edit-footer"><button className="secondary-button" disabled={busy} onClick={()=>setMode(mode==='edit'?'detail':'list')}>Annuler</button><button className="primary-button" disabled={busy} onClick={save}>{busy?'Enregistrement…':'Enregistrer la maison'}</button></div>
  </section>
 </>:mode==='detail'&&selected?<>
  <header className="tenant-detail-toolbar"><button className="tenant-back-button" onClick={back}>← <span>Liste des maisons</span></button><span className="tenant-detail-breadcrumb">Fiche maison</span></header>
  {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')}>{notice.text}</div>}
  <section className="tenant-profile-card"><div className="tenant-profile-identity"><span className="tenant-profile-avatar">⌂</span><div><span className="eyebrow">FICHE MAISON</span><h1>{selected.name}</h1><p>{[selected.address,selected.neighborhood,selected.city].filter(Boolean).join(' · ')||'Adresse non renseignée'}</p></div></div><div className="tenant-profile-actions"><span className={'tenant-directory-status '+(selected.active?'active':'inactive')}>{selected.active?'Active':'Inactive'}</span><button className="secondary-button" onClick={beginEdit}>Modifier la maison</button></div></section>
  <div className="tenant-profile-metrics"><article className="tenant-profile-metric"><span>Occupant actuel</span><strong>{activeTenant?.tenants?.name||'Aucun'}</strong></article><article className="tenant-profile-metric"><span>Compteur actuel</span><strong>{activeMeter?.meters?.meter_number||'Aucun'}</strong></article><article className="tenant-profile-metric"><span>Historique locataires</span><strong>{history.length}</strong></article><article className="tenant-profile-metric"><span>Historique compteurs</span><strong>{meterHistory.length}</strong></article></div>
  <div className="tenant-detail-grid">
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">OCCUPATION</span><h2>Locataire actuel</h2></div></div>
    {activeTenant?<><dl className="tenant-info-list"><div><dt>Nom</dt><dd>{activeTenant.tenants?.name}</dd></div><div><dt>Téléphone</dt><dd>{activeTenant.tenants?.phone||'—'}</dd></div><div><dt>Depuis le</dt><dd>{dateLabel(activeTenant.assigned_at)}</dd></div></dl><button className="secondary-button" disabled={busy} onClick={()=>release(activeTenant)}>Libérer la maison</button></>:<><p className="muted-help">Cette maison est disponible.</p><div className="field"><label>Affecter un locataire</label><select value={tenantChoice} onChange={e=>setTenantChoice(e.target.value)}><option value="">Choisir un locataire disponible</option>{tenants.filter(t=>t.active&&!activeTenantIds.has(t.id)).map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></div><button className="primary-button" disabled={!tenantChoice||busy} onClick={assignTenant}>Affecter le locataire</button></>}
   </section>
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">COMPTEUR</span><h2>Compteur installé</h2></div></div>{activeMeter?<dl className="tenant-info-list"><div><dt>Numéro</dt><dd>{activeMeter.meters?.meter_number}</dd></div><div><dt>Type</dt><dd>{activeMeter.meters?.meter_type||'—'}</dd></div><div><dt>Depuis le</dt><dd>{dateLabel(activeMeter.assigned_at)}</dd></div></dl>:<p className="muted-help">Aucun compteur affecté à cette maison.</p>}</section>
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE</span><h2>Anciennes affectations locataires</h2></div></div>{history.length?history.map(a=><div className="tenant-history-row" key={a.id}><strong>{a.tenants?.name||'Locataire'}</strong><span>{dateLabel(a.assigned_at)} → {a.released_at?dateLabel(a.released_at):'En cours'}</span></div>):<p className="muted-help">Aucune affectation enregistrée.</p>}</section>
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE</span><h2>Anciennes affectations compteurs</h2></div></div>{meterHistory.length?meterHistory.map(a=><div className="tenant-history-row" key={a.id}><strong>{a.meters?.meter_number||'Compteur'}</strong><span>{dateLabel(a.assigned_at)} → {a.released_at?dateLabel(a.released_at):'En cours'}</span></div>):<p className="muted-help">Aucune affectation enregistrée.</p>}</section>
  </div>
 </>:<>
  <header className="page-heading tenant-page-heading"><div><span className="eyebrow">PATRIMOINE IMMOBILIER</span><h1>Maisons</h1><p>Consulte les logements, leurs occupants et les compteurs installés.</p></div><button className="primary-button" onClick={beginAdd}>＋ Ajouter une maison</button></header>
  {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')}>{notice.text}</div>}
  <div className="tenant-list-toolbar"><div className="tenant-search"><span>⌕</span><input placeholder="Rechercher une maison…" value={query} onChange={e=>setQuery(e.target.value)}/></div><span className="tenant-list-count">{filtered.length} / {rows.length} maison{rows.length>1?'s':''}</span></div>
  <section className="tenant-directory">{loading?<div className="panel"><div className="loading-inline"><span className="loading-spinner"/>Chargement des maisons…</div></div>:filtered.length===0?<div className="panel empty-state"><span className="empty-icon">⌂</span><h3>{query?'Aucun résultat':'Aucune maison enregistrée'}</h3><p>Ajoute une maison pour commencer.</p></div>:filtered.map(h=>{const tenant=currentTenant(h),meter=currentMeter(h);return <button type="button" className="tenant-directory-card" key={h.id} onClick={()=>{setSelected(h);setMode('detail');setNotice({text:'',type:'info'})}}><span className="tenant-directory-avatar">⌂</span><span className="tenant-directory-main"><strong>{h.name}</strong><small>{[h.address,h.neighborhood,h.city].filter(Boolean).join(' · ')||'Adresse non renseignée'} <i>·</i> {tenant?.tenants?.name||'Disponible'}</small></span><span className={'tenant-directory-status '+(h.active?'active':'inactive')}>{meter?.meters?.meter_number||'Sans compteur'}</span><span className="tenant-directory-chevron">›</span></button>})}</section>
 </>}
 </section>
}
