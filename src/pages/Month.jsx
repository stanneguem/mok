import {useEffect, useState} from 'react'
import {supabase, fcfa} from '../supabase'
import {buildBill, distributeResidual, localISODate, residualOf, splitResidual} from '../billing'
import {monthReportPdf} from '../pdf'

export default function Month() {
  const [periods, setPeriods] = useState([]), [pid, setPid] = useState(''), [tenants, setTenants] = useState([])
  const [idx, setIdx] = useState({}), [bills, setBills] = useState([]), [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [np, setNp] = useState({month: '', kwh_price: ''}), [main, setMain] = useState({main_index: '', main_amount: ''})
  const [dist, setDist] = useState(localISODate())
  const period = periods.find(p => p.id === pid)

  const loadBase = async () => {
    const [p, t] = await Promise.all([
      supabase.from('periods').select('*').order('month', {ascending: false}),
      supabase.from('tenants').select('*').eq('active', true).order('name')
    ])
    if (p.error || t.error) {
      setMsg(p.error?.message || t.error?.message || 'Impossible de charger les données.')
      return
    }
    setPeriods(p.data || [])
    setTenants(t.data || [])
  }
  useEffect(() => { loadBase() }, [])

  const loadPeriod = async () => {
    if (!period) { setBills([]); return }
    const previous = periods.find(p => p.month < period.month)
    const [currentReadings, previousReadings, currentBills] = await Promise.all([
      supabase.from('readings').select('*').eq('period_id', pid),
      previous ? supabase.from('readings').select('*').eq('period_id', previous.id) : Promise.resolve({data: [], error: null}),
      supabase.from('bills').select('*, tenants(name)').eq('period_id', pid)
    ])
    const error = currentReadings.error || previousReadings.error || currentBills.error
    if (error) { setMsg(error.message); return }
    const values = {}
    tenants.forEach(tenant => {
      const current = (currentReadings.data || []).find(row => row.tenant_id === tenant.id)
      const old = (previousReadings.data || []).find(row => row.tenant_id === tenant.id)
      values[tenant.id] = {
        prev: current?.prev_index ?? old?.curr_index ?? 0,
        curr: current?.curr_index ?? ''
      }
    })
    setIdx(values)
    setBills(currentBills.data || [])
    setMain({main_index: period.main_index ?? '', main_amount: period.main_amount ?? ''})
    if (period.distributed_on) setDist(period.distributed_on)
  }
  useEffect(() => { loadPeriod() }, [pid, tenants.length, periods.length])

  const createPeriod = async () => {
    const price = Number(np.kwh_price)
    if (!/^\d{4}-\d{2}$/.test(np.month) || !Number.isFinite(price) || price < 0) {
      setMsg('Choisis un mois valide et un prix du kWh positif ou nul.')
      return
    }
    setBusy(true)
    const {data, error} = await supabase.from('periods')
      .insert({month: np.month + '-01', kwh_price: price}).select().single()
    setBusy(false)
    if (error) { setMsg(error.message); return }
    await loadBase()
    setPid(data.id)
    setMsg('Période créée.')
  }

  const saveReadings = async () => {
    if (!pid) return setMsg('Choisis une période.')
    const rows = tenants.filter(t => idx[t.id]?.curr !== '').map(t => ({
      period_id: pid, tenant_id: t.id,
      prev_index: Number(idx[t.id].prev), curr_index: Number(idx[t.id].curr)
    }))
    if (!rows.length) return setMsg('Aucun relevé à enregistrer.')
    const bad = rows.find(r => !Number.isFinite(r.prev_index) || !Number.isFinite(r.curr_index) ||
      r.prev_index < 0 || r.curr_index < r.prev_index)
    if (bad) return setMsg('Chaque index doit être positif ou nul et l’index actuel ne peut pas être inférieur au précédent.')
    setBusy(true)
    const {error} = await supabase.from('readings').upsert(rows, {onConflict: 'period_id,tenant_id'})
    setBusy(false)
    setMsg(error ? error.message : 'Relevés enregistrés.')
    if (!error) await loadPeriod()
  }

  const generateBills = async () => {
    if (!period) return setMsg('Choisis une période.')
    if (!tenants.length) return setMsg('Ajoute au moins un locataire actif avant de générer les factures.')
    setBusy(true)
    try {
      const previous = periods.filter(p => p.month < period.month).sort((a, b) => b.month.localeCompare(a.month))[0]
      const [readingResult, existingResult] = await Promise.all([
        supabase.from('readings').select('*').eq('period_id', pid),
        supabase.from('bills').select('id,tenant_id,payments(id)').eq('period_id', pid)
      ])
      if (readingResult.error) throw readingResult.error
      if (existingResult.error) throw existingResult.error
      const readings = readingResult.data || []
      const missing = tenants.filter(t => !readings.some(r => r.tenant_id === t.id))
      if (missing.length) throw new Error(`Il manque le relevé de : ${missing.map(t => t.name).join(', ')}.`)

      const shares = previous?.residual > 0 ? distributeResidual(previous.residual, tenants.length) : tenants.map(() => 0)
      const rows = []
      let protectedCount = 0
      for (let i = 0; i < tenants.length; i++) {
        const tenant = tenants[i]
        const existing = (existingResult.data || []).find(b => b.tenant_id === tenant.id)
        if (existing?.payments?.length) { protectedCount++; continue }
        let previousBill = null, previousPayments = []
        if (previous) {
          const {data: oldBill, error: oldBillError} = await supabase.from('bills')
            .select('*').eq('period_id', previous.id).eq('tenant_id', tenant.id).maybeSingle()
          if (oldBillError) throw oldBillError
          previousBill = oldBill
          if (oldBill) {
            const {data, error} = await supabase.from('payments').select('*').eq('bill_id', oldBill.id)
            if (error) throw error
            previousPayments = data || []
          }
        }
        rows.push({
          period_id: pid, tenant_id: tenant.id,
          ...buildBill({
            reading: readings.find(r => r.tenant_id === tenant.id),
            price: period.kwh_price, residualShare: shares[i],
            prevBill: previousBill, prevPayments: previousPayments,
            distributedOn: dist
          })
        })
      }
      if (rows.length) {
        const {error} = await supabase.from('bills').upsert(rows, {onConflict: 'period_id,tenant_id'})
        if (error) throw error
      }
      const {error: periodError} = await supabase.from('periods').update({distributed_on: dist}).eq('id', pid)
      if (periodError) throw periodError
      await loadPeriod()
      setMsg(`Factures générées. ${protectedCount ? `${protectedCount} facture(s) déjà payée(s) ont été conservées sans modification.` : ''}`)
    } catch (error) {
      setMsg(error.message || 'Une erreur est survenue pendant la génération.')
    } finally {
      setBusy(false)
    }
  }

  const saveMain = async () => {
    if (!period || !bills.length) return setMsg('Génère les factures avant de calculer le résidu.')
    const mainIndex = Number(main.main_index), mainAmount = Number(main.main_amount)
    if (!Number.isFinite(mainIndex) || mainIndex < 0 || !Number.isFinite(mainAmount) || mainAmount < 0)
      return setMsg('L’index et le montant de la facture générale doivent être positifs ou nuls.')
    const residual = residualOf(mainAmount, bills)
    const {toFund} = splitResidual(residual)
    setBusy(true)
    const {error} = await supabase.rpc('save_mok_period_main_details', {
      p_period_id: pid, p_main_index: mainIndex, p_main_amount: mainAmount,
      p_residual: residual, p_fund_amount: toFund
    })
    setBusy(false)
    if (error) return setMsg(error.message)
    setPeriods(current => current.map(p => p.id === pid
      ? {...p, main_index: mainIndex, main_amount: mainAmount, residual} : p))
    setMsg(`Résidu : ${fcfa(residual)}${residual < 0 ? ' (versé au fonds d’urgence)' : ' (partagé le mois suivant)'}`)
  }

  const bilanPdf = async () => {
    if (!period) return
    const [r, b] = await Promise.all([
      supabase.from('readings').select('*').eq('period_id', pid),
      supabase.from('bills').select('*, tenants(name), payments(*)').eq('period_id', pid)
    ])
    if (r.error || b.error) return setMsg(r.error?.message || b.error?.message)
    monthReportPdf({period, readings: r.data || [], bills: b.data || []})
  }

  return <section>
    <h3>Mois</h3>
    <p className="noprint">
      <select value={pid} onChange={e => setPid(e.target.value)}><option value="">Choisir un mois</option>
        {periods.map(p => <option key={p.id} value={p.id}>{p.month.slice(0, 7)}</option>)}</select>{' '}
      <input type="month" value={np.month} onChange={e => setNp({...np, month: e.target.value})} />{' '}
      <input type="number" min="0" step="1" placeholder="Prix du kWh" value={np.kwh_price}
        onChange={e => setNp({...np, kwh_price: e.target.value})} />{' '}
      <button disabled={busy} onClick={createPeriod}>Nouveau mois</button>
    </p>
    <p className="msg" role="status">{msg}</p>
    {period && <>
      <h4>1. Relevés (prix du kWh : {fcfa(period.kwh_price)})</h4>
      <table><thead><tr><th>Locataire</th><th>Index précédent</th><th>Index actuel</th></tr></thead><tbody>
        {tenants.map(t => <tr key={t.id}><td>{t.name}</td>
          <td><input type="number" min="0" step="1" value={idx[t.id]?.prev ?? ''}
            onChange={e => setIdx({...idx, [t.id]: {...idx[t.id], prev: e.target.value}})} /></td>
          <td><input type="number" min="0" step="1" value={idx[t.id]?.curr ?? ''}
            onChange={e => setIdx({...idx, [t.id]: {...idx[t.id], curr: e.target.value}})} /></td></tr>)}</tbody></table>
      <p className="noprint"><button disabled={busy} onClick={saveReadings}>Enregistrer les relevés</button></p>
      <h4>2. Factures</h4>
      <p className="noprint">Date de distribution <input type="date" value={dist} onChange={e => setDist(e.target.value)} />{' '}
        <button disabled={busy} onClick={generateBills}>Générer les factures</button>{' '}
        <button className="alt" onClick={() => window.print()}>Imprimer</button></p>
      {bills.map(b => <div className="bill" key={b.id}><b>{b.tenants?.name}</b> — {period.month.slice(0, 7)}<br />
        Consommation : {b.consumption} kWh = {fcfa(b.conso_amount)}<br />
        Part du résidu : {fcfa(b.residual_share)}<br />
        {b.carry > 0 ? 'Dette précédente' : 'Crédit précédent'} : {fcfa(Math.abs(b.carry))}<br />
        {b.penalty > 0 && <>Pénalité de retard : {fcfa(b.penalty)}<br /></>}
        <b>Total à payer : {fcfa(b.total)}</b> avant le {b.due_on}</div>)}
      <h4 className="noprint">3. Facture générale du fournisseur</h4>
      <p className="noprint">
        <input type="number" min="0" step="1" placeholder="Index compteur principal" value={main.main_index}
          onChange={e => setMain({...main, main_index: e.target.value})} />{' '}
        <input type="number" min="0" step="1" placeholder="Montant total" value={main.main_amount}
          onChange={e => setMain({...main, main_amount: e.target.value})} />{' '}
        <button disabled={busy} onClick={saveMain}>Calculer le résidu</button>
      </p>
      <p className="noprint"><button className="alt" onClick={bilanPdf}>Bilan du mois (PDF)</button></p>
    </>}
  </section>
}
