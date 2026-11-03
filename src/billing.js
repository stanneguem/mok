// Règles métier MOK — montants en FCFA entiers.
export const PENALTY = 4100, DUE_DAYS = 7, GRACE_DAYS = 1

export const localISODate = (date = new Date()) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const addDays = (date, days) => {
  const d = new Date(`${String(date).slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d
}
const iso = date => localISODate(date)

// Résidu = facture générale - somme des sous-factures de consommation.
export const residualOf = (mainAmount, bills) =>
  Math.round(Number(mainAmount) - bills.reduce((sum, bill) => sum + Number(bill.conso_amount || 0), 0))

// Positif -> partagé le mois suivant ; négatif -> fonds d'urgence.
export const splitResidual = residual => residual >= 0
  ? {toShare: residual, toFund: 0}
  : {toShare: 0, toFund: -residual}

// Répartit chaque FCFA sans perte d'arrondi.
export function distributeResidual(residual, count) {
  if (!Number.isInteger(count) || count <= 0) return []
  const amount = Math.max(0, Math.trunc(Number(residual) || 0))
  const base = Math.floor(amount / count)
  const remainder = amount % count
  return Array.from({length: count}, (_, index) => base + (index < remainder ? 1 : 0))
}

// Paiement du mois précédent en retard ? (échéance + un jour de grâce).
export function wasLate(prevBill, prevPayments = [], today = new Date()) {
  const limit = addDays(prevBill.due_on, GRACE_DAYS)
  let sum = 0
  for (const payment of [...prevPayments].sort((a, b) => a.paid_on.localeCompare(b.paid_on))) {
    sum += Number(payment.amount || 0)
    if (sum >= Number(prevBill.total || 0)) return new Date(`${payment.paid_on}T12:00:00`) > limit
  }
  return new Date(today) > limit
}

export function buildBill({reading, price, residualShare, prevBill, prevPayments = [], distributedOn}) {
  const previousIndex = Number(reading.prev_index)
  const currentIndex = Number(reading.curr_index)
  const consumption = currentIndex - previousIndex
  const conso_amount = Math.round(consumption * Number(price))
  const paid = prevPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const carry = prevBill ? Number(prevBill.total) - paid : 0 // dette > 0, crédit < 0
  const penalty = prevBill && Number(prevBill.total) > 0 && wasLate(prevBill, prevPayments) ? PENALTY : 0
  const total = conso_amount + Number(residualShare) + carry + penalty
  return {
    consumption, conso_amount, residual_share: Number(residualShare),
    carry, penalty, total, due_on: iso(addDays(distributedOn, DUE_DAYS))
  }
}
