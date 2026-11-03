import {jsPDF} from 'jspdf'
import autoTable from 'jspdf-autotable'
import {PENALTY} from './billing'

const f = amount => Math.round(Number(amount) || 0).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ') + ' FCFA'
const paidOf = bill => (bill.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

// Reçu individuel d'un locataire pour un mois.
export function receiptPdf({bill, period, nb}) {
  if (!bill || !period) throw new Error('Facture ou période manquante pour générer le reçu.')
  const doc = new jsPDF()
  const payments = [...(bill.payments || [])].sort((a, b) => a.paid_on.localeCompare(b.paid_on))
  const paid = paidOf(bill), rest = Number(bill.total) - paid
  const month = period.month.slice(0, 7)
  doc.setFontSize(16); doc.text('Reçu de paiement', 14, 20)
  doc.setFontSize(11)
  doc.text(`Locataire : ${bill.tenants?.name || 'Locataire'}`, 14, 32)
  doc.text(`Mois : ${month}`, 14, 39)
  doc.text(`Échéance : ${bill.due_on || 'Non définie'}`, 14, 46)
  autoTable(doc, {startY: 54, head: [['Date', 'Montant payé']], body: payments.map(p => [p.paid_on, f(p.amount)])})
  autoTable(doc, {startY: doc.lastAutoTable.finalY + 8, theme: 'plain', body: [
    ['Total facturé', f(bill.total)], ['Total payé', f(paid)],
    [rest > 0 ? 'Reste dû' : rest < 0 ? 'Crédit reporté' : 'Solde', f(Math.abs(rest))]
  ]})
  const notes = []
  if (rest > 0) notes.push(`Ce reste de ${f(rest)} sera ajouté à la facture du mois suivant.`)
  if (rest < 0) notes.push(`Ce crédit de ${f(-rest)} sera déduit de la facture du mois suivant.`)
  if (Number(bill.penalty) > 0) notes.push(`Une pénalité de retard de ${f(bill.penalty)} est incluse dans cette facture.`)
  if (Number(period.residual) > 0 && nb) notes.push(`Part du résidu du compteur général : ${f(Math.round(period.residual / nb))}, à ajouter le mois suivant.`)
  let y = doc.lastAutoTable.finalY + 10
  notes.forEach(note => { doc.text(doc.splitTextToSize(note, 180), 14, y); y += 10 })
  doc.save(`recu-${(bill.tenants?.name || 'locataire').replace(/\s+/g, '-')}-${month}.pdf`)
}

// Bilan du mois pour le propriétaire.
export function monthReportPdf({period, readings, bills}) {
  if (!period) throw new Error('Période manquante pour générer le bilan.')
  const doc = new jsPDF({orientation: 'landscape'})
  const month = period.month.slice(0, 7)
  const readingFor = id => readings.find(reading => reading.tenant_id === id)
  const sum = selector => bills.reduce((total, bill) => total + selector(bill), 0)
  doc.setFontSize(16); doc.text(`Bilan du mois ${month}`, 14, 18)
  doc.setFontSize(10); doc.text(`Prix du kWh : ${f(period.kwh_price)}`, 14, 26)
  autoTable(doc, {startY: 32, styles: {fontSize: 8},
    head: [['Locataire', 'Index préc.', 'Index act.', 'kWh', 'Conso', 'Part résidu', 'Report', 'Pénalité', 'Total', 'Payé', 'Reste']],
    body: bills.map(bill => [bill.tenants?.name || 'Locataire', readingFor(bill.tenant_id)?.prev_index,
      readingFor(bill.tenant_id)?.curr_index, bill.consumption, f(bill.conso_amount),
      f(bill.residual_share), f(bill.carry), f(bill.penalty), f(bill.total), f(paidOf(bill)),
      f(Number(bill.total) - paidOf(bill))]),
    foot: [['Total', '', '', sum(b => Number(b.consumption) || 0), f(sum(b => Number(b.conso_amount) || 0)),
      f(sum(b => Number(b.residual_share) || 0)), f(sum(b => Number(b.carry) || 0)),
      f(sum(b => Number(b.penalty) || 0)), f(sum(b => Number(b.total) || 0)),
      f(sum(paidOf)), f(sum(b => Number(b.total) - paidOf(b)))]]
  })
  autoTable(doc, {startY: doc.lastAutoTable.finalY + 8, theme: 'plain', styles: {fontSize: 10}, body: [
    ['Index compteur principal', period.main_index ?? 'non saisi'],
    ['Facture générale', period.main_amount != null ? f(period.main_amount) : 'non saisie'],
    ['Somme des sous-factures (conso)', f(sum(b => Number(b.conso_amount) || 0))],
    ['Résidu à partager le mois suivant', period.residual > 0 ? f(period.residual) : 'Aucun'],
    ['Total encaissé', f(sum(paidOf))]
  ]})
  doc.save(`bilan-${month}.pdf`)
}
