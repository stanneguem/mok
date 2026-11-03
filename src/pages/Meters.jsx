import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../supabase'
const empty={meter_number:'',meter_type:'electricity',brand:'',model:'',initial_index:'',installation_date:'',notes:''}
const dateLabel=v=>v?new Date(v+'T00:00:00').toLocaleDateString('fr-FR'):'—'
const typeLabel=v=>({electricity:'Électricité',water:'Eau',gas:'Gaz',other:'Autre'}[v]||'Autre')
export default function Meters(){
 const [rows,setRows]=useState([]),[houses,setHouses]=useState([]),[assignments,setAssignments]=useState([]),[selected,setSelected]=useState(null)
 const [mode,setMode]=useState('list'),[form,setForm]=useState(empty),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState({text:'',type:'info'}),[houseChoice,setHouseChoice]=useState('')
 const load=async()=>{
  const [m,h,a]=await Promise.all([
   supabase.from('meters').select('*').order('meter_number'),
   supabase.from('houses').select('id,name,address,city,active').eq('active',true).order('name'),
   supabase.from('meter_house_assignments').select('id,meter_id,house_id,assigned_at,released_at,houses(id,name,address)').order('assigned_at',{ascending:false})
  ])
  const err=m.error||h.error||a.error
  if(err)setNotice({text:err.message,type:'error'});else{setRows(m.data||[]);setHouses(h.data||[]);setAssignments(a.data||[])}
  setLoading(false)
 }
 useEffect(()=>{load()},[])
 const current=m=>assignments.find(a=>a.meter_id===m.id&&!a.released_at)
 const filtered=useMemo(()=>{const q=query.trim().toLocaleLowerCase('fr');return rows.filter(m=>[m.meter_number,m.brand,m.model,m.meter_type].some(v=>(v||'').toLocaleLowerCase('fr').includes(q)))},[rows,query])
 const beginAdd=()=>{setForm(empty);setSelected(null);setMode('add');setNotice({text:'',type:'info'})}
 const beginEdit=()=>{setForm(Object.fromEntries(Object.keys(empty).map(k=>[k,selected[k]??''])));setMode('edit');setNotice({text:'',type:'info'})}
 const save=async()=>{
  if(!form.meter_number.trim())return setNotice({text:'Le numéro de compteur est obligatoire.',type:'error'})
  setBusy(true);const payload={...form,initial_index:form.initial_index===''?null:Number(form.initial_index),installation_date:form.installation_date||null}
  const res=mode==='edit'?await supabase.from('meters').update(payload).eq('id',selected.id).select().single():await supabase.from('meters').insert(payload).select().single()
  setBusy(false);if(res.error)return setNotice({text:res.error.message,type:'error'})
  await load();setSelected(res.data);setMode('detail');setNotice({text:mode==='edit'?'Compteur mis à jour.':'Compteur ajouté.',type:'success'})
 }
 const assign=async()=>{
  if(!houseChoice)return
  setBusy(true);const {error}=await supabase.from('meter_house_assignments').insert({meter_id:selected.id,house_id:houseChoice})
  setBusy(false);if(error)return setNotice({text:error.code==='23505'?'Ce compteur ou cette maison possède déjà un compteur actif.':error.message,type:'error'})
  setHouseChoice('');await load();setNotice({text:'Compteur affecté à la maison.',type:'success'})
 }
 const release=async a=>{setBusy(true);const {error}=await supabase.from('meter_house_assignments').update({released_at:new Date().toISOString().slice(0,10)}).eq('id',a.id);setBusy(false);if(error)return setNotice({text:error.message,type:'error'});await load();setNotice({text:'Compteur libéré. Historique conservé.',type:'success'})}
 const activeHouseIds=new Set(assignments.filter(a=>!a.released_at).map(a=>a.house_id))
 const history=assignments.filter(a=>a.meter_id===selected?.id),activeAssignment=current(selected||{})
 const back=()=>{setMode('list');setSelected(null);setNotice({text:'',type:'info'});load()}
 return <section className="workspace-page tenant-module">
 {mode==='add'||mode==='edit'?<>
  <header className="tenant-edit-header"><button className="tenant-back-button" onClick={()=>setMode(mode==='edit'?'detail':'list')}>← {mode==='edit'?'Retour à la fiche':'Retour à la liste'}</button><span className="tenant-detail-breadcrumb">Compteurs / {mode==='edit'?'Modification':'Nouveau compteur'}</span></header>
  {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')}>{notice.text}</div>}
  <section className="tenant-edit-hero"><span className="tenant-profile-avatar">◉</span><div><span className="eyebrow">{mode==='edit'?'MODIFICATION':'NOUVEL ÉQUIPEMENT'}</span><h1>{mode==='edit'?'Modifier le compteur':'Ajouter un compteur'}</h1><p>Renseigne les caractéristiques du compteur.</p></div></section>
  <section className="panel tenant-edit-form-panel"><div className="panel-heading"><div><span className="eyebrow">INFORMATIONS DU COMPTEUR</span><h2>{form.meter_number||'Nouveau compteur'}</h2></div></div>
   <div className="tenant-edit-fields">
    <div className="field"><label>Numéro du compteur *</label><input autoFocus value={form.meter_number} onChange={e=>setForm(v=>({...v,meter_number:e.target.value}))} placeholder="MTR-001"/></div>
    <div className="field"><label>Type</label><select value={form.meter_type} onChange={e=>setForm(v=>({...v,meter_type:e.target.value}))}><option value="electricity">Électricité</option><option value="water">Eau</option><option value="gas">Gaz</option><option value="other">Autre</option></select></div>
    <div className="field"><label>Marque</label><input value={form.brand} onChange={e=>setForm(v=>({...v,brand:e.target.value}))}/></div>
    <div className="field"><label>Modèle</label><input value={form.model} onChange={e=>setForm(v=>({...v,model:e.target.value}))}/></div>
    <div className="field"><label>Index initial</label><input type="number" min="0" step="0.001" value={form.initial_index} onChange={e=>setForm(v=>({...v,initial_index:e.target.value}))}/></div>
    <div className="field"><label>Date d’installation</label><input type="date" value={form.installation_date} onChange={e=>setForm(v=>({...v,installation_date:e.target.value}))}/></div>
    <div className="field tenant-field-wide"><label>Notes</label><textarea value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></div>
   </div>
   <div className="tenant-edit-footer"><button className="secondary-button" disabled={busy} onClick={()=>setMode(mode==='edit'?'detail':'list')}>Annuler</button><button className="primary-button" disabled={busy} onClick={save}>{busy?'Enregistrement…':'Enregistrer le compteur'}</button></div>
  </section>
 </>:mode==='detail'&&selected?<>
  <header className="tenant-detail-toolbar"><button className="tenant-back-button" onClick={back}>← <span>Liste des compteurs</span></button><span className="tenant-detail-breadcrumb">Fiche compteur</span></header>
  {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')}>{notice.text}</div>}
  <section className="tenant-profile-card"><div className="tenant-profile-identity"><span className="tenant-profile-avatar">◉</span><div><span className="eyebrow">FICHE COMPTEUR</span><h1>{selected.meter_number}</h1><p>{typeLabel(selected.meter_type)} · {[selected.brand,selected.model].filter(Boolean).join(' ')||'Marque non renseignée'}</p></div></div><div className="tenant-profile-actions"><span className={'tenant-directory-status '+(activeAssignment?'active':'inactive')}>{activeAssignment?'Installé':'Disponible'}</span><button className="secondary-button" onClick={beginEdit}>Modifier le compteur</button></div></section>
  <div className="tenant-profile-metrics"><article className="tenant-profile-metric"><span>Maison actuelle</span><strong>{activeAssignment?.houses?.name||'Aucune'}</strong></article><article className="tenant-profile-metric"><span>Index initial</span><strong>{selected.initial_index??'—'}</strong></article><article className="tenant-profile-metric"><span>Date d’installation</span><strong>{dateLabel(selected.installation_date)}</strong></article><article className="tenant-profile-metric"><span>Affectations historiques</span><strong>{history.length}</strong></article></div>
  <div className="tenant-detail-grid">
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">INSTALLATION</span><h2>Maison affectée</h2></div></div>
    {activeAssignment?<><dl className="tenant-info-list"><div><dt>Maison</dt><dd>{activeAssignment.houses?.name}</dd></div><div><dt>Adresse</dt><dd>{activeAssignment.houses?.address||'—'}</dd></div><div><dt>Depuis le</dt><dd>{dateLabel(activeAssignment.assigned_at)}</dd></div></dl><button className="secondary-button" disabled={busy} onClick={()=>release(activeAssignment)}>Libérer le compteur</button></>:<><p className="muted-help">Ce compteur est disponible.</p><div className="field"><label>Affecter à une maison disponible</label><select value={houseChoice} onChange={e=>setHouseChoice(e.target.value)}><option value="">Choisir une maison</option>{houses.filter(h=>!activeHouseIds.has(h.id)).map(h=><option value={h.id} key={h.id}>{h.name}</option>)}</select></div><button className="primary-button" disabled={!houseChoice||busy} onClick={assign}>Affecter le compteur</button></>}
   </section>
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">CARACTÉRISTIQUES</span><h2>Détails techniques</h2></div></div><dl className="tenant-info-list"><div><dt>Numéro</dt><dd>{selected.meter_number}</dd></div><div><dt>Type</dt><dd>{typeLabel(selected.meter_type)}</dd></div><div><dt>Marque</dt><dd>{selected.brand||'—'}</dd></div><div><dt>Modèle</dt><dd>{selected.model||'—'}</dd></div><div><dt>Index initial</dt><dd>{selected.initial_index??'—'}</dd></div><div><dt>Notes</dt><dd>{selected.notes||'—'}</dd></div></dl></section>
   <section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE</span><h2>Anciennes affectations</h2></div></div>{history.length?history.map(a=><div className="tenant-history-row" key={a.id}><strong>{a.houses?.name||'Maison'}</strong><span>{dateLabel(a.assigned_at)} → {a.released_at?dateLabel(a.released_at):'En cours'}</span></div>):<p className="muted-help">Aucune affectation enregistrée.</p>}</section>
  </div>
 </>:<>
  <header className="page-heading tenant-page-heading"><div><span className="eyebrow">PARC MATÉRIEL</span><h1>Compteurs</h1><p>Consulte les compteurs enregistrés et leur maison d’installation.</p></div><button className="primary-button" onClick={beginAdd}>＋ Ajouter un compteur</button></header>
  {notice.text&&<div className={'notice '+(notice.type==='error'?'notice-error':'notice-success')}>{notice.text}</div>}
  <div className="tenant-list-toolbar"><div className="tenant-search"><span>⌕</span><input placeholder="Rechercher un compteur…" value={query} onChange={e=>setQuery(e.target.value)}/></div><span className="tenant-list-count">{filtered.length} / {rows.length} compteur{rows.length>1?'s':''}</span></div>
  <section className="tenant-directory">{loading?<div className="panel"><div className="loading-inline"><span className="loading-spinner"/>Chargement des compteurs…</div></div>:filtered.length===0?<div className="panel empty-state"><span className="empty-icon">◉</span><h3>{query?'Aucun résultat':'Aucun compteur enregistré'}</h3><p>Ajoute un compteur pour commencer.</p></div>:filtered.map(m=>{const a=current(m);return <button type="button" className="tenant-directory-card" key={m.id} onClick={()=>{setSelected(m);setMode('detail');setNotice({text:'',type:'info'})}}><span className="tenant-directory-avatar">◉</span><span className="tenant-directory-main"><strong>{m.meter_number}</strong><small>{typeLabel(m.meter_type)} <i>·</i> {a?.houses?.name||'Disponible'}</small></span><span className={'tenant-directory-status '+(a?'active':'inactive')}>{a?'Installé':'Disponible'}</span><span className="tenant-directory-chevron">›</span></button>})}</section>
 </>}
 </section>
}
