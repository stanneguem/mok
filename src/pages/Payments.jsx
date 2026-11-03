import {useEffect, useState} from 'react'
import {supabase, fcfa} from '../supabase'
import {receiptPdf} from '../pdf'

export default function Payments() {
  const [periods, setPeriods] = useState([]), [pid, setPid] = useState(''), [bills, setBills] = useState([])
  const [form, setForm] = useState({}), [receipt, setReceipt] = useState(null), [msg, setMsg] = useState('')
  useEffect(() => { supabase.from('periods').select('*').order('month', {ascending: false}).then(r => setPeriods(r.data || [])) }, [])
  const load = async id => {
    const {data} = await supabase.from('bills').select('*, tenants(name), payments(*)').eq('period_id', id)
    setBills(data || [])
  }
  const pay = async b => {
    const f = form[b.id] || {}, amount = +f.amount, paid = b.payments.reduce((s, p) => s + p.amount, 0), due = b.total - paid
    if (!amount || amount < due) return setMsg(`Montant refusé : minimum ${fcfa(due)} pour ${b.tenants.name}.`)
    const paid_on = f.date || new Date().toISOString().slice(0, 10)
    const {error} = await supabase.from('payments').insert({bill_id: b.id, amount, paid_on})
    if (error) return setMsg(error.message)
    const rest = b.total - (paid + amount) // <0 : crédit reporté
    setReceipt({name: b.tenants.name, amount, paid_on, rest, month: periods.find(p => p.id === pid)?.month.slice(0, 7)})
    setMsg(''); load(pid)
  }
  return <section><h3>Paiements</h3>
    <select value={pid} onChange={e => { setPid(e.target.value); load(e.target.value) }}><option value="">Choisir un mois</option>
      {periods.map(p => <option key={p.id} value={p.id}>{p.month.slice(0, 7)}</option>)}</select>
    <p className="msg">{msg}</p>
    <table><thead><tr><th>Locataire</th><th>Total</th><th>Payé</th><th>Nouveau paiement</th><th>Reçu</th></tr></thead><tbody>
      {bills.map(b => <tr key={b.id}><td>{b.tenants.name}</td><td>{fcfa(b.total)}</td><td>{fcfa(b.payments.reduce((s, p) => s + p.amount, 0))}</td>
        <td><input type="number" placeholder="Montant" onChange={e => setForm({...form, [b.id]: {...form[b.id], amount: e.target.value}})} />{' '}
          <input type="date" onChange={e => setForm({...form, [b.id]: {...form[b.id], date: e.target.value}})} />{' '}
          <button onClick={() => pay(b)}>Enregistrer</button></td>
        <td>{b.payments.length > 0 && <button className="alt" onClick={() => receiptPdf({bill: b, period: periods.find(p => p.id === pid), nb: bills.length})}>Reçu PDF</button>}</td></tr>)}</tbody></table>
    {receipt && <div className="bill"><b>Reçu — {receipt.name} ({receipt.month})</b><br />
      Payé : {fcfa(receipt.amount)} le {receipt.paid_on}<br />
      {receipt.rest > 0 ? `Reste dû : ${fcfa(receipt.rest)}` : receipt.rest < 0 ? `Crédit reporté au mois suivant : ${fcfa(-receipt.rest)}` : 'Facture soldée.'}<br />
      <button className="alt" onClick={() => window.print()}>Imprimer le reçu</button></div>}
  </section>
}
