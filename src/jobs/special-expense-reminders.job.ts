import { PrismaClient } from '@prisma/client'

/**
 * Vérifie chaque jour à 7h00 les dépenses spéciales à venir.
 * Pour chaque dépense dont le nombre de jours restants est dans `remindDaysBefore`,
 * crée une notification en base de données.
 *
 * Exemple : remindDaysBefore = [7, 3, 1]
 *   → notif envoyée J-7, J-3 et J-1 avant la date prévue
 */
export async function runSpecialExpenseReminders(prisma: PrismaClient) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const pendingExpenses = await prisma.specialExpense.findMany({
    where: { isCompleted: false, scheduledDate: { gte: today } },
  })

  if (pendingExpenses.length === 0) return

  const notifications: { userId: string; title: string; body: string; type: string; data?: any }[] = []

  for (const expense of pendingExpenses) {
    const scheduled = new Date(expense.scheduledDate)
    scheduled.setHours(0, 0, 0, 0)
    const daysUntil = Math.round((scheduled.getTime() - today.getTime()) / 86400000)

    if (!expense.remindDaysBefore.includes(daysUntil)) continue

    const dateStr = scheduled.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    const amount = Number(expense.estimatedAmount).toLocaleString('fr-FR')

    notifications.push({
      userId: expense.userId,
      title: `📅 Rappel : ${expense.name}`,
      body: daysUntil === 1
        ? `Demain — ${amount} FCFA à prévoir pour "${expense.name}"`
        : `Dans ${daysUntil} jours (${dateStr}) — ${amount} FCFA à prévoir`,
      type: 'reminder',
      data: {
        specialExpenseId: expense.id,
        daysUntil,
        amount: Number(expense.estimatedAmount),
        scheduledDate: expense.scheduledDate.toISOString(),
      },
    })
  }

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications })
    console.log(`  [cron] special-expenses → ${notifications.length} rappel(s) créé(s)`)
  }
}
