import {useEffect, useState} from 'react'
import {supabase, fcfa} from '../supabase'
import {buildBill, residualOf, splitResidual} from '../billing'
import {monthReportPdf} from '../pdf'

export default function Month() {
  const [periods, setPeriods] = useState([]), [pid, setPid] = useState(''), [tenants, setTenants] = useState([])
  const [idx, setIdx] = useState({}), [bills, setBills] = useState([]), [msg, setMsg] = useState('')
  const [np, setNp] = useState({month: '', kwh_price: ''}), [main, setMain] = useState({main_index: '', main_amount: ''})
  const [dist, setDist] = useState(new Date().toISOString().slice(0, 10))
  const period = periods.find(p => p.id === pid)

  const loadBase = async () => {
    const [p, t] = await Promise.all([supabase.from('periods').select('*').order('month', {ascending: false}),
      supabase.from('tenants').select('*').eq('active', true).order('name')])
    setPeriods(p.data || []); setTenants(t.data || [])
  }
  useEffect(() => { loadBase() }, [])

  const loadPeriod = async () => {
    if (!period) return
    const prev = periods.find(p => p.month < period.month)
    const [r, pr, b] = await Promise.all([
      supabase.from('readings').select('*').eq('period_id', pid),
      prev ? supabase.from('readings').select('*').eq('period_id', prev.id) : {data: []},
      supabase.from('bills').select('*, tenants(name)').eq('period_id', pid)])
    const m = {}
    tenants.forEach(t => {
      const cur = (r.data || []).find(x => x.tenant_id === t.id), old = (pr.data || []).find(x => x.tenant_id === t.id)
      m[t.id] = {prev: cur?.prev_index ?? old?.curr_index ?? 0, curr: cur?.curr_index ?? ''}
    })
    setIdx(m); setBills(b.data || []); setMain({main_index: period.main_index ?? '', main_amount: period.main_amount ?? ''})
  }
  useEffect(() => { loadPeriod() }, [pid, tenants.length])

  const createPeriod = async () => {
    const {data, error} = await supabase.from('periods').insert({month: np.month + '-01', kwh_price: +np.kwh_price}).select().single()
    if (error) return setMsg(error.message)
    await loadBase(); setPid(data.id)
  }

  const saveReadings = async () => {
    const rows = tenants.filter(t => idx[t.id]?.curr !== '').map(t => ({period_id: pid, tenant_id: t.id, prev_index: +idx[t.id].prev, curr_index: +idx[t.id].curr}))
    const bad = rows.find(r => r.curr_index < r.prev_index)
    if (bad) return setMsg('Un index actuel est inférieur à l\'index précédent.')
    const {error} = await supabase.from('readings').upsert(rows, {onConflict: 'period_id,tenant_id'})
    setMsg(error ? error.message : 'Relevés enregistrés.')
  }

  const generateBills = async () => {
    const prev = periods.find(p => p.month < period.month)
    const {data: readings} = await supabase.from('readings').select('*').eq('period_id', pid)
    const share = prev?.residual > 0 ? Math.round(prev.residual / tenants.length) : 0
    const rows = []
    for (const t of tenants) {
      const reading = readings.find(r => r.tenant_id === t.id); if (!reading) continue
      let prevBill = null, prevPayments = []
      if (prev) {
        const {data: pb} = await supabase.from('bills').select('*').eq('period_id', prev.id).eq('tenant_id', t.id).maybeSingle()
        prevBill = pb
        if (pb) prevPayments = (await supabase.from('payments').select('*').eq('bill_id', pb.id)).data || []
      }
      rows.push({period_id: pid, tenant_id: t.id, ...buildBill({reading, price: period.kwh_price, residualShare: share, prevBill, prevPayments, distributedOn: dist})})
    }
    const {error} = await supabase.from('bills').upsert(rows, {onConflict: 'period_id,tenant_id'})
    await supabase.from('periods').update({distributed_on: dist}).eq('id', pid)
    setMsg(error ? error.message : 'Factures générées.'); loadPeriod()
  }

  const saveMain = async () => {
    const residual = residualOf(+main.main_amount, bills)
    await supabase.from('periods').update({main_index: +main.main_index, main_amount: +main.main_amount, residual}).eq('id', pid)
    await supabase.from('emergency_fund').delete().eq('period_id', pid)
    const {toFund} = splitResidual(residual)
    if (toFund > 0) await supabase.from('emergency_fund').insert({period_id: pid, amount: toFund})
    setMsg(`Résidu : ${fcfa(residual)}` + (residual < 0 ? ' (versé au fonds d\'urgence)' : ' (partagé le mois suivant)')); loadBase()
  }

  const bilanPdf = async () => {
    const [r, b] = await Promise.all([supabase.from('readings').select('*').eq('period_id', pid),
      supabase.from('bills').select('*, tenants(name), payments(*)').eq('period_id', pid)])
    monthReportPdf({period, readings: r.data || [], bills: b.data || []})
  }

  return <section>
    <h3>Mois</h3>
    <p className="noprint"><select value={pid} onChange={e => setPid(e.target.value)}><option value="">Choisir un mois</option>
      {periods.map(p => <option key={p.id} value={p.id}>{p.month.slice(0, 7)}</option>)}</select>{' '}
      <input type="month" value={np.month} onChange={e => setNp({...np, month: e.target.value})} />{' '}
      <input type="number" placeholder="Prix du kWh" value={np.kwh_price} onChange={e => setNp({...np, kwh_price: e.target.value})} />{' '}
      <button onClick={createPeriod}>Nouveau mois</button></p>
    <p className="msg">{msg}</p>
    {period && <>
      <h4>1. Relevés (prix du kWh : {fcfa(period.kwh_price)})</h4>
      <table><thead><tr><th>Locataire</th><th>Index précédent</th><th>Index actuel</th></tr></thead><tbody>
        {tenants.map(t => <tr key={t.id}><td>{t.name}</td>
          <td><input type="number" value={idx[t.id]?.prev ?? ''} onChange={e => setIdx({...idx, [t.id]: {...idx[t.id], prev: e.target.value}})} /></td>
          <td><input type="number" value={idx[t.id]?.curr ?? ''} onChange={e => setIdx({...idx, [t.id]: {...idx[t.id], curr: e.target.value}})} /></td></tr>)}</tbody></table>
      <p className="noprint"><button onClick={saveReadings}>Enregistrer les relevés</button></p>
      <h4>2. Factures</h4>
      <p className="noprint">Date de distribution <input type="date" value={dist} onChange={e => setDist(e.target.value)} />{' '}
        <button onClick={generateBills}>Générer les factures</button>{' '}<button className="alt" onClick={() => window.print()}>Imprimer</button></p>
      {bills.map(b => <div className="bill" key={b.id}><b>{b.tenants?.name}</b> — {period.month.slice(0, 7)}<br />
        Consommation : {b.consumption} kWh = {fcfa(b.conso_amount)}<br />
        Part du résidu : {fcfa(b.residual_share)}<br />
        {b.carry > 0 ? 'Dette précédente' : 'Crédit précédent'} : {fcfa(Math.abs(b.carry))}<br />
        {b.penalty > 0 && <>Pénalité de retard : {fcfa(b.penalty)}<br /></>}
        <b>Total à payer : {fcfa(b.total)}</b> avant le {b.due_on}</div>)}
      <h4 className="noprint">3. Facture générale du fournisseur</h4>
      <p className="noprint"><input type="number" placeholder="Index compteur principal" value={main.main_index} onChange={e => setMain({...main, main_index: e.target.value})} />{' '}
        <input type="number" placeholder="Montant total" value={main.main_amount} onChange={e => setMain({...main, main_amount: e.target.value})} />{' '}
        <button onClick={saveMain}>Calculer le résidu</button></p>
      <p className="noprint"><button className="alt" onClick={bilanPdf}>Bilan du mois (PDF)</button></p></>}
  </section>
}
