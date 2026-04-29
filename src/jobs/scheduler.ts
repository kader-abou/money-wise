import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { runSpecialExpenseReminders } from './special-expense-reminders.job.js'
import { runDailyReminders } from './daily-reminders.job.js'

export function startScheduler(prisma: PrismaClient) {
  const jobs: cron.ScheduledTask[] = []

  // ─── Rappels dépenses spéciales ───────────────────────────────────────────
  // Tourne chaque jour à 7h00
  // Vérifie les dépenses spéciales dont la date approche (selon remindDaysBefore)
  jobs.push(
    cron.schedule('0 7 * * *', () => {
      runSpecialExpenseReminders(prisma).catch((err) =>
        console.error('[cron] special-expense-reminders error:', err),
      )
    }, { timezone: 'Africa/Abidjan' }),
  )

  // ─── Rappels quotidiens (enregistrer les dépenses) ────────────────────────
  // Tourne chaque minute, compare l'heure avec les préférences de chaque user
  // Léger : ne requête la DB que si l'heure correspond à un horaire de rappel connu
  jobs.push(
    cron.schedule('* * * * *', () => {
      runDailyReminders(prisma).catch((err) =>
        console.error('[cron] daily-reminders error:', err),
      )
    }, { timezone: 'Africa/Abidjan' }),
  )

  console.log('  [cron] Scheduler démarré — 2 job(s) actif(s)')
  console.log('         • Rappels dépenses spéciales : chaque jour à 07h00')
  console.log('         • Rappels quotidiens         : chaque minute (selon préférences user)\n')

  // Retourne une fonction pour arrêter tous les jobs proprement
  return () => jobs.forEach((j) => j.stop())
}
