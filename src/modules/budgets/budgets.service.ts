import { PrismaClient } from '@prisma/client'
import { CreateBudgetInput, UpdateBudgetInput } from './budgets.schema.js'
import { fail, getBudgetPercentage, BudgetStatus } from '../../utils/response.js'

function computeStatus(spent: number, total: number): BudgetStatus {
  if (total === 0) return 'green'
  const pct = spent / total
  if (pct > 1) return 'black'
  if (pct >= 0.8) return 'red'
  if (pct >= 0.5) return 'orange'
  return 'green'
}

const categoryInclude = { categories: { include: { category: true } } }

export class BudgetsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Crée un budget mensuel avec ses catégories.
   * Vérifie que la somme des catégories ne dépasse pas le budget total.
   * @throws 409 si un budget existe déjà pour ce mois/année
   * @throws 400 si le total des catégories dépasse le budget
   */
  async create(userId: string, input: CreateBudgetInput) {
    const existing = await this.prisma.budget.findUnique({
      where: { userId_month_year: { userId, month: input.month, year: input.year } },
    })

    if (existing) {
      throw {
        statusCode: 409,
        ...fail('BUDGET_EXISTS', `Un budget existe déjà pour ${input.month}/${input.year}`),
      }
    }

    const catTotal = input.categories.reduce((sum, c) => sum + c.amount, 0)
    if (catTotal > input.totalAmount) {
      throw {
        statusCode: 400,
        ...fail(
          'CATEGORY_OVERFLOW',
          `La somme des catégories (${catTotal}) dépasse le budget total (${input.totalAmount})`,
        ),
      }
    }

    const budget = await this.prisma.budget.create({
      data: {
        userId,
        month: input.month,
        year: input.year,
        totalAmount: input.totalAmount,
        note: input.note,
        categories: {
          create: input.categories.map((c) => ({
            categoryId: c.categoryId,
            amount: c.amount,
          })),
        },
      },
      include: categoryInclude,
    })

    return this.formatBudget(budget)
  }

  /**
   * Retourne tous les budgets d'un utilisateur, avec filtres optionnels par mois/année.
   * Résultats triés du plus récent au plus ancien.
   */
  async findAll(userId: string, month?: number, year?: number) {
    const budgets = await this.prisma.budget.findMany({
      where: {
        userId,
        ...(month ? { month } : {}),
        ...(year ? { year } : {}),
      },
      include: categoryInclude,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })

    return budgets.map(this.formatBudget)
  }

  /**
   * Retourne le budget du mois en cours.
   * @throws 404 si aucun budget n'existe pour le mois actuel
   */
  async findCurrent(userId: string) {
    const now = new Date()
    const budget = await this.prisma.budget.findUnique({
      where: {
        userId_month_year: {
          userId,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      },
      include: categoryInclude,
    })

    if (!budget) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Aucun budget pour ce mois') }
    }

    return this.formatBudget(budget)
  }

  /**
   * Retourne un budget spécifique par son ID.
   * @throws 404 si le budget n'existe pas ou n'appartient pas à l'utilisateur
   */
  async findOne(userId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, userId },
      include: categoryInclude,
    })

    if (!budget) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Budget introuvable') }
    }

    return this.formatBudget(budget)
  }

  /**
   * Met à jour un budget (montant total, note, ou catégories).
   * Si les catégories sont fournies, elles remplacent intégralement les anciennes (transaction atomique).
   * @throws 404 si le budget n'existe pas ou n'appartient pas à l'utilisateur
   */
  async update(userId: string, id: string, input: UpdateBudgetInput) {
    const budget = await this.prisma.budget.findFirst({ where: { id, userId } })
    if (!budget) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Budget introuvable') }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.categories) {
        await tx.budgetCategory.deleteMany({ where: { budgetId: id } })
        await tx.budgetCategory.createMany({
          data: input.categories.map((c) => ({
            budgetId: id,
            categoryId: c.categoryId,
            amount: c.amount,
          })),
        })
      }

      return tx.budget.update({
        where: { id },
        data: {
          ...(input.totalAmount ? { totalAmount: input.totalAmount } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
        include: categoryInclude,
      })
    })

    return this.formatBudget(updated)
  }

  /**
   * Supprime un budget et ses catégories associées (cascade Prisma).
   * @throws 404 si le budget n'existe pas ou n'appartient pas à l'utilisateur
   */
  async delete(userId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({ where: { id, userId } })
    if (!budget) {
      throw { statusCode: 404, ...fail('NOT_FOUND', 'Budget introuvable') }
    }
    await this.prisma.budget.delete({ where: { id } })
  }

  /**
   * Enrichit un budget brut Prisma avec les champs calculés :
   * totalSpent, remaining, percentage et status (green/orange/red/black) — pour le budget global et chaque catégorie.
   */
  private formatBudget(budget: any) {
    const spent = Number(
      budget.categories?.reduce((s: number, c: any) => s + Number(c.spent), 0) ?? 0,
    )
    const total = Number(budget.totalAmount)
    const percentage = getBudgetPercentage(spent, total)
    const status = computeStatus(spent, total)

    return {
      ...budget,
      totalAmount: total,
      totalSpent: spent,
      remaining: total - spent,
      percentage,
      status,
      categories: budget.categories?.map((c: any) => {
        const catSpent = Number(c.spent)
        const catTotal = Number(c.amount)
        return {
          ...c,
          amount: catTotal,
          spent: catSpent,
          remaining: catTotal - catSpent,
          percentage: getBudgetPercentage(catSpent, catTotal),
          status: computeStatus(catSpent, catTotal),
          category: c.category,
        }
      }),
    }
  }
}
