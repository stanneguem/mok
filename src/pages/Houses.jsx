import {useEffect,useMemo,useState} from 'react'
import {supabase,fcfa} from '../supabase'
import RecordPhotoField from '../components/RecordPhotoField'

const empty={name:'',address:'',city:'',neighborhood:'',building:'',floor:'',door_number:'',description:'',photo_urls:[],rent_amount:'',charges:[],latitude:'',longitude:''}
const dateLabel=v=>v?new Date(v+'T00:00:00').toLocaleDateString('fr-FR'):'—'
const chargeTypes=[{value:'electricity',label:'Électricité'},{value:'water',label:'Eau'},{value:'gas',label:'Gaz'},{value:'internet',label:'Internet'},{value:'waste',label:'Ordures ménagères'},{value:'security',label:'Gardiennage'},{value:'other',label:'Autre'}]
const chargeName=value=>chargeTypes.find(x=>x.value===value)?.label||'Autre'

export default function Houses(){
 const [rows,setRows]=useState([]),[tenants,setTenants]=useState([]),[assignments,setAssignments]=useState([]),[meters,setMeters]=useState([]),[meterAssignments,setMeterAssignments]=useState([])
 const [selected,setSelected]=useState(null),[mode,setMode]=useState('list'),[form,setForm]=useState(empty),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[locating,setLocating]=useState(false),[notice,setNotice]=useState({text:'',type:'info'}),[tenantChoice,setTenantChoice]=useState(''),[meterChoice,setMeterChoice]=useState('')
 const load=async()=>{
  const [h,t,a,m,ma]=await Promise.all([
   supabase.from('houses').select('*').order('name'),
   supabase.from('tenants').select('id,name,phone,active').order('name'),
   supabase.from('house_tenant_assignments').select('id,house_id,tenant_id,assigned_at,released_at,tenants(id,name,phone)').order('assigned_at',{ascending:false}),
   supabase.from('meters').select('id,meter_number,meter_type,brand,model,status,active').order('meter_number'),
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
 const beginAdd=()=>{setForm({...empty,charges:[]});setSelected(null);setMode('add');setNotice({text:'',type:'info'})}
 const beginEdit=()=>{setForm({...empty,...selected,rent_amount:selected.rent_amount??'',latitude:selected.latitude??'',longitude:selected.longitude??'',charges:Array.isArray(selected.charges)?selected.charges:[]});setMode('edit');setNotice({text:'',type:'info'})}
 const locate=()=>{
  if(!navigator.geolocation)return setNotice({text:'La géolocalisation n’est pas disponible sur cet appareil.',type:'error'})
  setLocating(true)
  navigator.geolocation.getCurrentPosition(pos=>{setForm(v=>({...v,latitude:String(pos.coords.latitude),longitude:String(pos.coords.longitude)}));setLocating(false);setNotice({text:'Position récupérée. Tu peux encore préciser l’adresse.',type:'success'})},err=>{setLocating(false);setNotice({text:err.code===1?'Autorise la localisation dans ton navigateur pour récupérer la position.':'Impossible de récupérer la position. Vérifie le GPS et réessaie.',type:'error'})},{enableHighAccuracy:true,timeout:12000,maximumAge:60000})
 }
 const addCharge=()=>setForm(v=>({...v,charges:[...v.charges,{type:'electricity',name:'',amount:'',billing_mode:'separate'}]}))
 const updateCharge=(index,key,value)=>setForm(v=>({...v,charges:v.charges.map((c,i)=>i===index?{...c,[key]:value}:c)}))
 const removeCharge=index=>setForm(v=>({...v,charges:v.charges.filter((_,i)=>i!==index)}))
 const save=async()=>{
  if(!form.name.trim())return setNotice({text:'Le nom ou la référence de la maison est obligatoire.',type:'error'})
  const charges=form.charges.map(c=>({...c,name:c.type==='other'?(c.name||'Autre charge'):chargeName(c.type),amount:Number(c.amount||0)}))
  if(charges.some(c=>!Number.isFinite(c.amount)||c.amount<0))return setNotice({text:'Vérifie les montants des charges : ils doivent être positifs ou nuls.',type:'error'})
  if(form.rent_amount!==''&&(!Number.isFinite(Number(form.rent_amount))||Number(form.rent_amount)<0))return setNotice({text:'Le loyer doit être un montant positif ou nul.',type:'error'})
  setBusy(true)
  const payload={name:form.name.trim(),address:form.address||null,city:form.city||null,neighborhood:form.neighborhood||null,building:form.building||null,floor:form.floor||null,door_number:form.door_number||null,description:form.description||null,photo_urls:form.photo_urls||[],rent_amount:form.rent_amount===''?null:Number(form.rent_amount),charges,latitude:form.latitude===''?null:Number(form.latitude),longitude:form.longitude===''?null:Number(form.longitude)}
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
 const assignMeter=async()=>{
  if(!meterChoice)return
  setBusy(true);const {error}=await supabase.from('meter_house_assignments').insert({house_id:selected.id,meter_id:meterChoice})
  setBusy(false);if(error)return setNotice({text:error.code==='23505'?'Ce compteur ou cette maison possède déjà une affectation active.':error.message,type:'error'})
  setMeterChoice('');await load();setNotice({text:'Compteur associé à la maison.',type:'success'})
 }
 const release=async(a,table,label)=>{setBusy(true);const {error}=await supabase.from(table).update({released_at:new Date().toISOString().slice(0,10)}).eq('id',a.id);setBusy(false);if(error)return setNotice({text:error.message,type:'error'});await load();setNotice({text:label+' clôturée. Historique conservé.',type:'success'})}
 const activeTenantIds=new Set(assignments.filter(a=>!a.released_at).map(a=>a.tenant_id))
 const activeMeterIds=new Set(meterAssignments.filter(a=>!a.released_at).map(a=>a.meter_id))
 const history=assignments.filter(a=>a.house_id===selected?.id)
 const meterHistory=meterAssignments.filter(a=>a.house_id===selected?.id)
 const activeMeter=currentMeter(selected||{})
 const activeTenant=currentTenant(selected||{})
 const back=()=>{setMode('list');setSelected(null);setNotice({text:'',type:'info'});load()}
 const locationLabel=h=>[h.address,h.neighborhood,h.city].filter(Boolean).join(' · ')||'Adresse non renseignée'
 return <section className="workspace-page tenant-module">
 {mode==='add'||mode==='edit'?<>
  <header className="tenant-edit-header"><button className="tenant-back-button" onClick={()=>setMode(mode==='edit'?'detail':'list')}>← {mode==='edit'?'Retour à la fiche':'Retour à la liste'}</button><span className="tenant-detail-breadcrumb">Maisons / {mode==='edit'?'Modification':'Nouvelle maison'}</span></header>
  {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')}>{notice.text}</div>}
  <section className="tenant-edit-hero"><span className="tenant-profile-avatar">⌂</span><div><span className="eyebrow">{mode==='edit'?'MODIFICATION':'NOUVEAU LOGEMENT'}</span><h1>{mode==='edit'?'Modifier la maison':'Ajouter une maison'}</h1><p>Informations, loyer, charges, compteur et localisation du logement.</p></div></section>
  <section className="panel tenant-edit-form-panel">
   <div className="panel-heading"><div><span className="eyebrow">INFORMATIONS DU LOGEMENT</span><h2>{form.name||'Nouvelle maison'}</h2></div></div>
   <RecordPhotoField value={form.photo_urls} multiple max={6} label="Photos de la maison (6 maximum)" onChange={photo_urls=>setForm(v=>({...v,photo_urls}))}/>
   <div className="tenant-edit-fields">
    <div className="field"><label>Nom / Référence *</label><input autoFocus value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="Maison principale"/></div>
    <div className="field"><label>Adresse</label><input value={form.address} onChange={e=>setForm(v=>({...v,address:e.target.value}))} placeholder="Rue, numéro…"/></div>
    <div className="field"><label>Ville</label><input value={form.city} onChange={e=>setForm(v=>({...v,city:e.target.value}))}/></div>
    <div className="field"><label>Quartier</label><input value={form.neighborhood} onChange={e=>setForm(v=>({...v,neighborhood:e.target.value}))}/></div>
    <div className="field"><label>Bâtiment / Bloc</label><input value={form.building} onChange={e=>setForm(v=>({...v,building:e.target.value}))}/></div>
    <div className="field"><label>Étage</label><input value={form.floor} onChange={e=>setForm(v=>({...v,floor:e.target.value}))}/></div>
    <div className="field"><label>Porte / Appartement</label><input value={form.door_number} onChange={e=>setForm(v=>({...v,door_number:e.target.value}))}/></div>
   </div>
   <div className="house-form-section"><div className="panel-heading"><div><span className="eyebrow">LOCALISATION GPS</span><h2>Position de la maison</h2><p className="muted-help">Tu peux saisir les coordonnées ou récupérer la position actuelle de l’appareil.</p></div><button type="button" className="secondary-button" onClick={locate} disabled={locating}>{locating?'Localisation…':'◎ Utiliser ma position'}</button></div>
    <div className="tenant-edit-fields"><div className="field"><label>Latitude</label><input type="number" step="any" value={form.latitude} onChange={e=>setForm(v=>({...v,latitude:e.target.value}))} placeholder="3.8480"/></div><div className="field"><label>Longitude</label><input type="number" step="any" value={form.longitude} onChange={e=>setForm(v=>({...v,longitude:e.target.value}))} placeholder="11.5021"/></div></div>
   </div>
   <div className="house-form-section"><div className="panel-heading"><div><span className="eyebrow">CONDITIONS LOCATIVES</span><h2>Loyer mensuel</h2></div></div>
    <div className="field house-rent-field"><label>Prix de location par mois (FCFA)</label><input type="number" min="0" step="1" value={form.rent_amount} onChange={e=>setForm(v=>({...v,rent_amount:e.target.value}))} placeholder="Ex. 75000"/></div>
    <div className="panel-heading house-charge-heading"><div><span className="eyebrow">CHARGES LIÉES AU LOGEMENT</span><h2>Électricité, eau et autres charges</h2><p className="muted-help">Indique si chaque charge est comprise dans le loyer ou facturée séparément.</p></div><button type="button" className="secondary-button" onClick={addCharge}>＋ Ajouter une charge</button></div>
    {form.charges.length===0?<p className="muted-help">Aucune charge renseignée. Tu pourras en ajouter, par exemple l’eau, l’électricité, internet ou le gardiennage.</p>:form.charges.map((charge,index)=><div className="house-charge-row" key={index}>
      <div className="field"><label>Type de charge</label><select value={charge.type||'other'} onChange={e=>updateCharge(index,'type',e.target.value)}>{chargeTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      {charge.type==='other'&&<div className="field"><label>Nom de la charge</label><input value={charge.name||''} onChange={e=>updateCharge(index,'name',e.target.value)} placeholder="Ex. entretien"/></div>}
      <div className="field"><label>Montant mensuel (FCFA)</label><input type="number" min="0" step="1" value={charge.amount} onChange={e=>updateCharge(index,'amount',e.target.value)} placeholder="0"/></div>
      <div className="field"><label>Mode de facturation</label><select value={charge.billing_mode||'separate'} onChange={e=>updateCharge(index,'billing_mode',e.target.value)}><option value="included">Compris dans le loyer</option><option value="separate">À gérer / facturer à part</option></select></div>
      <button type="button" className="house-remove-charge" onClick={()=>removeCharge(index)} aria-label="Supprimer cette charge">×</button>
     </div>)}
   </div>
   <div className="field tenant-field-wide"><label>Description / Informations complémentaires</label><textarea value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></div>
   <div className="tenant-edit-footer"><button className="secondary-button" disabled={busy} onClick={()=>setMode(mode==='edit'?'detail':'list')}>Annuler</button><button className="primary-button" disabled={busy} onClick={save}>{busy?'Enregistrement…':'Enregistrer la maison'}</button></div>
  </section>
 </>:mode==='detail'&&selected?<>
  <header className="tenant-detail-toolbar"><button className="tenant-back-button" onClick={back}>← <span>Liste des maisons</span></button><span className="tenant-detail-breadcrumb">Fiche maison</span></header>
  {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')}>{notice.text}</div>}
  <section className="tenant-profile-card"><div className="tenant-profile-identity">{selected.photo_urls?.[0]?<img className="record-profile-photo" src={selected.photo_urls[0]} alt=""/>:<span className="tenant-profile-avatar">⌂</span>}<div><span className="eyebrow">FICHE MAISON</span><h1>{selected.name}</h1><p>{locationLabel(selected)}</p></div></div><div className="tenant-profile-actions"><span className={'tenant-directory-status '+(selected.active?'active':'inactive')}>{selected.active?'Active':'Inactive'}</span><button className="secondary-button" onClick={beginEdit}>Modifier la maison</button></div></section>
  {selected.photo_urls?.length>0&&<section className="panel"><div className="panel-heading"><div><span className="eyebrow">GALERIE</span><h2>Photos de la maison</h2></div></div><div className="record-photo-gallery">{selected.photo_urls.map((url,i)=><img src={url} alt={'Maison '+selected.name+' '+(i+1)} key={url}/>)}</div></section>}
  <div className="tenant-profile-metrics"><article className="tenant-profile-metric"><span>Loyer mensuel</span><strong>{selected.rent_amount==null?'—':fcfa(selected.rent_amount)}</strong></article><article className="tenant-profile-metric"><span>Occupant actuel</span><strong>{activeTenant?.tenants?.name||'Aucun'}</strong></article><article className="tenant-profile-metric"><span>Compteur actuel</span><strong>{activeMeter?.meters?.meter_number||'Aucun'}</strong></article><article className="tenant-profile-metric"><span>Charges renseignées</span><strong>{(selected.charges||[]).length}</strong></article></div>
  <div className="tenant-detail-grid">
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">LOCALISATION</span><h2>Adresse et position</h2></div></div><dl className="tenant-info-list"><div><dt>Adresse</dt><dd>{locationLabel(selected)}</dd></div><div><dt>Bâtiment / étage / porte</dt><dd>{[selected.building,selected.floor,selected.door_number].filter(Boolean).join(' · ')||'—'}</dd></div><div><dt>Coordonnées GPS</dt><dd>{selected.latitude!=null&&selected.longitude!=null?selected.latitude+', '+selected.longitude:'Non renseignées'}</dd></div></dl>{selected.latitude!=null&&selected.longitude!=null&&<a className="secondary-button house-map-link" href={'https://www.google.com/maps?q='+selected.latitude+','+selected.longitude} target="_blank" rel="noreferrer">Voir sur la carte ↗</a>}</section>
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">LOYER ET CHARGES</span><h2>Conditions locatives</h2></div></div><dl className="tenant-info-list"><div><dt>Loyer mensuel</dt><dd>{selected.rent_amount==null?'Non renseigné':fcfa(selected.rent_amount)}</dd></div></dl>{(selected.charges||[]).length?selected.charges.map((c,i)=><div className="tenant-history-row" key={i}><strong>{c.name||chargeName(c.type)}</strong><span>{fcfa(c.amount)} · {c.billing_mode==='included'?'Compris dans le loyer':'Facturé séparément'}</span></div>):<p className="muted-help">Aucune charge renseignée.</p>}</section>
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">OCCUPATION</span><h2>Locataire actuel</h2></div></div>
    {activeTenant?<><dl className="tenant-info-list"><div><dt>Nom</dt><dd>{activeTenant.tenants?.name}</dd></div><div><dt>Téléphone</dt><dd>{activeTenant.tenants?.phone||'—'}</dd></div><div><dt>Depuis le</dt><dd>{dateLabel(activeTenant.assigned_at)}</dd></div></dl><button className="secondary-button" disabled={busy} onClick={()=>release(activeTenant,'house_tenant_assignments','Affectation locataire')}>Libérer la maison</button></>:<><p className="muted-help">Cette maison est disponible.</p><div className="field"><label>Affecter un locataire</label><select value={tenantChoice} onChange={e=>setTenantChoice(e.target.value)}><option value="">Choisir un locataire disponible</option>{tenants.filter(t=>t.active&&!activeTenantIds.has(t.id)).map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></div><button className="primary-button" disabled={!tenantChoice||busy} onClick={assignTenant}>Affecter le locataire</button></>}
   </section>
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">COMPTEUR</span><h2>Compteur associé</h2></div></div>{activeMeter?<><dl className="tenant-info-list"><div><dt>Numéro</dt><dd>{activeMeter.meters?.meter_number}</dd></div><div><dt>Type</dt><dd>{activeMeter.meters?.meter_type||'—'}</dd></div><div><dt>Depuis le</dt><dd>{dateLabel(activeMeter.assigned_at)}</dd></div></dl><button className="secondary-button" disabled={busy} onClick={()=>release(activeMeter,'meter_house_assignments','Affectation compteur')}>Retirer le compteur</button></>:<><p className="muted-help">Associe un compteur disponible à cette maison.</p><div className="field"><label>Compteur disponible</label><select value={meterChoice} onChange={e=>setMeterChoice(e.target.value)}><option value="">Choisir un compteur</option>{meters.filter(m=>m.active&&m.status!=='retired'&&!activeMeterIds.has(m.id)).map(m=><option value={m.id} key={m.id}>{m.meter_number} · {m.meter_type||'Type non précisé'}</option>)}</select></div><button className="primary-button" disabled={!meterChoice||busy} onClick={assignMeter}>Associer le compteur</button></>}</section>
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE</span><h2>Affectations locataires</h2></div></div>{history.length?history.map(a=><div className="tenant-history-row" key={a.id}><strong>{a.tenants?.name||'Locataire'}</strong><span>{dateLabel(a.assigned_at)} → {a.released_at?dateLabel(a.released_at):'En cours'}</span></div>):<p className="muted-help">Aucune affectation enregistrée.</p>}</section>
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE</span><h2>Affectations compteurs</h2></div></div>{meterHistory.length?meterHistory.map(a=><div className="tenant-history-row" key={a.id}><strong>{a.meters?.meter_number||'Compteur'}</strong><span>{dateLabel(a.assigned_at)} → {a.released_at?dateLabel(a.released_at):'En cours'}</span></div>):<p className="muted-help">Aucune affectation enregistrée.</p>}</section>
  </div>
 </>:<>
  <header className="page-heading tenant-page-heading"><div><span className="eyebrow">PATRIMOINE IMMOBILIER</span><h1>Maisons</h1><p>Consulte les logements, leurs loyers, charges, occupants et compteurs installés.</p></div><button className="primary-button" onClick={beginAdd}>＋ Ajouter une maison</button></header>
  {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')}>{notice.text}</div>}
  <div className="tenant-list-toolbar"><div className="tenant-search"><span>⌕</span><input placeholder="Rechercher une maison…" value={query} onChange={e=>setQuery(e.target.value)}/></div><span className="tenant-list-count">{filtered.length} / {rows.length} maison{rows.length>1?'s':''}</span></div>
  <section className="tenant-directory">{loading?<div className="panel"><div className="loading-inline"><span className="loading-spinner"/>Chargement des maisons…</div></div>:filtered.length===0?<div className="panel empty-state"><span className="empty-icon">⌂</span><h3>{query?'Aucun résultat':'Aucune maison enregistrée'}</h3><p>Ajoute une maison pour commencer.</p></div>:filtered.map(h=>{const tenant=currentTenant(h),meter=currentMeter(h);return <button type="button" className="tenant-directory-card" key={h.id} onClick={()=>{setSelected(h);setMode('detail');setNotice({text:'',type:'info'})}}>{h.photo_urls?.[0]?<img className="tenant-directory-avatar record-directory-photo" src={h.photo_urls[0]} alt=""/>:<span className="tenant-directory-avatar">⌂</span>}<span className="tenant-directory-main"><strong>{h.name}</strong><small>{locationLabel(h)} <i>·</i> {tenant?.tenants?.name||'Disponible'} <i>·</i> {h.rent_amount==null?'Loyer non renseigné':fcfa(h.rent_amount)}</small></span><span className={'tenant-directory-status '+(h.active?'active':'inactive')}>{meter?.meters?.meter_number||'Sans compteur'}</span><span className="tenant-directory-chevron">›</span></button>})}</section>
 </>}
 </section>
}
