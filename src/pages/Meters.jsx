import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../supabase'

const empty={meter_number:'',meter_type:'electricity',brand:'',model:'',initial_index:'',installation_date:'',notes:''}
export default function Meters(){
  const [meters,setMeters]=useState([])
  const [houses,setHouses]=useState([])
  const [assignments,setAssignments]=useState([])
  const [form,setForm]=useState(empty)
  const [editing,setEditing]=useState(null)
  const [houseChoice,setHouseChoice]=useState({})
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [notice,setNotice]=useState({text:'',type:'info'})
  const load=async()=>{
    setLoading(true)
    const [m,h,a]=await Promise.all([
      supabase.from('meters').select('*').order('meter_number'),
      supabase.from('houses').select('id,name,address,city').eq('active',true).order('name'),
      supabase.from('meter_house_assignments').select('id,meter_id,house_id,assigned_at,houses(name,address)').is('released_at',null)
    ])
    const error=m.error||h.error||a.error
    if(error)setNotice({text:error.message,type:'error'})
    else {setMeters(m.data||[]);setHouses(h.data||[]);setAssignments(a.data||[])}
    setLoading(false)
  }
  useEffect(()=>{load()},[])
  const currentFor=m=>assignments.find(a=>a.meter_id===m.id)
  const assignedHouseIds=new Set(assignments.map(a=>a.house_id))
  const availableHouses=houses.filter(h=>!assignedHouseIds.has(h.id))
  const filtered=useMemo(()=>{const q=query.trim().toLocaleLowerCase('fr');return meters.filter(m=>[m.meter_number,m.brand,m.model,m.meter_type].some(v=>(v||'').toLocaleLowerCase('fr').includes(q)))},[meters,query])
  const save=async()=>{
    if(!form.meter_number.trim()){setNotice({text:'Le numéro de compteur est obligatoire.',type:'error'});return}
    setBusy('save')
    const payload={...form,initial_index:form.initial_index===''?null:Number(form.initial_index),installation_date:form.installation_date||null}
    const result=editing?await supabase.from('meters').update(payload).eq('id',editing):await supabase.from('meters').insert(payload)
    setBusy('')
    if(result.error){setNotice({text:result.error.message,type:'error'});return}
    setForm(empty);setEditing(null);setNotice({text:editing?'Compteur mis à jour.':'Compteur ajouté à l’inventaire.',type:'success'});await load()
  }
  const assign=async meter=>{
    const houseId=houseChoice[meter.id]
    if(!houseId)return
    setBusy(meter.id);setNotice({text:'',type:'info'})
    const {error}=await supabase.from('meter_house_assignments').insert({meter_id:meter.id,house_id:houseId})
    setBusy('')
    if(error)setNotice({text:error.code==='23505'?'Ce compteur ou cette maison possède déjà une affectation active.':error.message,type:'error'})
    else {setNotice({text:'Compteur affecté à la maison.',type:'success'});setHouseChoice(v=>({...v,[meter.id]:''}));await load()}
  }
  const release=async assignment=>{
    setBusy(assignment.id)
    const {error}=await supabase.from('meter_house_assignments').update({released_at:new Date().toISOString().slice(0,10)}).eq('id',assignment.id)
    setBusy('')
    if(error)setNotice({text:error.message,type:'error'})
    else {setNotice({text:'Compteur libéré. Son historique est conservé.',type:'success'});await load()}
  }
  const startEdit=m=>{setEditing(m.id);setForm(Object.fromEntries(Object.keys(empty).map(k=>[k,m[k]??''])))}
  return <section className="workspace-page inventory-module">
    <header className="page-heading"><div><span className="eyebrow">PARC MATÉRIEL</span><h1>Compteurs</h1><p>Gère l’inventaire et affecte chaque compteur à une seule maison à la fois.</p></div></header>
    {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')} role={notice.type==='error'?'alert':'status'}>{notice.text}</div>}
    <section className="panel inventory-form"><div className="panel-heading"><div><span className="eyebrow">{editing?'MODIFICATION':'NOUVEL ÉQUIPEMENT'}</span><h2>{editing?'Modifier le compteur':'Ajouter un compteur'}</h2></div></div>
      <div className="inventory-fields">
        <div className="field"><label>Numéro du compteur *</label><input value={form.meter_number} onChange={e=>setForm(v=>({...v,meter_number:e.target.value}))} placeholder="Ex. MTR-001"/></div>
        <div className="field"><label>Type</label><select value={form.meter_type} onChange={e=>setForm(v=>({...v,meter_type:e.target.value}))}><option value="electricity">Électricité</option><option value="water">Eau</option><option value="gas">Gaz</option><option value="other">Autre</option></select></div>
        <div className="field"><label>Marque</label><input value={form.brand} onChange={e=>setForm(v=>({...v,brand:e.target.value}))} placeholder="Marque"/></div>
        <div className="field"><label>Modèle</label><input value={form.model} onChange={e=>setForm(v=>({...v,model:e.target.value}))} placeholder="Modèle"/></div>
        <div className="field"><label>Index initial</label><input type="number" min="0" step="0.001" value={form.initial_index} onChange={e=>setForm(v=>({...v,initial_index:e.target.value}))} placeholder="0"/></div>
        <div className="field"><label>Date d’installation</label><input type="date" value={form.installation_date} onChange={e=>setForm(v=>({...v,installation_date:e.target.value}))}/></div>
        <div className="field inventory-field-wide"><label>Notes</label><input value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))} placeholder="Informations complémentaires"/></div>
      </div>
      <div className="inventory-actions"><button className="secondary-button" type="button" onClick={()=>{setEditing(null);setForm(empty)}}>Réinitialiser</button><button className="primary-button" type="button" disabled={busy==='save'} onClick={save}>{busy==='save'?'Enregistrement…':editing?'Enregistrer':'Ajouter le compteur'}</button></div>
    </section>
    <div className="tenant-list-toolbar"><div className="tenant-search"><span>⌕</span><input placeholder="Rechercher un compteur…" value={query} onChange={e=>setQuery(e.target.value)}/></div><span className="tenant-list-count">{meters.length} compteur{meters.length>1?'s':''}</span></div>
    {loading?<div className="panel loading-inline"><span className="loading-spinner"/>Chargement des compteurs…</div>:<div className="inventory-grid">{filtered.map(m=>{const a=currentFor(m);return <article className="panel inventory-card" key={m.id}>
      <div className="inventory-card-top"><span className="inventory-icon">◉</span><span className={'tenant-directory-status '+(a?'active':'inactive')}>{a?'Installé':'Disponible'}</span></div>
      <h2>{m.meter_number}</h2><p>{[m.brand,m.model,m.meter_type==='electricity'?'Électricité':m.meter_type==='water'?'Eau':m.meter_type==='gas'?'Gaz':'Autre'].filter(Boolean).join(' · ')}</p>
      <div className="inventory-meta"><span>Index initial : {m.initial_index??'—'}</span><span>Installation : {m.installation_date||'—'}</span></div>
      <div className="inventory-assignment">{a?<><div><small>MAISON ACTUELLE</small><strong>{a.houses?.name||'Maison'}</strong></div><button className="secondary-button" disabled={busy===a.id} onClick={()=>release(a)}>{busy===a.id?'…':'Libérer'}</button></>:<><select value={houseChoice[m.id]||''} onChange={e=>setHouseChoice(v=>({...v,[m.id]:e.target.value}))}><option value="">Choisir une maison disponible</option>{availableHouses.map(h=><option key={h.id} value={h.id}>{h.name}{h.address?' · '+h.address:''}</option>)}</select><button className="primary-button" disabled={!houseChoice[m.id]||busy===m.id} onClick={()=>assign(m)}>{busy===m.id?'…':'Affecter'}</button></>}</div>
      <button className="inventory-edit-link" onClick={()=>startEdit(m)}>Modifier les informations →</button>
    </article>})}{filtered.length===0&&<div className="panel empty-state"><h3>Aucun compteur trouvé</h3><p>Ajoute un compteur ou modifie ta recherche.</p></div>}</div>}
  </section>
}
