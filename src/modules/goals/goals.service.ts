import { PrismaClient } from '@prisma/client'
import { CreateGoalInput, UpdateGoalInput, AddContributionInput } from './goals.schema.js'
import { fail, getBudgetPercentage } from '../../utils/response.js'

export class GoalsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Crée un nouvel objectif d'épargne.
   * Les 5 dernières contributions sont incluses dans la réponse pour un affichage immédiat.
   */
  async create(userId: string, input: CreateGoalInput) {
    const goal = await this.prisma.savingGoal.create({
      data: {
        userId,
        name: input.name,
        targetAmount: input.targetAmount,
        monthlyTarget: input.monthlyTarget,
        deadline: input.deadline,
        icon: input.icon,
        color: input.color,
      },
      include: { contributions: { orderBy: { date: 'desc' }, take: 5 } },
    })
    return this.formatGoal(goal)
  }

  /**
   * Retourne tous les objectifs d'un utilisateur, triés par échéance croissante.
   * @param status - Filtre optionnel : ACTIVE | COMPLETED | CANCELLED
   */
  async findAll(userId: string, status?: string) {
    const goals = await this.prisma.savingGoal.findMany({
      where: {
        userId,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        contributions: { orderBy: { date: 'desc' }, take: 5 },
      },
      orderBy: { deadline: 'asc' },
    })
    return goals.map(this.formatGoal)
  }

  /**
   * Retourne un objectif avec son historique complet de contributions.
   * @throws 404 si l'objectif n'existe pas ou n'appartient pas à l'utilisateur
   */
  async findOne(userId: string, id: string) {
    const goal = await this.prisma.savingGoal.findFirst({
      where: { id, userId },
      include: { contributions: { orderBy: { date: 'desc' } } },
    })
    if (!goal) throw { statusCode: 404, ...fail('NOT_FOUND', 'Objectif introuvable') }
    return this.formatGoal(goal)
  }

  /**
   * Met à jour les métadonnées d'un objectif (nom, montant cible, deadline, icône, couleur).
   * @throws 404 si l'objectif n'existe pas ou n'appartient pas à l'utilisateur
   */
  async update(userId: string, id: string, input: UpdateGoalInput) {
    const goal = await this.prisma.savingGoal.findFirst({ where: { id, userId } })
    if (!goal) throw { statusCode: 404, ...fail('NOT_FOUND', 'Objectif introuvable') }

    const updated = await this.prisma.savingGoal.update({
      where: { id },
      data: input,
      include: { contributions: { orderBy: { date: 'desc' }, take: 5 } },
    })
    return this.formatGoal(updated)
  }

  /**
   * Ajoute une contribution à un objectif et met à jour le montant courant.
   * Passe automatiquement le statut à COMPLETED si le montant cible est atteint.
   * @throws 404 si l'objectif n'existe pas
   * @throws 400 si l'objectif n'est plus actif (COMPLETED ou CANCELLED)
   */
  async addContribution(userId: string, goalId: string, input: AddContributionInput) {
    const goal = await this.prisma.savingGoal.findFirst({ where: { id: goalId, userId } })
    if (!goal) throw { statusCode: 404, ...fail('NOT_FOUND', 'Objectif introuvable') }
    if (goal.status !== 'ACTIVE') {
      throw { statusCode: 400, ...fail('GOAL_INACTIVE', "Cet objectif n'est plus actif") }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.goalContribution.create({
        data: {
          goalId,
          amount: input.amount,
          date: input.date,
          note: input.note,
        },
      })

      const newAmount = Number(goal.currentAmount) + input.amount

      return tx.savingGoal.update({
        where: { id: goalId },
        data: {
          currentAmount: newAmount,
          status: newAmount >= Number(goal.targetAmount) ? 'COMPLETED' : 'ACTIVE',
        },
        include: { contributions: { orderBy: { date: 'desc' }, take: 5 } },
      })
    })

    const formatted = this.formatGoal(updated)
    const message =
      formatted.status === 'COMPLETED'
        ? `🎉 Félicitations ! Objectif "${formatted.name}" atteint !`
        : `Contribution de ${input.amount} FCFA ajoutée`

    return { goal: formatted, message }
  }

  /**
   * Génère le récap mensuel des objectifs actifs : montant contribué vs objectif mensuel.
   * Inclut un conseil personnalisé pour chaque objectif non atteint.
   */
  async getMonthlyRecap(userId: string, month: number, year: number) {
    const goals = await this.prisma.savingGoal.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        contributions: {
          where: {
            date: {
              gte: new Date(year, month - 1, 1),
              lt: new Date(year, month, 1),
            },
          },
        },
      },
    })

    return goals.map((g) => {
      const monthContrib = g.contributions.reduce((s, c) => s + Number(c.amount), 0)
      const target = Number(g.monthlyTarget) || 0
      const achieved = target > 0 ? monthContrib >= target : false

      return {
        id: g.id,
        name: g.name,
        monthlyTarget: target,
        amountContributed: monthContrib,
        achieved,
        shortfall: Math.max(0, target - monthContrib),
        advice:
          !achieved && target > 0
            ? `Il te manquait ${target - monthContrib} FCFA pour atteindre ton objectif "${g.name}"`
            : null,
      }
    })
  }

  /**
   * Supprime un objectif et toutes ses contributions (cascade Prisma).
   * @throws 404 si l'objectif n'existe pas ou n'appartient pas à l'utilisateur
   */
  async delete(userId: string, id: string) {
    const goal = await this.prisma.savingGoal.findFirst({ where: { id, userId } })
    if (!goal) throw { statusCode: 404, ...fail('NOT_FOUND', 'Objectif introuvable') }
    await this.prisma.savingGoal.delete({ where: { id } })
  }

  /**
   * Enrichit un objectif brut avec les champs calculés :
   * remaining, percentage, daysLeft et montants en nombre (vs Decimal Prisma).
   */
  private formatGoal(goal: any) {
    const current = Number(goal.currentAmount)
    const target = Number(goal.targetAmount)
    const percentage = getBudgetPercentage(current, target)
    const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000)

    return {
      ...goal,
      currentAmount: current,
      targetAmount: target,
      remaining: Math.max(0, target - current),
      percentage,
      daysLeft,
      contributions: goal.contributions?.map((c: any) => ({
        ...c,
        amount: Number(c.amount),
      })),
    }
  }
}
