import {jsPDF} from 'jspdf'
import autoTable from 'jspdf-autotable'
import {PENALTY, wasLate} from './billing'

const f = n => Math.round(n || 0).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ') + ' FCFA'
const paidOf = b => (b.payments || []).reduce((s, p) => s + p.amount, 0)

// Reçu individuel d'un locataire pour un mois
export function receiptPdf({bill, period, nb}) {
  const d = new jsPDF()
  const pays = [...bill.payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on))
  const paid = paidOf(bill), rest = bill.total - paid
  const month = period.month.slice(0, 7)
  d.setFontSize(16); d.text('Reçu de paiement', 14, 20)
  d.setFontSize(11)
  d.text(`Locataire : ${bill.tenants.name}`, 14, 32)
  d.text(`Mois : ${month}`, 14, 39)
  d.text(`Échéance : ${bill.due_on}`, 14, 46)
  autoTable(d, {startY: 54, head: [['Date', 'Montant payé']], body: pays.map(p => [p.paid_on, f(p.amount)])})
  autoTable(d, {startY: d.lastAutoTable.finalY + 8, theme: 'plain', body: [
    ['Total facturé', f(bill.total)], ['Total payé', f(paid)],
    [rest > 0 ? 'Reste dû' : rest < 0 ? 'Crédit reporté' : 'Solde', f(Math.abs(rest))]]})
  const notes = []
  if (rest > 0) notes.push(`Ce reste de ${f(rest)} sera ajouté à la facture du mois suivant.`)
  if (rest < 0) notes.push(`Ce crédit de ${f(-rest)} sera déduit de la facture du mois suivant.`)
  if (bill.total > 0 && wasLate(bill, pays)) notes.push(`Paiement après l'échéance : une pénalité de ${f(PENALTY)} sera ajoutée le mois suivant.`)
  if (period.residual > 0 && nb) notes.push(`Part du résidu du compteur général : ${f(period.residual / nb)}, à ajouter le mois suivant.`)
  let y = d.lastAutoTable.finalY + 10
  notes.forEach(t => { d.text(d.splitTextToSize(t, 180), 14, y); y += 10 })
  d.save(`recu-${bill.tenants.name.replace(/\s+/g, '-')}-${month}.pdf`)
}

// Bilan du mois pour le propriétaire
export function monthReportPdf({period, readings, bills}) {
  const d = new jsPDF({orientation: 'landscape'})
  const month = period.month.slice(0, 7)
  const rd = id => readings.find(r => r.tenant_id === id)
  const sum = fn => bills.reduce((s, b) => s + fn(b), 0)
  d.setFontSize(16); d.text(`Bilan du mois ${month}`, 14, 18)
  d.setFontSize(10); d.text(`Prix du kWh : ${f(period.kwh_price)}`, 14, 26)
  autoTable(d, {startY: 32, styles: {fontSize: 8},
    head: [['Locataire', 'Index préc.', 'Index act.', 'kWh', 'Conso', 'Part résidu', 'Report', 'Pénalité', 'Total', 'Payé', 'Reste']],
    body: bills.map(b => [b.tenants.name, rd(b.tenant_id)?.prev_index, rd(b.tenant_id)?.curr_index, b.consumption, f(b.conso_amount),
      f(b.residual_share), f(b.carry), f(b.penalty), f(b.total), f(paidOf(b)), f(b.total - paidOf(b))]),
    foot: [['Total', '', '', sum(b => b.consumption), f(sum(b => b.conso_amount)), f(sum(b => b.residual_share)), f(sum(b => b.carry)),
      f(sum(b => b.penalty)), f(sum(b => b.total)), f(sum(paidOf)), f(sum(b => b.total - paidOf(b)))]]})
  autoTable(d, {startY: d.lastAutoTable.finalY + 8, theme: 'plain', styles: {fontSize: 10}, body: [
    ['Index compteur principal', period.main_index ?? 'non saisi'],
    ['Facture générale', period.main_amount != null ? f(period.main_amount) : 'non saisie'],
    ['Somme des sous-factures (conso)', f(sum(b => b.conso_amount))],
    ['Résidu à partager le mois suivant', period.residual > 0 ? f(period.residual) : 'Aucun'],
    ['Total encaissé', f(sum(paidOf))]]})
  d.save(`bilan-${month}.pdf`)
}
