// Règles métier (montants en FCFA entiers)
export const PENALTY = 4100, DUE_DAYS = 7, GRACE_DAYS = 1
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const iso = d => new Date(d).toISOString().slice(0, 10)

// Résidu = facture générale - somme des sous-factures de consommation
export const residualOf = (mainAmount, bills) => Math.round(mainAmount - bills.reduce((s, b) => s + b.conso_amount, 0))
// Positif -> partagé le mois suivant ; négatif -> fonds d'urgence (non affiché aux locataires)
export const splitResidual = r => r >= 0 ? {toShare: r, toFund: 0} : {toShare: 0, toFund: -r}

// Paiement du mois précédent en retard ? (échéance + 1 jour de grâce)
export function wasLate(prevBill, prevPayments, today = new Date()) {
  const limit = addDays(prevBill.due_on, GRACE_DAYS)
  let sum = 0
  for (const p of [...prevPayments].sort((a, b) => a.paid_on.localeCompare(b.paid_on))) {
    sum += p.amount
    if (sum >= prevBill.total) return new Date(p.paid_on) > limit
  }
  return today > limit // pas soldé
}

export function buildBill({reading, price, residualShare, prevBill, prevPayments, distributedOn}) {
  const consumption = reading.curr_index - reading.prev_index
  const conso_amount = Math.round(consumption * price)
  const paid = (prevPayments || []).reduce((s, p) => s + p.amount, 0)
  const carry = prevBill ? prevBill.total - paid : 0 // >0 dette, <0 crédit
  const penalty = prevBill && prevBill.total > 0 && wasLate(prevBill, prevPayments) ? PENALTY : 0
  const total = conso_amount + residualShare + carry + penalty
  return {consumption, conso_amount, residual_share: residualShare, carry, penalty, total, due_on: iso(addDays(distributedOn, DUE_DAYS))}
}
