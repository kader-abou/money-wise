import { PrismaClient } from '@prisma/client'
import { fail } from '../../utils/response.js'
import { sendPush } from '../../utils/firebase.js'

export class NotificationsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Retourne les notifications non supprimées d'un utilisateur, paginées et triées par date décroissante.
   *
   * @param userId    - UUID de l'utilisateur connecté
   * @param unreadOnly - Si true, retourne uniquement les notifications non lues
   * @param page      - Numéro de page (défaut : 1)
   * @param limit     - Nombre de notifications par page (défaut : 20)
   */
  async findAll(userId: string, unreadOnly?: boolean, page = 1, limit = 20) {
    const where = {
      userId,
      deletedAt: null,
      ...(unreadOnly ? { isRead: false } : {}),
    }
    const skip = (page - 1) * limit

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ])

    return {
      notifications,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Marque une notification spécifique comme lue.
   *
   * @param userId - UUID de l'utilisateur connecté
   * @param id     - Identifiant de la notification
   * @throws 404 si la notification n'existe pas, est supprimée ou n'appartient pas à l'utilisateur
   */
  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId, deletedAt: null },
    })
    if (!notification) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Notification introuvable') }
    }
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } })
  }

  /**
   * Marque toutes les notifications non lues et non supprimées comme lues.
   *
   * @param userId - UUID de l'utilisateur connecté
   * @returns Le nombre de notifications mises à jour
   */
  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false, deletedAt: null },
      data: { isRead: true },
    })
    return { updated: result.count }
  }

  /**
   * Soft delete : marque la notification comme supprimée sans la retirer de la base.
   * Elle n'apparaît plus dans les listes mais reste consultable en base pour audit.
   *
   * @param userId - UUID de l'utilisateur connecté
   * @param id     - Identifiant de la notification
   * @throws 404 si la notification n'existe pas ou n'appartient pas à l'utilisateur
   */
  async delete(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId, deletedAt: null },
    })
    if (!notification) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Notification introuvable') }
    }
    await this.prisma.notification.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  /**
   * Retourne le nombre de notifications non lues et non supprimées.
   * Utilisé pour afficher le badge dans l'app mobile.
   *
   * @param userId - UUID de l'utilisateur connecté
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false, deletedAt: null },
    })
    return { count }
  }

  /**
   * Crée une notification en base et envoie un push Firebase si l'utilisateur a un fcmToken.
   * Utilisé par les cron jobs et les alertes budget générées lors de la création de dépenses.
   *
   * @param userId - UUID de l'utilisateur destinataire
   * @param title  - Titre de la notification
   * @param body   - Corps du message
   * @param data   - Données contextuelles optionnelles (ex: { expenseId, goalId })
   * @param type   - Type : reminder | alert | advice | goal (défaut : reminder)
   */
  async createReminder(userId: string, title: string, body: string, data?: Record<string, unknown>, type = 'reminder') {
    const [notification, user] = await Promise.all([
      this.prisma.notification.create({
        data: {
          userId,
          title,
          body,
          type,
          data: data ? JSON.parse(JSON.stringify(data)) : undefined,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true },
      }),
    ])

    if (user?.fcmToken) {
      const pushData = data
        ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
        : undefined
      await sendPush(user.fcmToken, title, body, pushData)
    }

    return notification
  }
}
