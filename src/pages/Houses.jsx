import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../supabase'

const empty={name:'',address:'',city:'',neighborhood:'',building:'',floor:'',door_number:'',description:''}

export default function Houses(){
  const [houses,setHouses]=useState([])
  const [tenants,setTenants]=useState([])
  const [assignments,setAssignments]=useState([])
  const [form,setForm]=useState(empty)
  const [editing,setEditing]=useState(null)
  const [tenantChoice,setTenantChoice]=useState({})
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [notice,setNotice]=useState({text:'',type:'info'})
  const load=async()=>{
    setLoading(true)
    const [h,t,a]=await Promise.all([
      supabase.from('houses').select('*').order('name'),
      supabase.from('tenants').select('id,name,phone,active').eq('active',true).order('name'),
      supabase.from('house_tenant_assignments').select('id,house_id,tenant_id,assigned_at,tenants(name)').is('released_at',null)
    ])
    const error=h.error||t.error||a.error
    if(error)setNotice({text:error.message,type:'error'})
    else {setHouses(h.data||[]);setTenants(t.data||[]);setAssignments(a.data||[])}
    setLoading(false)
  }
  useEffect(()=>{load()},[])
  const currentFor=house=>assignments.find(a=>a.house_id===house.id)
  const assignedTenantIds=new Set(assignments.map(a=>a.tenant_id))
  const availableTenants=tenants.filter(t=>!assignedTenantIds.has(t.id))
  const filtered=useMemo(()=>{const q=query.trim().toLocaleLowerCase('fr');return houses.filter(h=>[h.name,h.address,h.city,h.neighborhood].some(v=>(v||'').toLocaleLowerCase('fr').includes(q)))},[houses,query])
  const save=async()=>{
    if(!form.name.trim()){setNotice({text:'Le nom ou la référence de la maison est obligatoire.',type:'error'});return}
    setBusy('save')
    const payload={...form,name:form.name.trim()}
    const result=editing?await supabase.from('houses').update(payload).eq('id',editing):await supabase.from('houses').insert(payload)
    setBusy('')
    if(result.error){setNotice({text:result.error.message,type:'error'});return}
    setForm(empty);setEditing(null);setNotice({text:editing?'Maison mise à jour.':'Maison ajoutée.',type:'success'});await load()
  }
  const startEdit=h=>{setEditing(h.id);setForm(Object.fromEntries(Object.keys(empty).map(k=>[k,h[k]||''])))}
  const assign=async house=>{
    const tenantId=tenantChoice[house.id]
    if(!tenantId)return
    setBusy(house.id);setNotice({text:'',type:'info'})
    const {error}=await supabase.from('house_tenant_assignments').insert({house_id:house.id,tenant_id:tenantId})
    setBusy('')
    if(error)setNotice({text:error.code==='23505'?'Cette maison ou ce locataire possède déjà une affectation active.':error.message,type:'error'})
    else {setNotice({text:'Locataire affecté à la maison.',type:'success'});setTenantChoice(v=>({...v,[house.id]:''}));await load()}
  }
  const release=async assignment=>{
    setBusy(assignment.id)
    const {error}=await supabase.from('house_tenant_assignments').update({released_at:new Date().toISOString().slice(0,10)}).eq('id',assignment.id)
    setBusy('')
    if(error)setNotice({text:error.message,type:'error'})
    else {setNotice({text:'Affectation clôturée. L’historique est conservé.',type:'success'});await load()}
  }
  return <section className="workspace-page inventory-module">
    <header className="page-heading"><div><span className="eyebrow">PATRIMOINE IMMOBILIER</span><h1>Maisons</h1><p>Gère les logements et leurs occupants. Chaque maison ne peut avoir qu’un seul locataire actif.</p></div></header>
    {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')} role={notice.type==='error'?'alert':'status'}>{notice.text}</div>}
    <section className="panel inventory-form"><div className="panel-heading"><div><span className="eyebrow">{editing?'MODIFICATION':'NOUVEAU LOGEMENT'}</span><h2>{editing?'Modifier la maison':'Ajouter une maison'}</h2></div></div>
      <div className="inventory-fields">
        <div className="field"><label>Nom / Référence *</label><input value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="Ex. Maison principale"/></div>
        <div className="field"><label>Adresse</label><input value={form.address} onChange={e=>setForm(v=>({...v,address:e.target.value}))} placeholder="Rue et numéro"/></div>
        <div className="field"><label>Ville</label><input value={form.city} onChange={e=>setForm(v=>({...v,city:e.target.value}))} placeholder="Ville"/></div>
        <div className="field"><label>Quartier</label><input value={form.neighborhood} onChange={e=>setForm(v=>({...v,neighborhood:e.target.value}))} placeholder="Quartier"/></div>
        <div className="field"><label>Bâtiment / Bloc</label><input value={form.building} onChange={e=>setForm(v=>({...v,building:e.target.value}))} placeholder="Bâtiment A"/></div>
        <div className="field"><label>Étage</label><input value={form.floor} onChange={e=>setForm(v=>({...v,floor:e.target.value}))} placeholder="RDC, 1er…"/></div>
        <div className="field"><label>Porte / Appartement</label><input value={form.door_number} onChange={e=>setForm(v=>({...v,door_number:e.target.value}))} placeholder="Appartement 2"/></div>
        <div className="field"><label>Description</label><input value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} placeholder="Informations complémentaires"/></div>
      </div>
      <div className="inventory-actions"><button className="secondary-button" type="button" onClick={()=>{setEditing(null);setForm(empty)}}>Réinitialiser</button><button className="primary-button" type="button" disabled={busy==='save'} onClick={save}>{busy==='save'?'Enregistrement…':editing?'Enregistrer':'Ajouter la maison'}</button></div>
    </section>
    <div className="tenant-list-toolbar"><div className="tenant-search"><span>⌕</span><input placeholder="Rechercher une maison…" value={query} onChange={e=>setQuery(e.target.value)}/></div><span className="tenant-list-count">{houses.length} logement{houses.length>1?'s':''}</span></div>
    {loading?<div className="panel loading-inline"><span className="loading-spinner"/>Chargement des maisons…</div>:<div className="inventory-grid">{filtered.map(h=>{const a=currentFor(h);return <article className="panel inventory-card" key={h.id}>
      <div className="inventory-card-top"><span className="inventory-icon">⌂</span><span className="tenant-directory-status active">{a?'Occupée':'Disponible'}</span></div>
      <h2>{h.name}</h2><p>{[h.address,h.neighborhood,h.city].filter(Boolean).join(' · ')||'Adresse non renseignée'}</p>
      <div className="inventory-meta"><span>Bâtiment : {h.building||'—'}</span><span>Étage : {h.floor||'—'}</span><span>Porte : {h.door_number||'—'}</span></div>
      <div className="inventory-assignment">{a?<><div><small>LOCATAIRE ACTUEL</small><strong>{a.tenants?.name||'Locataire'}</strong></div><button className="secondary-button" disabled={busy===a.id} onClick={()=>release(a)}>{busy===a.id?'…':'Libérer'}</button></>:<><select value={tenantChoice[h.id]||''} onChange={e=>setTenantChoice(v=>({...v,[h.id]:e.target.value}))}><option value="">Choisir un locataire disponible</option>{availableTenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button className="primary-button" disabled={!tenantChoice[h.id]||busy===h.id} onClick={()=>assign(h)}>{busy===h.id?'…':'Affecter'}</button></>}</div>
      <button className="inventory-edit-link" onClick={()=>startEdit(h)}>Modifier les informations →</button>
    </article>})}{filtered.length===0&&<div className="panel empty-state"><h3>Aucune maison trouvée</h3><p>Ajoute un logement ou modifie ta recherche.</p></div>}</div>}
  </section>
}
