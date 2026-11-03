import {useEffect, useState} from 'react'
import {supabase} from '../supabase'
export default function Tenants() {
  const [list, setList] = useState([]), [f, setF] = useState({name: '', phone: '', meter_no: ''})
  const load = () => supabase.from('tenants').select('*').order('name').then(r => setList(r.data || []))
  useEffect(() => { load() }, [])
  const add = async () => { if (!f.name) return; await supabase.from('tenants').insert(f); setF({name: '', phone: '', meter_no: ''}); load() }
  const toggle = async t => { await supabase.from('tenants').update({active: !t.active}).eq('id', t.id); load() }
  return <section><h3>Locataires</h3>
    <p><input placeholder="Nom" value={f.name} onChange={e => setF({...f, name: e.target.value})} />{' '}
      <input placeholder="Téléphone" value={f.phone} onChange={e => setF({...f, phone: e.target.value})} />{' '}
      <input placeholder="N° compteur" value={f.meter_no} onChange={e => setF({...f, meter_no: e.target.value})} />{' '}
      <button onClick={add}>Ajouter</button></p>
    <table><tbody>{list.map(t => <tr key={t.id}><td>{t.name}</td><td>{t.meter_no}</td><td>{t.phone}</td>
      <td><button className="alt" onClick={() => toggle(t)}>{t.active ? 'Désactiver' : 'Réactiver'}</button></td></tr>)}</tbody></table></section>
}
