import { PrismaClient } from '@prisma/client'
import { CreateExpenseInput, UpdateExpenseInput, ExpenseQueryInput } from './expenses.schema.js'
import { fail } from '../../utils/response.js'

/** En-têtes du fichier CSV exporté. */
const CSV_HEADERS = ['Date', 'Catégorie', 'Montant', 'Devise', 'Description', 'Récurrent', 'Budget']

/** Échappe une valeur pour l'inclusion dans une cellule CSV. */
function csvCell(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value)
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str
}

/** Seuils de consommation du budget déclenchant une alerte (50%, 80%, 100%). */
const ALERT_THRESHOLDS = [0.5, 0.8, 1.0] as const

export class ExpensesService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Crée une dépense et synchronise automatiquement le budget du mois.
   *
   * Comportement dans la transaction :
   * 1. Insère la dépense en base.
   * 2. Recherche le budget correspondant au mois de la dépense.
   * 3. Si la catégorie est budgétisée, incrémente `BudgetCategory.spent`.
   * 4. Vérifie si un seuil (50 / 80 / 100 %) vient d'être franchi et génère une alerte.
   *
   * @param userId - UUID de l'utilisateur connecté
   * @param input  - Données de la dépense (montant, catégorie, date, etc.)
   * @returns La dépense créée et une alerte budget si un seuil est franchi
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
   * Retourne la liste paginée des dépenses avec filtres optionnels.
   *
   * @param userId - UUID de l'utilisateur connecté
   * @param query  - Filtres : page, limit, categoryId, période (from/to), budgetId
   * @returns Liste paginée des dépenses + meta (total, pages)
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
   *
   * @param userId - UUID de l'utilisateur connecté
   * @param id     - Identifiant de la dépense
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
   *
   * Si le montant ou la catégorie change, la transaction :
   * 1. Soustrait l'ancien montant de l'ancienne catégorie budget.
   * 2. Ajoute le nouveau montant à la nouvelle catégorie budget.
   * 3. Met à jour la dépense.
   *
   * @param userId - UUID de l'utilisateur connecté
   * @param id     - Identifiant de la dépense
   * @param input  - Champs à modifier (tous optionnels)
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
          // Annule l'ancienne contribution sur l'ancienne catégorie
          const oldCat = budget.categories.find((c) => c.categoryId === expense.categoryId)
          if (oldCat) {
            await tx.budgetCategory.update({
              where: { id: oldCat.id },
              data: { spent: Math.max(0, Number(oldCat.spent) - Number(expense.amount)) },
            })
          }

          // Applique le nouveau montant sur la nouvelle catégorie
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
   * Supprime une dépense et décrémente `BudgetCategory.spent` pour maintenir la cohérence.
   *
   * @param userId - UUID de l'utilisateur connecté
   * @param id     - Identifiant de la dépense
   * @throws 404 si la dépense n'existe pas ou n'appartient pas à l'utilisateur
   */
  /**
   * Génère un export CSV de toutes les dépenses d'un utilisateur sur une période donnée.
   * Retourne une chaîne CSV encodée UTF-8 avec BOM pour compatibilité Excel.
   *
   * @param userId   - UUID de l'utilisateur connecté
   * @param from     - Date de début (optionnel)
   * @param to       - Date de fin (optionnel)
   * @param currency - Devise de l'utilisateur (ex: XOF)
   */
  async exportCsv(userId: string, from?: Date, to?: Date, currency = 'XOF'): Promise<string> {
    const expenses = await this.prisma.expense.findMany({
      where: {
        userId,
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: { category: true, budget: { select: { month: true, year: true } } },
      orderBy: { date: 'desc' },
    })

    const rows = expenses.map((e) => [
      csvCell(new Date(e.date).toLocaleDateString('fr-FR')),
      csvCell(e.category.name),
      csvCell(Number(e.amount)),
      csvCell(currency),
      csvCell(e.description),
      csvCell(e.isRecurring ? 'Oui' : 'Non'),
      csvCell(e.budget ? `${e.budget.month}/${e.budget.year}` : ''),
    ].join(','))

    // BOM UTF-8 pour compatibilité Excel
    return '﻿' + [CSV_HEADERS.join(','), ...rows].join('\n')
  }

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
