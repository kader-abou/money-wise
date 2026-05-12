import { PrismaClient } from '@prisma/client'

type Period = 'day' | 'week' | 'month' | 'quarter' | 'semester' | 'year'

/**
 * Calcule la plage de dates [from, to] pour une période donnée.
 * La semaine commence le lundi (standard ISO 8601 européen).
 *
 * @param period        - Granularité : day | week | month | quarter | semester | year
 * @param referenceDate - Date de référence (défaut : aujourd'hui)
 */
function getDateRange(period: Period, referenceDate: Date = new Date()) {
  const d = new Date(referenceDate)
  d.setHours(0, 0, 0, 0)

  switch (period) {
    case 'day':
      return {
        from: new Date(d),
        to: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59),
      }
    case 'week': {
      const day = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((day + 6) % 7))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      sunday.setHours(23, 59, 59)
      return { from: monday, to: sunday }
    }
    case 'month':
      return {
        from: new Date(d.getFullYear(), d.getMonth(), 1),
        to: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
      }
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3)
      return {
        from: new Date(d.getFullYear(), q * 3, 1),
        to: new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59),
      }
    }
    case 'semester': {
      const s = d.getMonth() < 6 ? 0 : 6
      return {
        from: new Date(d.getFullYear(), s, 1),
        to: new Date(d.getFullYear(), s + 6, 0, 23, 59, 59),
      }
    }
    case 'year':
      return {
        from: new Date(d.getFullYear(), 0, 1),
        to: new Date(d.getFullYear(), 11, 31, 23, 59, 59),
      }
  }
}

export class StatsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Retourne un résumé complet des dépenses pour une période donnée.
   *
   * Contient :
   * - Total dépensé et nombre de transactions
   * - Répartition par catégorie (montant + % du total) triée par montant décroissant
   * - Comparaison avec le budget du mois (uniquement si `period === 'month'`)
   * - Conseils automatiques basés sur les seuils de dépenses
   *
   * @param userId - UUID de l'utilisateur connecté
   * @param period - Granularité de la période
   * @param date   - Date de référence (défaut : aujourd'hui)
   */
  async getSummary(userId: string, period: Period, date?: Date) {
    const { from, to } = getDateRange(period, date)

    const expenses = await this.prisma.expense.findMany({
      where: { userId, date: { gte: from, lte: to } },
      include: { category: true },
    })

    const total = expenses.reduce((s, e) => s + Number(e.amount), 0)

    const byCategoryMap: Record<string, { name: string; icon: string | null; color: string | null; amount: number }> = {}
    for (const e of expenses) {
      const key = e.categoryId
      if (!byCategoryMap[key]) {
        byCategoryMap[key] = { name: e.category.name, icon: e.category.icon, color: e.category.color, amount: 0 }
      }
      byCategoryMap[key].amount += Number(e.amount)
    }

    const distribution = Object.entries(byCategoryMap)
      .map(([categoryId, data]) => ({
        categoryId,
        ...data,
        percentage: total > 0 ? Math.round((data.amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)

    let budgetComparison = null
    if (period === 'month') {
      const refDate = date || new Date()
      const budget = await this.prisma.budget.findUnique({
        where: {
          userId_month_year: {
            userId,
            month: refDate.getMonth() + 1,
            year: refDate.getFullYear(),
          },
        },
      })
      if (budget) {
        const budgetTotal = Number(budget.totalAmount)
        budgetComparison = {
          budgeted: budgetTotal,
          spent: total,
          remaining: budgetTotal - total,
          percentage: budgetTotal > 0 ? Math.round((total / budgetTotal) * 100) : 0,
        }
      }
    }

    const advice = this.generateAdvice(distribution, budgetComparison)

    return { period, from, to, total, count: expenses.length, distribution, budgetComparison, advice }
  }

  /**
   * Retourne l'évolution mensuelle des dépenses sur N mois glissants.
   * Optimisé : une seule requête DB pour toute la période, agrégation en mémoire.
   * Utile pour afficher un graphique de tendance dans l'app.
   *
   * @param userId  - UUID de l'utilisateur connecté
   * @param months  - Nombre de mois à inclure (défaut : 6)
   */
  async getTrend(userId: string, months: number = 6) {
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const expenses = await this.prisma.expense.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
      select: { amount: true, date: true },
    })

    const result = []
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const month = d.getMonth() + 1
      const year = d.getFullYear()

      const monthExpenses = expenses.filter((e) => {
        const ed = new Date(e.date)
        return ed.getMonth() + 1 === month && ed.getFullYear() === year
      })

      result.push({
        month,
        year,
        label: d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
        total: monthExpenses.reduce((s, e) => s + Number(e.amount), 0),
        count: monthExpenses.length,
      })
    }

    return result
  }

  /**
   * Retourne les N dépenses les plus élevées pour une période et une date données.
   *
   * @param userId  - UUID de l'utilisateur connecté
   * @param period  - Granularité de la période
   * @param limit   - Nombre de dépenses à retourner (défaut : 5, max : 20)
   * @param date    - Date de référence (défaut : aujourd'hui)
   */
  async getTopExpenses(userId: string, period: Period, limit: number = 5, date?: Date) {
    const { from, to } = getDateRange(period, date)

    const expenses = await this.prisma.expense.findMany({
      where: { userId, date: { gte: from, lte: to } },
      include: { category: true },
      orderBy: { amount: 'desc' },
      take: limit,
    })

    return expenses.map((e) => ({ ...e, amount: Number(e.amount) }))
  }

  /**
   * Génère des conseils textuels automatiques basés sur l'analyse des dépenses.
   *
   * Règles appliquées :
   * - Alerte si une catégorie dépasse 40% du total des dépenses
   * - Alerte rouge si le budget mensuel est dépassé (>= 100%)
   * - Alerte orange si 80% du budget est consommé
   * - Félicitation si moins de 50% du budget est utilisé
   *
   * @param distribution    - Répartition des dépenses par catégorie
   * @param budgetComparison - Comparaison budget/dépenses (null si aucun budget défini)
   */
  private generateAdvice(
    distribution: { name: string; amount: number; percentage: number }[],
    budgetComparison: any,
  ): string[] {
    const advice: string[] = []

    for (const cat of distribution) {
      if (cat.percentage > 40) {
        advice.push(
          `📊 La catégorie "${cat.name}" représente ${cat.percentage}% de tes dépenses. ` +
            `Essaie de la réduire à 30% maximum.`,
        )
      }
    }

    if (budgetComparison && budgetComparison.percentage >= 100) {
      advice.push(
        `⛔ Tu as dépassé ton budget du mois de ${Math.abs(budgetComparison.remaining).toLocaleString()} FCFA. ` +
          `Réduis les dépenses non essentielles.`,
      )
    } else if (budgetComparison && budgetComparison.percentage >= 80) {
      advice.push(
        `🟠 Tu as consommé ${budgetComparison.percentage}% de ton budget. ` +
          `Il reste ${budgetComparison.remaining.toLocaleString()} FCFA pour le reste du mois.`,
      )
    }

    if (budgetComparison && budgetComparison.percentage < 50) {
      advice.push(
        `🟢 Excellente gestion ! Tu n'as utilisé que ${budgetComparison.percentage}% de ton budget. ` +
          `Pense à placer le surplus en épargne.`,
      )
    }

    return advice
  }
}
