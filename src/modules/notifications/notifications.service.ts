import { PrismaClient } from '@prisma/client'
import { fail } from '../../utils/response.js'

export class NotificationsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Retourne les notifications d'un utilisateur paginées, triées de la plus récente à la plus ancienne.
   * @param unreadOnly - Si true, retourne uniquement les notifications non lues
   */
  async findAll(userId: string, unreadOnly?: boolean, page = 1, limit = 20) {
    const where = { userId, ...(unreadOnly ? { isRead: false } : {}) }
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
   * @throws 404 si la notification n'existe pas ou n'appartient pas à l'utilisateur
   */
  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } })
    if (!notification) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Notification introuvable') }
    }
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } })
  }

  /**
   * Marque toutes les notifications non lues d'un utilisateur comme lues en une seule opération.
   * @returns Le nombre de notifications mises à jour
   */
  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    })
    return { updated: result.count }
  }

  /**
   * Supprime une notification.
   * @throws 404 si la notification n'existe pas ou n'appartient pas à l'utilisateur
   */
  async delete(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } })
    if (!notification) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Notification introuvable') }
    }
    await this.prisma.notification.delete({ where: { id } })
  }

  /**
   * Retourne le nombre de notifications non lues.
   * Utilisé pour afficher le badge dans l'app mobile.
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } })
    return { count }
  }

  /**
   * Crée une notification de rappel en base de données.
   * Appelé par le cron des rappels (12h / 20h40 / 8h30) et les alertes budget.
   * @param type - reminder | alert | advice | goal
   */
  async createReminder(userId: string, title: string, body: string, data?: Record<string, unknown>) {
    return this.prisma.notification.create({
      data: {
        userId,
        title,
        body,
        type: 'reminder',
        data: data ? JSON.parse(JSON.stringify(data)) : undefined,
      },
    })
  }
}
