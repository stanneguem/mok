import {useEffect, useState} from 'react'
import {supabase, fcfa} from '../supabase'
import {localISODate} from '../billing'
import {receiptPdf} from '../pdf'

export default function Payments() {
  const [periods, setPeriods] = useState([]), [pid, setPid] = useState(''), [bills, setBills] = useState([])
  const [form, setForm] = useState({}), [receipt, setReceipt] = useState(null), [msg, setMsg] = useState('')
  const [busyId, setBusyId] = useState('')
  useEffect(() => {
    supabase.from('periods').select('*').order('month', {ascending: false})
      .then(({data, error}) => error ? setMsg(error.message) : setPeriods(data || []))
  }, [])
  const load = async id => {
    if (!id) { setBills([]); return }
    const {data, error} = await supabase.from('bills')
      .select('*, tenants(name), payments(*)').eq('period_id', id)
    if (error) { setMsg(error.message); return }
    setBills(data || [])
  }
  const selectPeriod = id => { setPid(id); setReceipt(null); setMsg(''); load(id) }

  const pay = async bill => {
    const values = form[bill.id] || {}
    const amount = Number(values.amount)
    const payments = bill.payments || []
    const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const due = Number(bill.total) - paid
    if (!Number.isFinite(amount) || amount <= 0 || amount < due)
      return setMsg(`Montant refusé : le paiement doit couvrir au minimum ${fcfa(due)} pour ${bill.tenants?.name || 'ce locataire'}.`)
    const paid_on = values.date || localISODate()
    if (paid_on > localISODate()) return setMsg('La date du paiement ne peut pas être dans le futur.')
    setBusyId(bill.id)
    const {error} = await supabase.from('payments').insert({bill_id: bill.id, amount, paid_on})
    setBusyId('')
    if (error) return setMsg(error.message)
    const rest = Number(bill.total) - (paid + amount)
    setReceipt({
      name: bill.tenants?.name || 'Locataire', amount, paid_on, rest,
      month: periods.find(p => p.id === pid)?.month.slice(0, 7)
    })
    setMsg('Paiement enregistré.')
    await load(pid)
  }

  return <section><h3>Paiements</h3>
    <select value={pid} onChange={e => selectPeriod(e.target.value)}><option value="">Choisir un mois</option>
      {periods.map(p => <option key={p.id} value={p.id}>{p.month.slice(0, 7)}</option>)}</select>
    <p className="msg" role="status">{msg}</p>
    <table><thead><tr><th>Locataire</th><th>Total</th><th>Payé</th><th>Nouveau paiement</th><th>Reçu</th></tr></thead><tbody>
      {bills.map(bill => {
        const payments = bill.payments || []
        const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
        const due = Number(bill.total) - paid
        return <tr key={bill.id}>
          <td>{bill.tenants?.name || 'Locataire'}</td><td>{fcfa(bill.total)}</td><td>{fcfa(paid)}</td>
          <td>{due > 0 ? <>
            <input type="number" min={due} step="1" placeholder="Montant" value={form[bill.id]?.amount ?? ''}
              onChange={e => setForm({...form, [bill.id]: {...form[bill.id], amount: e.target.value}})} />{' '}
            <input type="date" max={localISODate()} value={form[bill.id]?.date ?? ''}
              onChange={e => setForm({...form, [bill.id]: {...form[bill.id], date: e.target.value}})} />{' '}
            <button disabled={busyId === bill.id} onClick={() => pay(bill)}>Enregistrer</button>
          </> : 'Facture soldée'}</td>
          <td>{payments.length > 0 && <button className="alt"
            onClick={() => receiptPdf({bill, period: periods.find(p => p.id === pid), nb: bills.length})}>Reçu PDF</button>}</td>
        </tr>
      })}</tbody></table>
    {receipt && <div className="bill"><b>Reçu — {receipt.name} ({receipt.month})</b><br />
      Payé : {fcfa(receipt.amount)} le {receipt.paid_on}<br />
      {receipt.rest > 0 ? `Reste dû : ${fcfa(receipt.rest)}` : receipt.rest < 0
        ? `Crédit reporté au mois suivant : ${fcfa(-receipt.rest)}` : 'Facture soldée.'}<br />
      <button className="alt" onClick={() => window.print()}>Imprimer le reçu</button></div>}
  </section>
}
