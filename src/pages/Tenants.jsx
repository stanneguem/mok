import {useEffect, useState} from 'react'
import {supabase} from '../supabase'

export default function Tenants() {
  const [list, setList] = useState([])
  const [form, setForm] = useState({name: '', phone: '', meter_no: ''})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const {data, error} = await supabase.from('tenants').select('*').order('name')
    if (error) { setMsg(error.message); return }
    setList(data || [])
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    const name = form.name.trim()
    if (!name) return setMsg('Le nom du locataire est obligatoire.')
    setBusy(true)
    const {error} = await supabase.from('tenants').insert({
      name, phone: form.phone.trim() || null, meter_no: form.meter_no.trim() || null
    })
    setBusy(false)
    if (error) return setMsg(error.message)
    setForm({name: '', phone: '', meter_no: ''})
    setMsg('Locataire ajouté.')
    await load()
  }

  const toggle = async tenant => {
    setBusy(true)
    const {error} = await supabase.from('tenants').update({active: !tenant.active}).eq('id', tenant.id)
    setBusy(false)
    if (error) return setMsg(error.message)
    setMsg(tenant.active ? 'Locataire désactivé.' : 'Locataire réactivé.')
    await load()
  }

  return <section><h3>Locataires</h3>
    <p>
      <input placeholder="Nom" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />{' '}
      <input placeholder="Téléphone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />{' '}
      <input placeholder="N° compteur" value={form.meter_no} onChange={e => setForm({...form, meter_no: e.target.value})} />{' '}
      <button disabled={busy} onClick={add}>Ajouter</button>
    </p>
    <p className="msg" role="status">{msg}</p>
    <table><tbody>{list.map(tenant => <tr key={tenant.id}>
      <td>{tenant.name}</td><td>{tenant.meter_no}</td><td>{tenant.phone}</td>
      <td><button disabled={busy} className="alt" onClick={() => toggle(tenant)}>
        {tenant.active ? 'Désactiver' : 'Réactiver'}
      </button></td>
    </tr>)}</tbody></table>
  </section>
}
