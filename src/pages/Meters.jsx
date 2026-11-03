import {useEffect,useState} from 'react'
import {supabase} from '../supabase'

export default function Meters() {
  const [tenants,setTenants]=useState([])
  const [values,setValues]=useState({})
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [message,setMessage]=useState({text:'',type:'info'})
  const load=async()=>{
    setLoading(true)
    const {data,error}=await supabase.from('tenants').select('id,name,phone,meter_no,active').order('name')
    if(error)setMessage({text:error.message,type:'error'})
    else {setTenants(data||[]);setValues(Object.fromEntries((data||[]).map(t=>[t.id,t.meter_no||''])))}
    setLoading(false)
  }
  useEffect(()=>{load()},[])
  const save=async tenant=>{
    setBusy(tenant.id);setMessage({text:'',type:'info'})
    const {error}=await supabase.from('tenants').update({meter_no:(values[tenant.id]||'').trim()||null}).eq('id',tenant.id)
    if(error)setMessage({text:error.message,type:'error'})
    else {setMessage({text:'Compteur enregistré pour '+tenant.name+'.',type:'success'});await load()}
    setBusy('')
  }
  const assigned=tenants.filter(t=>(values[t.id]||'').trim()).length
  return <section className="workspace-page">
    <header className="page-heading"><div><span className="eyebrow">PARC MATÉRIEL</span><h1>Gestion des compteurs</h1><p>Associe chaque compteur électrique à son locataire et maintiens ses références à jour.</p></div></header>
    <div className="summary-grid"><article className="summary-card summary-primary"><span className="summary-label">Compteurs renseignés</span><strong>{assigned} / {tenants.length}</strong><span className="summary-foot">Locataires avec numéro de compteur</span></article><article className="summary-card"><span className="summary-label">À compléter</span><strong>{tenants.length-assigned}</strong><span className="summary-foot">Compteurs sans référence</span></article></div>
    {message.text&&<div className={'notice '+(message.type==='error'?'notice-error':'notice-success')} role={message.type==='error'?'alert':'status'}>{message.text}</div>}
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">AFFECTATIONS</span><h2>Compteurs des locataires</h2><p>Le numéro est enregistré dans la fiche du locataire.</p></div></div>
      {loading?<div className="loading-inline"><span className="loading-spinner"/>Chargement des compteurs…</div>:tenants.length===0?<div className="empty-state"><h3>Aucun locataire</h3><p>Ajoute d'abord des locataires pour leur associer un compteur.</p></div>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Locataire</th><th>Téléphone</th><th>Numéro du compteur</th><th>État</th><th>Action</th></tr></thead><tbody>{tenants.map(t=><tr key={t.id}><td><strong>{t.name}</strong></td><td>{t.phone||'—'}</td><td><input aria-label={'Numéro du compteur de '+t.name} value={values[t.id]??''} placeholder="Ex. MTR-001" onChange={e=>setValues(v=>({...v,[t.id]:e.target.value}))}/></td><td>{(values[t.id]||'').trim()?'Renseigné':'À compléter'}</td><td><button className="primary-button" disabled={busy===t.id} onClick={()=>save(t)}>{busy===t.id?'Enregistrement…':'Enregistrer'}</button></td></tr>)}</tbody></table></div>}
    </section>
  </section>
}
