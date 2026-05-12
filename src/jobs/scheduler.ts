import cron, { type ScheduledTask } from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { runSpecialExpenseReminders } from './special-expense-reminders.job.js'
import { runDailyReminders } from './daily-reminders.job.js'

function isDbUnreachable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('DatabaseNotReachable') || msg.includes("Can't reach database")
}

function logCronError(job: string, err: unknown) {
  if (isDbUnreachable(err)) {
    console.warn(`  [cron] ${job}: base de données inaccessible, nouvelle tentative à la prochaine exécution`)
  } else {
    console.error(`  [cron] ${job} error:`, err instanceof Error ? err.message : err)
  }
}

export function startScheduler(prisma: PrismaClient) {
  const jobs: ScheduledTask[] = []

  // ─── Rappels dépenses spéciales ───────────────────────────────────────────
  // Tourne chaque jour à 7h00
  // Vérifie les dépenses spéciales dont la date approche (selon remindDaysBefore)
  jobs.push(
    cron.schedule('0 7 * * *', () => {
      runSpecialExpenseReminders(prisma).catch((err) => logCronError('special-expense-reminders', err))
    }, { timezone: 'Africa/Abidjan' }),
  )

  // ─── Rappels quotidiens (enregistrer les dépenses) ────────────────────────
  // Tourne chaque minute, compare l'heure avec les préférences de chaque user
  // Léger : ne requête la DB que si l'heure correspond à un horaire de rappel connu
  jobs.push(
    cron.schedule('* * * * *', () => {
      runDailyReminders(prisma).catch((err) => logCronError('daily-reminders', err))
    }, { timezone: 'Africa/Abidjan' }),
  )

  console.log('  [cron] Scheduler démarré — 2 job(s) actif(s)')
  console.log('         • Rappels dépenses spéciales : chaque jour à 07h00')
  console.log('         • Rappels quotidiens         : chaque minute (selon préférences user)\n')

  // Retourne une fonction pour arrêter tous les jobs proprement
  return () => jobs.forEach((j) => j.stop())
}
