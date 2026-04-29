import { PrismaClient } from '@prisma/client'
import { CreateSpecialExpenseInput, UpdateSpecialExpenseInput, MarkCompletedInput } from './special-expenses.schema.js'
import { fail } from '../../utils/response.js'

export class SpecialExpensesService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Crée une dépense spéciale planifiée (fête, voyage, achat exceptionnel...).
   * Le tableau `remindDaysBefore` définit quand envoyer les rappels avant l'échéance.
   */
  async create(userId: string, input: CreateSpecialExpenseInput) {
    return this.prisma.specialExpense.create({
      data: {
        userId,
        name: input.name,
        estimatedAmount: input.estimatedAmount,
        scheduledDate: new Date(input.scheduledDate),
        remindDaysBefore: input.remindDaysBefore,
        note: input.note,
      },
    })
  }

  /**
   * Retourne toutes les dépenses spéciales d'un utilisateur, triées par date d'échéance.
   * @param completed - Si défini, filtre par statut complété/non complété
   */
  async findAll(userId: string, completed?: boolean) {
    return this.prisma.specialExpense.findMany({
      where: {
        userId,
        ...(completed !== undefined ? { isCompleted: completed } : {}),
      },
      orderBy: { scheduledDate: 'asc' },
    })
  }

  /**
   * Retourne une dépense spéciale par son ID.
   * @throws 404 si la dépense n'existe pas ou n'appartient pas à l'utilisateur
   */
  async findOne(userId: string, id: string) {
    const expense = await this.prisma.specialExpense.findFirst({ where: { id, userId } })
    if (!expense) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Dépense spéciale introuvable') }
    }
    return expense
  }

  /**
   * Met à jour les informations d'une dépense spéciale planifiée.
   * @throws 404 si la dépense n'existe pas ou n'appartient pas à l'utilisateur
   */
  async update(userId: string, id: string, input: UpdateSpecialExpenseInput) {
    const expense = await this.prisma.specialExpense.findFirst({ where: { id, userId } })
    if (!expense) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Dépense spéciale introuvable') }
    }

    return this.prisma.specialExpense.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.estimatedAmount !== undefined ? { estimatedAmount: input.estimatedAmount } : {}),
        ...(input.scheduledDate !== undefined ? { scheduledDate: new Date(input.scheduledDate) } : {}),
        ...(input.remindDaysBefore !== undefined ? { remindDaysBefore: input.remindDaysBefore } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    })
  }

  /**
   * Marque une dépense spéciale comme réalisée avec le montant réel dépensé.
   * Enregistre l'horodatage de complétion automatiquement.
   * @throws 404 si la dépense n'existe pas
   * @throws 409 si la dépense est déjà marquée comme complétée
   */
  async markCompleted(userId: string, id: string, input: MarkCompletedInput) {
    const expense = await this.prisma.specialExpense.findFirst({ where: { id, userId } })
    if (!expense) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Dépense spéciale introuvable') }
    }
    if (expense.isCompleted) {
      throw { statusCode: 409, ...fail('ALREADY_COMPLETED', 'Cette dépense spéciale est déjà marquée comme complétée') }
    }

    return this.prisma.specialExpense.update({
      where: { id },
      data: {
        isCompleted: true,
        completedAt: new Date(),
        ...(input.actualAmount !== undefined ? { actualAmount: input.actualAmount } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    })
  }

  /**
   * Supprime une dépense spéciale.
   * @throws 404 si la dépense n'existe pas ou n'appartient pas à l'utilisateur
   */
  async delete(userId: string, id: string) {
    const expense = await this.prisma.specialExpense.findFirst({ where: { id, userId } })
    if (!expense) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Dépense spéciale introuvable') }
    }
    await this.prisma.specialExpense.delete({ where: { id } })
  }

  /**
   * Retourne les dépenses spéciales non complétées à venir dans les N prochains jours.
   * Utilisé par le cron de rappels pour identifier les dépenses à notifier.
   * @param days - Fenêtre temporelle en jours (défaut : 7)
   */
  async getUpcoming(userId: string, days: number = 7) {
    const now = new Date()
    const future = new Date(now)
    future.setDate(future.getDate() + days)

    return this.prisma.specialExpense.findMany({
      where: {
        userId,
        isCompleted: false,
        scheduledDate: { gte: now, lte: future },
      },
      orderBy: { scheduledDate: 'asc' },
    })
  }
}
