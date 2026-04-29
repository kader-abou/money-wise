import { PrismaClient } from '@prisma/client'
import { CreateExpenseInput, UpdateExpenseInput, ExpenseQueryInput } from './expenses.schema.js'
import { fail } from '../../utils/response.js'

const ALERT_THRESHOLDS = [0.5, 0.8, 1.0] as const

export class ExpensesService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Crée une dépense et met à jour le `spent` de la catégorie budget correspondante.
   * Déclenche une alerte si un seuil (50%, 80%, 100%) est franchi.
   * Tout s'effectue dans une transaction atomique pour garantir la cohérence budget/dépense.
   */
  async create(userId: string, input: CreateExpenseInput) {
    const expense = await this.prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          userId,
          budgetId: input.budgetId,
          categoryId: input.categoryId,
          amount: input.amount,
          description: input.description,
          date: input.date,
          isRecurring: input.isRecurring ?? false,
        },
        include: { category: true },
      })

      const expDate = new Date(input.date)
      const budget = await tx.budget.findFirst({
        where: {
          userId,
          month: expDate.getMonth() + 1,
          year: expDate.getFullYear(),
        },
        include: { categories: true },
      })

      let budgetAlert: string | null = null

      if (budget) {
        const catBudget = budget.categories.find((c) => c.categoryId === input.categoryId)
        if (catBudget) {
          const newSpent = Number(catBudget.spent) + input.amount
          await tx.budgetCategory.update({
            where: { id: catBudget.id },
            data: { spent: newSpent },
          })

          const total = Number(catBudget.amount)
          const prevRatio = Number(catBudget.spent) / total
          const newRatio = newSpent / total

          for (const threshold of ALERT_THRESHOLDS) {
            if (prevRatio < threshold && newRatio >= threshold) {
              const pct = Math.round(threshold * 100)
              budgetAlert = `⚠️ Tu as atteint ${pct}% de ton budget ${exp.category.name.toLowerCase()}`
              break
            }
          }
        }
      }

      return { expense: exp, budgetAlert }
    })

    return expense
  }

  /**
   * Retourne la liste paginée des dépenses d'un utilisateur avec filtres optionnels.
   * @param query - Filtres : page, limit, categoryId, période (from/to), budgetId
   */
  async findAll(userId: string, query: ExpenseQueryInput) {
    const { page, limit, categoryId, from, to, budgetId } = query
    const skip = (page - 1) * limit

    const where: any = {
      userId,
      ...(categoryId ? { categoryId } : {}),
      ...(budgetId ? { budgetId } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    }

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: { category: true },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ])

    return {
      expenses: expenses.map((e) => ({ ...e, amount: Number(e.amount) })),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    }
  }

  /**
   * Retourne une dépense par son ID.
   * @throws 404 si la dépense n'existe pas ou n'appartient pas à l'utilisateur
   */
  async findOne(userId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, userId },
      include: { category: true },
    })
    if (!expense) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Dépense introuvable') }
    }
    return { ...expense, amount: Number(expense.amount) }
  }

  /**
   * Met à jour une dépense et recalcule le `spent` des catégories budget impactées.
   * Si le montant ou la catégorie change, l'ancien montant est annulé et le nouveau appliqué (transaction atomique).
   * @throws 404 si la dépense n'existe pas ou n'appartient pas à l'utilisateur
   */
  async update(userId: string, id: string, input: UpdateExpenseInput) {
    const expense = await this.prisma.expense.findFirst({ where: { id, userId } })
    if (!expense) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Dépense introuvable') }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.amount !== undefined || input.categoryId !== undefined) {
        const expDate = new Date(expense.date)
        const budget = await tx.budget.findFirst({
          where: {
            userId,
            month: expDate.getMonth() + 1,
            year: expDate.getFullYear(),
          },
          include: { categories: true },
        })

        if (budget) {
          const oldCat = budget.categories.find((c) => c.categoryId === expense.categoryId)
          if (oldCat) {
            await tx.budgetCategory.update({
              where: { id: oldCat.id },
              data: { spent: Math.max(0, Number(oldCat.spent) - Number(expense.amount)) },
            })
          }

          const newCategoryId = input.categoryId ?? expense.categoryId
          const newCat = budget.categories.find((c) => c.categoryId === newCategoryId)
          if (newCat) {
            await tx.budgetCategory.update({
              where: { id: newCat.id },
              data: { spent: Number(newCat.spent) + (input.amount ?? Number(expense.amount)) },
            })
          }
        }
      }

      return tx.expense.update({
        where: { id },
        data: {
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.date ? { date: input.date } : {}),
        },
        include: { category: true },
      })
    })

    return { ...updated, amount: Number(updated.amount) }
  }

  /**
   * Supprime une dépense et décrémente le `spent` de la catégorie budget correspondante.
   * @throws 404 si la dépense n'existe pas ou n'appartient pas à l'utilisateur
   */
  async delete(userId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, userId } })
    if (!expense) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Dépense introuvable') }
    }

    await this.prisma.$transaction(async (tx) => {
      const expDate = new Date(expense.date)
      const budget = await tx.budget.findFirst({
        where: {
          userId,
          month: expDate.getMonth() + 1,
          year: expDate.getFullYear(),
        },
        include: { categories: true },
      })

      if (budget) {
        const catBudget = budget.categories.find((c) => c.categoryId === expense.categoryId)
        if (catBudget) {
          await tx.budgetCategory.update({
            where: { id: catBudget.id },
            data: { spent: Math.max(0, Number(catBudget.spent) - Number(expense.amount)) },
          })
        }
      }

      await tx.expense.delete({ where: { id } })
    })
  }
}
