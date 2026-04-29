import { PrismaClient } from '@prisma/client'
import { fail } from '../../utils/response.js'

export class NotificationsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Retourne toutes les notifications d'un utilisateur, triées de la plus récente à la plus ancienne.
   * @param unreadOnly - Si true, retourne uniquement les notifications non lues
   */
  async findAll(userId: string, unreadOnly?: boolean) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { sentAt: 'desc' },
    })
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
