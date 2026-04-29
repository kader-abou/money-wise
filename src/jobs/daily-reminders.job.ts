import { PrismaClient } from '@prisma/client'

/**
 * Tourne chaque minute. Compare l'heure courante (HH:mm) avec les 3 horaires
 * de rappel configurés par chaque utilisateur.
 *
 * Si correspondance → crée une notification "log tes dépenses" en base.
 *
 * Horaires par défaut : 08:30 | 12:00 | 20:40
 * L'utilisateur peut les personnaliser via PATCH /auth/me
 */
export async function runDailyReminders(prisma: PrismaClient) {
  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const users = await prisma.user.findMany({
    where: {
      reminderEnabled: true,
      OR: [
        { reminder1Time: currentTime },
        { reminder2Time: currentTime },
        { reminder3Time: currentTime },
      ],
    },
    select: { id: true },
  })

  if (users.length === 0) return

  const messages = [
    { title: '💰 Tes dépenses du jour', body: 'Prends 30 secondes pour enregistrer ce que tu as dépensé aujourd\'hui.' },
    { title: '📊 Mise à jour du budget', body: 'N\'oublie pas d\'enregistrer tes dépenses pour rester dans ton budget.' },
    { title: '💡 Suivi financier', body: 'Quelques secondes pour noter tes dépenses — garde le contrôle de tes finances !' },
  ]

  const msg = messages[now.getHours() < 12 ? 0 : now.getHours() < 17 ? 1 : 2]

  await prisma.notification.createMany({
    data: users.map(({ id }) => ({
      userId: id,
      title: msg.title,
      body: msg.body,
      type: 'reminder',
    })),
  })

  console.log(`  [cron] daily-reminders (${currentTime}) → ${users.length} utilisateur(s) notifié(s)`)
}
